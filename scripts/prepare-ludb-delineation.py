#!/usr/bin/env python3
"""Prepare only the prospectively selected LUDB delineation calibration cohort.

The reserved holdout IDs are checked for deterministic selection but are never
downloaded by this script. No detector is executed here.
"""
import argparse, hashlib, importlib.util, json, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PROTOCOL=ROOT/'tests/reference/ludb-delineation/protocol.json'

def rank(seed, excluded, n=40):
    ids=[i for i in range(1,201) if i not in set(excluded)]
    return sorted(sorted(ids,key=lambda i:hashlib.sha256(f"{seed}:{i}".encode()).hexdigest())[:n])

def prepare(output:Path,crosscheck:bool=False):
    protocol_bytes=PROTOCOL.read_bytes(); p=json.loads(protocol_bytes)
    seen=p['previouslyObservedRecords']
    calibration=p['calibration']
    if rank(calibration['seed'],seen)!=calibration['records']:
        raise ValueError('Calibration cohort differs from prespecified hash selection')
    holdout=p['holdout']
    if rank(holdout['seed'],seen+calibration['records'])!=holdout['records']:
        raise ValueError('Holdout cohort differs from prespecified hash selection')
    if p.get('holdoutEnabled'):
        raise ValueError('Holdout must remain disabled in the calibration PR')

    spec=importlib.util.spec_from_file_location('ludb_reader',ROOT/'tests/reference/ludb/prepare_ludb.py')
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    fetch=module.fetch
    def retry(name,raw):
        for attempt in range(3):
            try:return fetch(name,raw)
            except Exception:
                if attempt==2:raise
                time.sleep(2**attempt)
    module.fetch=retry
    module.SPLITS={'delineation-calibration':calibration['records']}
    module.prepare(output,preserve_unassigned=True)
    fixtures=output/'fixtures'; manifest_path=fixtures/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    manifest['selection']=calibration['selectionRule']
    manifest['cohortRole']=calibration['role']
    manifest['protocolSha256']=hashlib.sha256(protocol_bytes).hexdigest()
    manifest['reservedHoldoutCount']=len(holdout['records'])
    manifest['reservedHoldoutDownloaded']=False
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (output/'protocol.json').write_bytes(protocol_bytes)

    if crosscheck:
        import numpy as np, wfdb
        counts={'records':0,'physicalSamples':0,'annotationEvents':0}
        for record in calibration['records']:
            meta=json.loads((fixtures/f'delineation-calibration/{record}.json').read_text())
            original=wfdb.rdrecord(str(output/f'raw/data/{record}'))
            raw=np.fromfile(fixtures/f'delineation-calibration/{record}.dat',dtype='<i2').reshape(meta['samples'],len(meta['channels']))
            for i,ch in enumerate(meta['channels']):
                values=(raw[:,i].astype(float)-ch['baseline'])/ch['adcGain']
                if not np.array_equal(values,original.p_signal[:,i]):
                    raise ValueError(f'Independent WFDB scaling disagreement: {record}/{ch["lead"]}')
                ann=wfdb.rdann(str(output/f'raw/data/{record}'),module.LEADS[i])
                events=[{'sample':int(s),'symbol':str(y)} for s,y in zip(ann.sample,ann.symbol)]
                if events!=meta['annotationEvents'][ch['lead']]:
                    raise ValueError(f'Independent WFDB annotations disagree: {record}/{ch["lead"]}')
                counts['annotationEvents']+=len(events); counts['physicalSamples']+=len(values)
            counts['records']+=1
        report={'reader':f'WFDB Python {wfdb.__version__}',**counts,
          'agreement':'Exact physical scaling in Float64 before loader Float32 conversion, symbols and indices',
          'detectorEvaluated':False,'holdoutDownloaded':False}
        (output/'reader-crosscheck.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--crosscheck',action='store_true')
    a=ap.parse_args(); prepare(a.output,a.crosscheck)
