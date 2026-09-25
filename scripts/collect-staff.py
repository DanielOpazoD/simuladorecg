"""Public STAFF-III development excerpts, selected before viewing waveforms.
Not imported by the application. Requires wfdb 4.3.0. Network acquisition is explicit.
"""
import gzip, hashlib, json, os, pathlib, tempfile, urllib.request
import wfdb
BASE='https://physionet.org/files/staffiii/1.0.0/'
# First two eligible IDs per artery, using only spreadsheet metadata:
# no prior MI, BC1, first inflation >=120s, no flagged lead reversal/ambiguous record,
# no annotated injection in inflation +40..80s. Next eligible IDs are reserved.
CASES=[(9,'LAD',131),(14,'LAD',110),(10,'RCA',30),(12,'RCA',15),(3,'LCX',34),(30,'LCX',0)]
RESERVED=[24,19,37]  # Do not acquire or inspect their ECG in this workflow.
out=pathlib.Path(os.environ.get('REFERENCE_OUTPUT','.sites-runtime/staff'));out.mkdir(parents=True,exist_ok=True)
def get(rel):
    with urllib.request.urlopen(BASE+rel,timeout=90) as r: return r.read()
checks={line.split()[-1].lstrip('*'):line.split()[0] for line in get('SHA256SUMS.txt').decode().splitlines() if line.strip()}
records=[]
with tempfile.TemporaryDirectory() as folder:
    root=pathlib.Path(folder)
    for patient,artery,d0 in CASES:
        item={'patient':patient,'artery':artery,'d0':d0,'acquisition':'Mason-Likar limb electrodes','segments':{}}
        for kind,suffix,start in [('baseline','b',20),('inflation','c',d0+50)]:
            rec=f'{patient:03d}{suffix}'; hea=get(f'data/{rec}.hea'); (root/f'{rec}.hea').write_bytes(hea)
            datfiles=sorted({line.split()[0] for line in hea.decode().splitlines()[1:] if line.strip() and not line.startswith('#')})
            provenance={}
            for name in datfiles:
                content=get('data/'+name); digest=hashlib.sha256(content).hexdigest()
                expected=checks.get('data/'+name)
                if expected is None or digest!=expected: raise ValueError('Source checksum mismatch: '+name)
                (root/name).write_bytes(content); provenance[name]=digest
            header=wfdb.rdheader(str(root/rec)); fs=header.fs
            signal=wfdb.rdrecord(str(root/rec),sampfrom=round(start*fs),sampto=round((start+10)*fs))
            item['segments'][kind]={'record':rec,'startS':start,'fs':fs,'leads':signal.sig_name,'units':signal.units,'samples':signal.p_signal.T.tolist(),'sha256':provenance,'header':hea.decode()}
        records.append(item)
    payload={'source':BASE,'license':'Open Data Commons Attribution License v1.0','selection':'metadata-only before waveform inspection; see docs/staff-selection-v1.4.md','reservedPatientsNotDownloaded':RESERVED,'records':records,'clinicalValidation':False}
    with gzip.open(out/'staff-development.json.gz','wt') as f: json.dump(payload,f,allow_nan=False)
print(json.dumps({'patients':len(records),'reserved':RESERVED,'output':str(out)}))
