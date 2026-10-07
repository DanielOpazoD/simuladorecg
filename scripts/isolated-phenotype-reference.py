#!/usr/bin/env python3
"""Metadata-first development cohort; original voltage without median rescaling."""
import argparse
import ast
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import math
from pathlib import Path

spec = importlib.util.spec_from_file_location('original_reader', Path(__file__).with_name('ptbxl-original-reference.py'))
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
reader = original.m
PROTOCOL = Path(__file__).resolve().parents[1] / 'docs/reference-protocols/isolated-phenotypes-v1.json'


def labels(value):
    parsed = ast.literal_eval(value)
    if not isinstance(parsed, dict) or any(not isinstance(k, str) or isinstance(v, bool)
        or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 100
        for k, v in parsed.items()):
        raise ValueError('Invalid diagnostic labels or likelihoods')
    return parsed


def select(rows, protocol):
    if protocol['developmentFolds'] != list(range(1, 9)) or protocol['requiredTargetLikelihood'] != 100 or protocol['allowedAdditionalLabels'] != ['SR'] or protocol['minimumAgeYears'] != 18 or not protocol['excludeWholePatientIfAnyHeldoutRecord'] or not protocol['excludePatientsWithMultipleEligibleGroups']:
        raise ValueError('Unreviewed cohort isolation or held-out policy')
    groups = protocol['groups']
    if len(set(groups)) != len(groups) or not groups:
        raise ValueError('Invalid group list')
    cap = protocol['maximumPatientsPerGroup']
    if isinstance(cap, bool) or not isinstance(cap, int) or cap <= 0:
        raise ValueError('Invalid cohort cap')
    seen, heldout, candidates = set(), set(), defaultdict(list)
    reasons = Counter()
    for row in rows:
        ecg, patient, fold = (reader.integer(row[k]) for k in ['ecg_id', 'patient_id', 'strat_fold'])
        if ecg in seen or fold not in range(1, 11):
            raise ValueError('Duplicate ECG or invalid fold')
        seen.add(ecg)
        if fold not in protocol['developmentFolds']:
            heldout.add(patient)
        code = labels(row['scp_codes'])
        age = reader.number(row.get('age'))
        # PTB-XL encodes ages above 89 with values >=300; those remain adults.
        if age is None or age < protocol['minimumAgeYears']:
            reasons['age-ineligible'] += 1
            continue
        matching = [g for g in groups if code.get(g) == protocol['requiredTargetLikelihood']
                    and set(code) <= {g, *protocol['allowedAdditionalLabels']}]
        if len(matching) != 1:
            reasons['not-isolated-target-label'] += 1
            continue
        stem = original.original_path(row, ecg)
        candidates[patient].append({'ecg_id': ecg, 'patient_id': patient, 'fold': fold,
                                    'group': matching[0], 'sourcePath': stem})
    pools = {g: [] for g in groups}
    excluded_heldout = excluded_multiple = 0
    for patient, records in candidates.items():
        if patient in heldout:
            excluded_heldout += 1
            continue
        if len({r['group'] for r in records}) != 1:
            excluded_multiple += 1
            continue
        record = min(records, key=lambda r: r['ecg_id'])
        pools[record['group']].append(record)
    selected, counts = [], {}
    for group, records in pools.items():
        records.sort(key=lambda r: (reader.digest(f"{protocol['seed']}:{r['patient_id']}".encode()), r['ecg_id']))
        chosen = records[:cap]
        selected.extend(chosen)
        counts[group] = {'eligiblePatients': len(records), 'selectedPatients': len(chosen),
                         'requestedMaximum': cap, 'belowRequestedMaximum': len(chosen) < cap,
                         'clinicalCalibrationEligible': False}
    return {'schemaVersion': 1, 'role': protocol['role'], 'metadataRecords': len(seen),
            'recordExclusions': dict(sorted(reasons.items())), 'heldoutPatientsExcluded': excluded_heldout,
            'multiGroupPatientsExcluded': excluded_multiple, 'groups': counts, 'records': selected,
            'clinicalValidation': False, 'generatorTuned': False}


def frozen_selection(metadata_bytes):
    pbytes = PROTOCOL.read_bytes()
    p = json.loads(pbytes)
    if reader.digest(metadata_bytes) != p['metadataSha256']:
        raise ValueError('Metadata differs from pinned release')
    result = select(list(reader.read_rows(metadata_bytes)), p)
    result = {**result, 'metadataSha256': p['metadataSha256'], 'protocolSha256': reader.digest(pbytes)}
    registered = json.loads((PROTOCOL.parent.parent / 'evidence/isolated-phenotypes-selection.json').read_text())
    if result != registered:
        raise ValueError('Selection differs from the registered metadata-only cohort')
    return result, p


def acquire(selection, protocol, raw_root, output):
    release = reader.Release('ptb-xl', protocol['version'], raw_root)
    if release.manifest_hash != protocol['releaseManifestSha256']:
        raise ValueError('Release manifest differs from pinned source')
    actual, _ = frozen_selection(release.get('ptbxl_database.csv'))
    if selection != actual:
        raise ValueError('Selection changed after metadata pre-registration')
    output.mkdir(parents=True, exist_ok=True)
    records = []
    files = [r['sourcePath'] + suffix for r in selection['records'] for suffix in ['.hea', '.dat']]
    if any(name not in release.sums for name in files):
        raise ValueError('Selected original pair absent from release manifest')
    # Bounded network I/O only; validation and export retain selection order.
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(release.download, files))
    for record in selection['records']:
        stem = record['sourcePath']
        header, raw = release.get(stem + '.hea'), release.get(stem + '.dat')
        original.validate_original_header(header, stem)
        signal, check = reader.crosscheck(header, raw)
        # Strict finite values and original scale. Range does not delineate QRS/T.
        ranges = {lead: original.finite_range(signal['leads'][lead]) for lead in reader.LEADS}
        body = {**record, 'fs': signal['fs'], 'units': 'mV', 'leads': signal['leads'],
                'calibration': signal['calibration'], 'readerCrosscheck': check,
                'role': protocol['role'], 'clinicalValidation': False}
        filename = f"original-{record['ecg_id']}.json"
        reader.write(output / filename, body)
        records.append({**record, 'filename': filename,
                        'sha256': reader.digest((output / filename).read_bytes()),
                        'headerSha256': reader.digest(header), 'dataSha256': reader.digest(raw),
                        'wholeRecordPeakToPeakMv': ranges, 'readerCrosscheck': check})
    report = {'schemaVersion': 1, 'selection': selection, 'records': records,
              'manifestSha256': release.manifest_hash, 'verifiedFiles': release.files,
              'clinicalValidation': False, 'generatorTuned': False, 'rescalingApplied': False,
              'limitation': 'Whole-record ranges are not QRS/T amplitudes or clinical normal ranges. Metadata isolation is not clinical adjudication.'}
    reader.write(output / 'acquisition-report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--selection', type=Path, required=True)
    parser.add_argument('--raw-root', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result, protocol = frozen_selection(args.metadata.read_bytes())
    if args.output:
        if not args.raw_root or not args.selection.is_file():
            parser.error('Acquisition requires an existing selection and raw-root')
        saved = json.loads(args.selection.read_text())
        if saved != result:
            raise ValueError('Supplied selection does not match pinned metadata/protocol')
        report = acquire(saved, protocol, args.raw_root, args.output)
        print(json.dumps({'records': len(report['records']), 'groups': result['groups'], 'clinicalValidation': False}))
    else:
        reader.write(args.selection, result)
        print(json.dumps({'groups': result['groups'], 'records': len(result['records']), 'clinicalValidation': False}))
