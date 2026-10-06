#!/usr/bin/env python3
"""Descriptive conduction/ST-T reference, never a fit or a clinical acceptance range."""
import argparse
import ast
import csv
import hashlib
import io
import json
import math
from collections import Counter
from pathlib import Path

LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
COHORTS = {'CLBBB': 'lbbb', 'CRBBB': 'rbbb', 'WPW': 'wpw'}
FIELDS = {'jMv': 'ST_Amp', 'tPeakMv': 'T_Amp', 'qrsPeakToPeakMv': 'QRS_AmpPP'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)

def stats(values):
    a = sorted(x for x in values if finite(x))
    def q(p):
        if not a:
            return None
        k = (len(a)-1)*p
        lo, hi = math.floor(k), math.ceil(k)
        return a[lo]+(a[hi]-a[lo])*(k-lo)
    return {'total': len(values), 'n': len(a), 'missing': len(values)-len(a),
            'q25': q(.25), 'median': q(.5), 'q75': q(.75)}

def integer(value):
    n = float(value)
    if isinstance(value, bool) or not math.isfinite(n) or n != int(n) or n < 1:
        raise ValueError('Invalid positive integer identity')
    return int(n)

def selected_metadata(selection, metadata_bytes):
    if digest(metadata_bytes) != selection['metadataSha256']:
        raise ValueError('Metadata identity differs from the frozen selection')
    all_rows = list(csv.DictReader(io.StringIO(metadata_bytes.decode('utf-8-sig'))))
    by_id = {}
    reserved_patients = set()
    for row in all_rows:
        eid, patient, fold = integer(row['ecg_id']), integer(row['patient_id']), integer(row['strat_fold'])
        if fold > 10:
            raise ValueError('Invalid fold')
        if eid in by_id:
            raise ValueError('Duplicate metadata ECG')
        by_id[eid] = (patient, fold, row)
        if fold >= 9:
            reserved_patients.add(patient)
    selected, patients, ids = [], set(), set()
    for rec in selection['records']:
        eid = rec['ecg_id']
        if eid in ids or eid not in by_id:
            raise ValueError('Duplicate or unknown selected ECG')
        ids.add(eid)
        patient, fold, row = by_id[eid]
        if patient != rec['patient_id'] or fold != rec['fold'] or patient in patients or patient in reserved_patients:
            raise ValueError('Patient identity, independence or reserved-fold violation')
        patients.add(patient)
        codes = ast.literal_eval(row['scp_codes'])
        if not isinstance(codes, dict) or any(not isinstance(k, str) or not finite(v) or not 0 <= v <= 100 for k, v in codes.items()):
            raise ValueError('Malformed diagnostic likelihoods')
        selected.append((str(eid), codes))
    return selected

def report(selection, metadata_bytes, features, mapping, description_bytes, generated):
    selected = selected_metadata(selection, metadata_bytes)
    if set(features.get('groups', {})) != {eid for eid, _ in selected}:
        raise ValueError('Feature cohort differs from selected IDs')
    provider = mapping.get('12sl', {})
    identity = provider.get('conversion') == 'identity; published harmonized units' and provider.get('featureDescriptionSha256') == digest(description_bytes)
    if not identity:
        raise ValueError('Unverified feature description or conversion')
    cohorts = {}
    for code, preset in COHORTS.items():
        rows = [(eid, labels) for eid, labels in selected if labels.get(code, 0) > 0]
        labels = Counter(k for _, codes in rows for k in codes if k != code)
        leads = {}
        for lead in LEADS:
            fields = {}
            for field, column_prefix in FIELDS.items():
                column = column_prefix+'_'+lead
                verified = provider.get('columnUnits', {}).get(column) == 'mV'
                values = [features.get('tables', {}).get('12sl', {}).get(eid, {}).get(column) if verified else None for eid, _ in rows]
                if field == 'qrsPeakToPeakMv':
                    values = [x if finite(x) and x >= 0 else None for x in values]
                fields[field] = dict(stats(values), column=column, unit='mV' if verified else None,
                                     status='available' if verified and any(finite(x) for x in values) else 'missing' if verified else 'unverified-units')
            leads[lead] = fields
        synthetic = [r for r in generated.get('records', []) if r.get('preset') == preset and r.get('filter') == 'off']
        if len(synthetic) > 1:
            raise ValueError('Ambiguous synthetic exemplar')
        exemplar = {lead: {key: r.get('leads', {}).get(lead, {}).get(key) for key in FIELDS}
                    for r in synthetic for lead in LEADS}
        cohorts[code] = {'patients': len(rows), 'records': len(rows),
                        'likelihoods': stats([codes[code] for _, codes in rows]),
                        'cooccurringCodeCounts': dict(sorted(labels.items())),
                        'reference': leads, 'syntheticPreset': preset, 'syntheticUnfiltered': exemplar or None,
                        'smallSampleWarning': len(rows) < 20}
    return {'schemaVersion': 1, 'cohorts': cohorts, 'selectionPatients': len(selected),
            'clinicalValidation': False, 'coefficientsFitted': False, 'holdoutEvaluated': False,
            'waveformsRescaled': False, 'referenceProvider': '12sl harmonized feature table',
            'limitations': [
                'Already exposed development selection; not a clean nonischemic cohort or a new holdout.',
                'Diagnostic likelihood >0 defines membership. Co-occurring codes include labels whose likelihood is zero; they are not adjudicated diseases.',
                'ST_Amp is STJ, not J60. T_Amp is signed amplitude; automatic features are not manual truth.',
                'One synthetic exemplar uses generator timing windows; vendor feature methods differ. No paired patient error or fidelity score is inferred.',
                'Quartiles describe these patients only. Small groups and mixed diagnoses cannot calibrate general ST/T amplitudes.',
                'No Sgarbossa thresholds, accessory-pathway localization or post-ablation memory model is validated.']}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    names = ['selection.json', 'selected-features.json', 'reviewed-feature-mapping.json', 'feature_description.csv', 'generator-morphology.json']
    data = {n: (args.reference/n).read_bytes() for n in names}
    metadata = args.metadata.read_bytes()
    result = report(json.loads(data[names[0]]), metadata, json.loads(data[names[1]]), json.loads(data[names[2]]), data[names[3]], json.loads(data[names[4]]))
    result['inputSha256'] = {n: digest(v) for n, v in data.items()}
    result['inputSha256']['metadata'] = digest(metadata)
    result['sourceSha256'] = digest(Path(__file__).read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print(json.dumps({'patients': {k: v['patients'] for k, v in result['cohorts'].items()}, 'clinicalValidation': False}))

if __name__ == '__main__':
    main()
