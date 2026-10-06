"""Record-separated AF timing development/evaluation. No waveform or model fitting here."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import wfdb

ROOT=Path(__file__).resolve().parents[1]
BEATS=set('NLRBAaJSVrFejnE/fQ')
CONFOUNDERS=set('/fQ|~')

def digest(data): return hashlib.sha256(data).hexdigest()

def summarize_rr(rr):
    rr=np.asarray(rr,dtype=float)
    if len(rr)<2 or not np.isfinite(rr).all() or (rr<=0).any(): raise ValueError('Invalid RR')
    mean=float(np.mean(rr));sd=float(np.std(rr));q=np.quantile(rr/mean,[.05,.5,.95],method='linear')
    lag=None if np.std(rr[:-1])==0 or np.std(rr[1:])==0 else float(np.corrcoef(rr[:-1],rr[1:])[0,1])
    return {'intervals':len(rr),'meanSeconds':mean,'rate':60/mean,'cv':sd/mean,'normalizedQuantiles':q.tolist(),'lag1':lag}

def windows(samples,symbols,notes,end_sample,fs,window_seconds=60,minimum_intervals=20):
    if not np.isfinite(fs) or fs<=0 or end_sample<=0 or len(samples)!=len(symbols) or len(samples)!=len(notes): raise ValueError('Invalid annotation dimensions')
    samples=np.asarray(samples)
    if not np.isfinite(samples).all() or (np.diff(samples)<0).any(): raise ValueError('Invalid annotation chronology')
    outside=(samples<0)|(samples>=end_sample)
    if any(bad and (symbol in BEATS or symbol=='+') for bad,symbol in zip(outside,symbols)):
        raise ValueError('Physiological annotation outside recording')
    outside_ancillary=int(np.sum(outside))
    times=np.asarray([t for t,s in zip(samples,symbols) if s in BEATS]);types=np.asarray([s for s in symbols if s in BEATS])
    if (np.diff(times)<=0).any(): raise ValueError('Duplicate ventricular annotation')
    transitions=[(int(t),v) for t,s,v in zip(samples,symbols,notes) if s=='+' and v.startswith('(')]
    if any(b[0]<=a[0] for a,b in zip(transitions,transitions[1:])): raise ValueError('Ambiguous rhythm transitions')
    confounded=np.asarray([t for t,s in zip(samples,symbols) if s in CONFOUNDERS])
    rows=[];episodes=0;short=0;insufficient=0
    span=round(fs*window_seconds)
    if span<=0: raise ValueError('Invalid window duration')
    for i,(start,rhythm) in enumerate(transitions):
        if rhythm!='(AFIB': continue
        episodes+=1;stop=transitions[i+1][0] if i+1<len(transitions) else end_sample
        if stop-start<span: short+=1
        for lo in range(start,int(stop)-span+1,span):
            hi=lo+span;l,r=np.searchsorted(times,[lo,hi]);rr=np.diff(times[l:r])/fs
            if len(rr)<minimum_intervals: insufficient+=1;continue
            a,b=np.searchsorted(confounded,[lo,hi]);excluded=b>a
            rows.append({'startSample':lo,'stopSample':hi,'primaryEligible':not excluded,
                         'nonNBeats':int(np.sum(types[l:r]!='N')),'confoundingAnnotations':int(b-a),**summarize_rr(rr)})
    return {'episodes':episodes,'shortEpisodes':short,'insufficientWindows':insufficient,'outsideAncillaryAnnotations':outside_ancillary,'windows':rows}

def record_summary(rows):
    def median(values):
        v=[x for x in values if x is not None and np.isfinite(x)]
        return float(np.median(v)) if v else None
    return {'windows':len(rows),'medianCV':median([w['cv'] for w in rows]),'medianRate':median([w['rate'] for w in rows]),
            'medianNormalizedQuantiles':[median([w['normalizedQuantiles'][i] for w in rows]) for i in range(3)],'medianLag1':median([w['lag1'] for w in rows])}

def acquire(output,role):
    protocol_bytes=(ROOT/'docs/ltafdb-development-protocol.json').read_bytes();p=json.loads(protocol_bytes)
    source=output/'annotations';source.mkdir(parents=True,exist_ok=True)
    def get(name,expected=None):
        dest=source/name
        if dest.exists(): data=dest.read_bytes()
        else:
            failures=[]
            for base in ['https://physionet.org/files/ltafdb/1.0.0/','https://physionet-open.s3.amazonaws.com/ltafdb/1.0.0/']:
                try: data=urlopen(base+name,timeout=40).read();break
                except Exception as e: failures.append(str(e))
            else: raise RuntimeError((name,failures))
        if expected and digest(data)!=expected: raise ValueError('Release identity mismatch: '+name)
        dest.write_bytes(data);return data
    record_bytes=get('RECORDS',p['recordsManifestSha256']);manifest=get('SHA256SUMS.txt')
    sums={line.split()[1].lstrip('*'):line.split()[0] for line in manifest.decode().splitlines()}
    ranked=sorted(record_bytes.decode().split(),key=lambda n:digest((p['seed']+':'+n).encode()))
    if ranked[:16]!=p['developmentRecords'] or ranked[16:24]!=p['evaluationRecords']: raise ValueError('Selection changed')
    if role not in ['development','evaluation']: raise ValueError('Unknown cohort role')
    records=[];hashes={}
    for record in p[role+'Records']:
        for ext in ['hea','atr']:
            name=record+'.'+ext;data=get(name,sums[name]);hashes[name]=digest(data)
        h=wfdb.rdheader(str(source/record));a=wfdb.rdann(str(source/record),'atr')
        row=windows(a.sample,a.symbol,a.aux_note,h.sig_len,h.fs,p['windowSeconds'],p['minimumIntervals'])
        primary=[w for w in row['windows'] if w['primaryEligible']]
        row.update(record=record,fs=h.fs,durationSamples=h.sig_len,summary=record_summary(primary),allWindowsSummary=record_summary(row['windows']))
        records.append(row)
    result={'schemaVersion':1,'role':role,'protocol':p,'protocolSha256':digest(protocol_bytes),'sourceHashes':hashes,'manifestSha256':digest(manifest),
            'decoder':'wfdb '+wfdb.__version__,'scriptSha256':digest(Path(__file__).read_bytes()),'records':records,'clinicalValidation':False,'parametersFittedByReader':False}
    (output/(role+'-reference.json')).write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({r['record']:r['summary'] for r in records}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--role',choices=['development','evaluation'],required=True)
    args=parser.parse_args();acquire(args.output,args.role)
