#!/usr/bin/env python3
"""Acquire only the frozen prospective T-end cohort; never invoke a detector."""
import argparse, hashlib, importlib.util, json, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROTOCOL=ROOT/'docs/t-end-reserved-protocol.json'
def prepare(output:Path,crosscheck:bool=False):
    protocol_bytes=PROTOCOL.read_bytes(); p=json.loads(protocol_bytes)
    original=ROOT/'tests/reference/ludb-delineation/protocol.json'
    if hashlib.sha256(original.read_bytes()).hexdigest()!=p['historicalProtocolSha256']:
        raise ValueError('Historical selection protocol drift')
    old=json.loads(original.read_bytes())
    if p['cohort']['records']!=old['holdout']['records']:
        raise ValueError('Reserved records changed')
    ids=[i for i in range(1,201) if i not in p['excludedRecords']]
    selected=sorted(sorted(ids,key=lambda i:hashlib.sha256(f"{p['cohort']['seed']}:{i}".encode()).hexdigest())[:40])
    if selected!=p['cohort']['records']:
        raise ValueError('Deterministic reserved selection mismatch')
    if subprocess.check_output(['git','diff',p['candidateCommit'],'--','src'],cwd=ROOT):
        raise ValueError('Frozen product source changed before acquisition')
    for file,digest in p['files'].items():
        if hashlib.sha256((ROOT/file).read_bytes()).hexdigest()!=digest:
            raise ValueError('Frozen evaluator/reader changed: '+file)
    spec=importlib.util.spec_from_file_location('ludb_reader',ROOT/'tests/reference/ludb/prepare_ludb.py')
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    fetch=module.fetch
    def retry(name,raw):
        for attempt in range(3):
            try:return fetch(name,raw)
            except Exception:
                if attempt==2:raise
                time.sleep(2**attempt)
    module.fetch=retry; module.SPLITS={'reserved-tend-v1':p['cohort']['records']}
    module.prepare(output,preserve_unassigned=True)
    fixtures=output/'fixtures'; manifest_path=fixtures/'manifest.json'
    manifest=json.loads(manifest_path.read_bytes())
    manifest.update(protocolSha256=hashlib.sha256(protocol_bytes).hexdigest(),
        cohortRole=p['cohort']['role'],selection=p['cohort']['selectionRule'],reservedHoldoutDownloaded=True)
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    (output/'protocol.json').write_bytes(protocol_bytes)
    if crosscheck:
        import numpy as np, wfdb
        counts={'records':0,'physicalSamples':0,'annotationEvents':0}
        for record in p['cohort']['records']:
            meta=json.loads((fixtures/f'reserved-tend-v1/{record}.json').read_text())
            original=wfdb.rdrecord(str(output/f'raw/data/{record}'))
            raw=np.fromfile(fixtures/f'reserved-tend-v1/{record}.dat',dtype='<i2').reshape(meta['samples'],len(meta['channels']))
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
          'detectorEvaluated':False,'holdoutDownloaded':True}
        (output/'reader-crosscheck.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--crosscheck',action='store_true')
    a=ap.parse_args(); prepare(a.output,a.crosscheck)
