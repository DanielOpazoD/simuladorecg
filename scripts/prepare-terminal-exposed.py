#!/usr/bin/env python3
"""Reproduce the already exposed failed-v1 cohort for development regression only."""
import argparse,importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    p=json.loads((ROOT/'docs/evidence/qt-reconciliation-v1-protocol.json').read_text())
    spec=importlib.util.spec_from_file_location('reader',ROOT/'tests/reference/ludb/prepare_ludb.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original=module.fetch
    def retry(name,raw):
        for attempt in range(3):
            try:return original(name,raw)
            except Exception:
                if attempt==2:raise
                time.sleep(2**attempt)
    module.fetch=retry;module.SPLITS={'qt-reconciliation-v1':p['cohort']['records']};module.prepare(args.output,preserve_unassigned=True)
    path=args.output/'fixtures/manifest.json';manifest=json.loads(path.read_text());manifest['cohortRole']='Exposed during failed v1 trial; development regression, never a new holdout';path.write_text(json.dumps(manifest,indent=2)+'\n')
