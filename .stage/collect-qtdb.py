"""Preselected QTDB waveform reference; no product tuning and no automatic labels as truth."""
import json, importlib.util, hashlib, gzip, sys, subprocess
from pathlib import Path
import numpy as np
import wfdb
from wfdb.processing import xqrs_detect
ROOT=Path.cwd();out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('transport',ROOT/'scripts/ptbxl-benchmark.py');transport=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport)
release=transport.Release('qtdb','1.0.0',out/'raw')
records=release.get('RECORDS').decode().split();seed='ECG-Lab-boundary-QTDB-record-split-v1'
ranked=sorted(records,key=lambda x:hashlib.sha256((seed+':'+x).encode()).hexdigest())
selection={'seed':seed,'development':ranked[:12],'verification':ranked[12:24],'role':'Record-level split; distinct patients across originating databases not established; no diagnosis/outcome selection.'}
transport.write(out/'selection.json',selection)
rows=[]
for name in selection['development']:
 header=release.get(name+'.hea');raw=release.get(name+'.dat');a=release.get(name+'.q1c')
 record=wfdb.rdrecord(str(release.raw/name),physical=False)
 if record.fs!=250 or record.n_sig!=2 or set(record.fmt)!={'212'}:raise ValueError('Unexpected source dimensions/format')
 bits=np.frombuffer(raw,dtype=np.uint8).reshape(-1,3).astype(np.int64)
 d=np.empty((len(bits),2),dtype=np.int64);d[:,0]=bits[:,0]+((bits[:,1]&15)<<8);d[:,1]=bits[:,2]+((bits[:,1]>>4)<<8);d[d>=2048]-=4096
 if not np.array_equal(d,record.d_signal):raise ValueError('WFDB digital mismatch')
 if any(x<=0 for x in record.adc_gain) or any(x not in ('mV','uV') for x in record.units):raise ValueError('Missing explicit calibration')
 physical=(d-np.array(record.baseline))/np.array(record.adc_gain)
 independent=wfdb.rdrecord(str(release.raw/name))
 if not np.array_equal(physical,independent.p_signal):raise ValueError('WFDB physical mismatch')
 physical*=np.array([.001 if u=='uV' else 1 for u in record.units])
 valid=np.isfinite(physical).all() and not np.any(d==-2048)
 annotations={}
 for suffix in ['q1c','q2c']:
  if name+'.'+suffix not in release.sums:continue
  release.get(name+'.'+suffix);ann=wfdb.rdann(str(release.raw/name),suffix)
  annotations[suffix]=[{'sample':int(s),'symbol':str(y),'channel':int(c),'num':int(n),'subtype':int(t)} for s,y,c,n,t in zip(ann.sample,ann.symbol,ann.chan,ann.num,ann.subtype)]
 peaks=xqrs_detect(sig=physical[:,0],fs=250,verbose=False).tolist() if valid else []
 target=out/(name+'.f64');target.write_bytes(physical.astype('<f8').tobytes())
 rows.append({'record':name,'fs':250,'leads':record.sig_name,'samples':len(d),'units':'mV','signalFile':target.name,'signalSha256':transport.digest(target.read_bytes()),'valid':bool(valid),'annotations':annotations,'coarseQrsPeaks':peaks,'coarseDetector':'WFDB XQRS on fixed channel 0, defaults; no annotation used for detection'})
 print(json.dumps({'record':name,'valid':bool(valid),'manualEvents':{k:len(v) for k,v in annotations.items()}}),flush=True)
transport.write(out/'records.json',rows)
transport.write(out/'provenance.json',{'sourceFiles':release.files,'sourceManifestSha256':release.manifest_hash,'wfdb':wfdb.__version__,'selectionSha256':transport.digest((out/'selection.json').read_bytes()),'clinicalValidation':False,'manual':'q1c/q2c only; all pu variants excluded','source':'https://physionet.org/content/qtdb/1.0.0/','license':'https://physionet.org/content/qtdb/view-license/1.0.0/','processing':'Independent WFDB212 digital and scaling cross-check; native250Hz, float64mV; no resampling/filtering','splitLimit':'Records derive from several sources; patient-level independence not established.'})
(out/'NOTICE.txt').write_text('QT Database1.0.0, Laguna/Mark/Goldberger/Moody, Computers in Cardiology1997;24:673–676. ODC Attribution1.0. https://physionet.org/content/qtdb/1.0.0/\nDerived native samples and manual waveform annotations; no demographic/clinical comments.\n')
