#!/usr/bin/env python3
"""Download only the precommitted cohort; reuse the independently cross-checked reader.

No detector is executed here. Raw comments/demographics stay outside the repository
and public/; derived fixtures retain anonymized IDs, physical signals and annotations.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'tests/reference/ludb-expansion/protocol.json'


def prepare(output: Path, crosscheck: bool = False):
    protocol_bytes = PROTOCOL.read_bytes()
    p = json.loads(protocol_bytes)
    ranked = sorted(set(range(1, 201)) - set(p['excludedKnownRecords']),
                    key=lambda n: hashlib.sha256(f"{p['seed']}:{n}".encode()).hexdigest())
    if sorted(ranked[:40]) != p['records'] or p['version'] != '1.0.1':
        raise ValueError('Cohort differs from prespecified hash selection')
    spec = importlib.util.spec_from_file_location('ludb_reader', ROOT / 'tests/reference/ludb/prepare_ludb.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fetch = module.fetch

    def retry(name, raw):
        for attempt in range(3):
            try:
                return fetch(name, raw)
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    module.fetch = retry
    module.SPLITS = {'expansion': p['records']}
    module.prepare(output, preserve_unassigned=True)
    manifest_path = output / 'fixtures/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['selection'] = p['selectionRule']
    manifest['cohortRole'] = p['cohortRole']
    manifest['protocolSha256'] = hashlib.sha256(protocol_bytes).hexdigest()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (output / 'protocol.json').write_bytes(protocol_bytes)
    anomalies = []
    for record in p["records"]:
        meta = json.loads((output / f"fixtures/expansion/{record}.json").read_text())
        for lead, events in meta["unassignedBoundaryEvents"].items():
            if events:
                anomalies.append({"record": record, "lead": lead, "events": events})
    (output / "annotation-integrity.json").write_text(json.dumps({
        "unassignedBoundaries": anomalies,
        "totalUnassignedEvents": sum(len(a["events"]) for a in anomalies),
        "policy": "Preserved; no peak or nonadjacent fiducial inferred. No record removed."
    }, indent=2) + "\n")
    if crosscheck:
        import numpy as np
        import wfdb
        counts = {'records': 0, 'physicalSamples': 0, 'annotationEvents': 0}
        for record in p['records']:
            meta = json.loads((output / f'fixtures/expansion/{record}.json').read_text())
            original = wfdb.rdrecord(str(output / f'raw/data/{record}'))
            raw = np.fromfile(output / f'fixtures/expansion/{record}.dat', dtype='<i2').reshape(5000, 12)
            for i, ch in enumerate(meta['channels']):
                values = (raw[:, i].astype(float) - ch['baseline']) / ch['adcGain']
                if not np.array_equal(values, original.p_signal[:, i]):
                    raise ValueError(f'Independent WFDB scaling disagreement: {record}/{ch["lead"]}')
                ann = wfdb.rdann(str(output / f'raw/data/{record}'), module.LEADS[i])
                events = [{'sample': int(s), 'symbol': str(y)} for s, y in zip(ann.sample, ann.symbol)]
                if events != meta['annotationEvents'][ch['lead']]:
                    raise ValueError(f'Independent WFDB annotations disagree: {record}/{ch["lead"]}')
                counts['annotationEvents'] += len(events)
                counts['physicalSamples'] += len(values)
            counts['records'] += 1
        report = {'reader': f'WFDB Python {wfdb.__version__}', **counts,
                  'agreement': 'Exact scaling in Float64 before loader Float32 conversion, symbols and indices',
                  'detectorEvaluated': False}
        (output / 'reader-crosscheck.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--crosscheck', action='store_true', help='Requires wfdb==4.3.1; never a product dependency')
    args = parser.parse_args()
    prepare(args.output, args.crosscheck)
