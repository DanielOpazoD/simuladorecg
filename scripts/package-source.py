#!/usr/bin/env python3
"""Build the downloadable source from Git-visible project files, without nested ZIPs.

Requires Python 3 and Git. Run from any directory; --output defaults to public/.
The archive uses fixed ZIP timestamps and a SHA-256 manifest for reproducibility.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=root / 'public/ecg-lab-codigo.zip')
args = parser.parse_args()
output = args.output.resolve()
paths = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root
).decode().split('\0')
files = []
for name in sorted(set(filter(None, paths))):
    path = root / name
    if path.resolve() == output or name == 'public/ecg-lab-codigo.zip':
        continue
    if path.is_symlink():
        raise SystemExit(f'Symlinks are not packaged: {name}')
    if path.is_file():
        files.append((name, path.read_bytes(), bool(path.stat().st_mode & 0o111)))
manifest = {
    'version': json.loads((root / 'package.json').read_text())['version'],
    'files': {name: hashlib.sha256(data).hexdigest() for name, data, _ in files},
}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data, executable in files + [
        ('SOURCE-MANIFEST.json', (json.dumps(manifest, indent=2) + '\n').encode(), False)
    ]:
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = (0o100755 if executable else 0o100644) << 16
        archive.writestr(info, data, compresslevel=9)
with zipfile.ZipFile(output) as archive:
    bad = archive.testzip()
    if bad:
        raise SystemExit(f'Invalid ZIP member: {bad}')
    for name, expected in manifest['files'].items():
        if hashlib.sha256(archive.read(name)).hexdigest() != expected:
            raise SystemExit(f'Hash mismatch: {name}')
print(json.dumps({'output': str(output), 'version': manifest['version'],
                  'files': len(files), 'bytes': output.stat().st_size}))
