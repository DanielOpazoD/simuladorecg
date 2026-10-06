#!/usr/bin/env python3
"""Stage only authenticated NSTDB1.0.0 bytes; never cache evaluation outputs."""
import argparse
import hashlib
import json
from pathlib import Path

MANIFEST_SHA256 = 'b76bd98c5111439fcfff2f410afd70d64e79f072049c45b5a9916a3044fdb84f'
FILES = tuple(f'{record}.{ext}' for record in ('bw', 'ma', 'em') for ext in ('hea', 'dat'))


def verified(source: Path):
    if source.is_symlink():
        raise ValueError('Source directory is a symlink')
    manifest_path = source / 'SHA256SUMS.txt'
    if manifest_path.is_symlink():
        raise ValueError('Manifest is a symlink')
    manifest = manifest_path.read_bytes()
    if hashlib.sha256(manifest).hexdigest() != MANIFEST_SHA256:
        raise ValueError('NSTDB release manifest fingerprint mismatch')
    sums = {}
    for line in manifest.decode().splitlines():
        digest, name = line.split(maxsplit=1)
        name = name.lstrip('*').removeprefix('./')
        if name in sums:
            raise ValueError('Duplicate manifest entry')
        sums[name] = digest
    result = {'SHA256SUMS.txt': manifest}
    for name in FILES:
        path = source / name
        if path.is_symlink():
            raise ValueError(f'Source is a symlink: {name}')
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != sums.get(name):
            raise ValueError(f'Source checksum mismatch: {name}')
        result[name] = data
    return result


def stage(source: Path, destination: Path):
    files = verified(source)  # Authenticate everything before writing anything.
    if destination.is_symlink():
        raise ValueError('Destination is a symlink')
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        target = destination / name
        if target.is_symlink():
            raise ValueError(f'Destination file is a symlink: {name}')
    for name, data in files.items():
        (destination / name).write_bytes(data)
    return {'files': len(files), 'bytes': sum(map(len, files.values())), 'manifestSha256': MANIFEST_SHA256}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('restore', 'save'))
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--raw', type=Path, required=True)
    args = parser.parse_args()
    source, destination = (args.cache / 'nstdb', args.raw / 'nstdb') if args.mode == 'restore' else (args.raw / 'nstdb', args.cache / 'nstdb')
    try:
        report = {'status': 'verified-' + args.mode, **stage(source, destination)}
    except (OSError, ValueError) as error:
        if args.mode == 'save':
            raise
        # Nothing from a rejected cache reaches the frozen reader; normal official acquisition follows.
        report = {'status': 'cold-acquisition', 'cacheRejected': str(error)}
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
