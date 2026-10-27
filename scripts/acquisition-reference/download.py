"""Download the frozen exploratory selection; verify every file, never reselect."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
out = args.output.resolve()
if out == ROOT or ROOT in out.parents:
    raise SystemExit('Keep original patient waveforms outside the repository')
out.mkdir(parents=True, exist_ok=True)
if (out / 'waveform-downloads.json').exists():
    raise SystemExit('Download report exists; preserve it and use a fresh folder')
manifest = ROOT / 'benchmarks/acquisition-cleanliness/reference-selection.json'
selection = json.loads(manifest.read_text(encoding='utf-8'))
jobs = [f for row in selection['records'] for f in row['files'].values()]


def fetch(expected):
    rel = expected['path']
    path = out / 'real' / rel
    if not path.resolve().is_relative_to(out / 'real'):
        raise ValueError('Invalid relative path in selection')
    path.parent.mkdir(parents=True, exist_ok=True)
    attempts = []
    for attempt in range(3):
        try:
            if path.exists():
                data = path.read_bytes()
            else:
                with urllib.request.urlopen(selection['mirror'] + rel, timeout=40) as response:
                    data = response.read()
            actual = hashlib.sha256(data).hexdigest()
            if actual != expected['sha256'] or len(data) != expected['bytes']:
                failed = path.with_name(path.name + f'.failed-attempt-{attempt + 1}')
                if not failed.exists():
                    failed.write_bytes(data)
                raise ValueError(f'SHA256/size mismatch: {rel}; failed bytes preserved')
            if not path.exists():
                with path.open('xb') as target:
                    target.write(data)
            return {'path': rel, 'sha256': actual, 'bytes': len(data),
                    'officialChecksumMatch': True, 'failedAttempts': attempts}
        except Exception as exc:
            attempts.append({'attempt': attempt + 1, 'error': str(exc)})
    return {'path': rel, 'failed': True, 'failedAttempts': attempts}


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(fetch, jobs))
report = {'source': selection['mirror'], 'selectionSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
          'records': len(selection['records']), 'files': results,
          'failedFiles': sum(bool(r.get('failed')) for r in results),
          'clinicalValidation': False, 'independenceEstablished': False}
with (out / 'waveform-downloads.json').open('x', encoding='utf-8') as target:
    json.dump(report, target, indent=2)
print(json.dumps({'files': len(results), 'failedFiles': report['failedFiles'],
                  'bytes': sum(r.get('bytes', 0) for r in results)}))
if report['failedFiles']:
    raise SystemExit(1)
