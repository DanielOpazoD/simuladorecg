"""Descriptive TP texture comparison. No optimization, diagnostic claim or holdout claim."""
import sys,json,hashlib,re,math,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/fidelity'))
import numpy as np
from features import detect_beats,_bp,LEADS
from wfdb import read
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True,help='Outside-repository folder containing real/ and synthetic exports')
args=parser.parse_args();out=args.output.resolve()
if out==ROOT or ROOT in out.parents:raise SystemExit('Keep raw waveforms and reports outside the repository')
if (out/'reference-texture-report.json').exists():raise SystemExit('Report already exists; preserve it and use a fresh output folder')
selection_path=ROOT/'benchmarks/acquisition-cleanliness/reference-selection.json'
selection=json.loads(selection_path.read_text(encoding='utf-8'))
synthetics=json.loads((out/'synthetic-reference-index.json').read_text(encoding='utf-8'))
hashfile=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
FS=500

def diagnostic(x):
    # Same causal 0.05 Hz first-order recurrence as src/engine/filter.ts,
    # applied once at 500 Hz to both cohorts. Source waveforms are never changed.
    a=math.exp(-2*math.pi*.05/FS);y=np.zeros(x.shape[1]);prev=x[0].copy();z=np.empty_like(x)
    for i,v in enumerate(x):y=a*(y+v-prev);z[i]=y;prev=v
    return z

def inspect_record(x,identity):
    assert x.shape==(5000,12) and np.isfinite(x).all()
    filtered=diagnostic(x)
    pk=detect_beats(filtered)
    hf=_bp(filtered,25,249)
    windows=[];included=[]
    for p,q in zip(pk[:-1],pk[1:]):
        span=q-p;lo=int(p+.55*span);hi=int(q-max(int(.25*span),110))
        reason='too-short (<30 ms)' if hi-lo<15 else 'within 1 s boundary guard' if lo<500 or hi>4500 else None
        windows.append({'precedingPeakSeconds':float(p/FS),'followingPeakSeconds':float(q/FS),'startSeconds':lo/FS,'endSeconds':hi/FS,'samples':max(0,hi-lo),'excludedReason':reason})
        if reason is None:included.append((lo,hi))
    result={**identity,'detectedPeaksSeconds':(pk/FS).tolist(),'windows':windows,'includedWindows':len(included),'excludedWindows':sum(w['excludedReason'] is not None for w in windows),'tpSamples':sum(hi-lo for lo,hi in included),'byLead':{}}
    if not included:result['failure']='no eligible heuristic TP windows';return result,filtered
    for j,lead in enumerate(LEADS):
        segs=[hf[lo:hi,j]*1000 for lo,hi in included];pooled=np.concatenate(segs);centered=pooled-pooled.mean();variance=np.mean(centered**2)
        rms=np.array([np.sqrt(np.mean(v**2)) for v in segs]);levels=np.array([np.median(filtered[lo:hi,j])*1000 for lo,hi in included])
        result['byLead'][lead]={'hfMedianSegmentRmsUv':float(np.median(rms)),'hfPooledRmsUv':float(np.sqrt(np.mean(pooled**2))),'hfAbsP99Uv':float(np.quantile(np.abs(pooled),.99)),'hfAbsMaxUv':float(np.max(np.abs(pooled))),'hfKurtosis':float(np.mean(centered**4)/variance**2) if variance>0 else None,'hfLogRmsStd':float(np.std(np.log(np.maximum(rms,1e-9)))),'tpMedianLevelStdUv':float(np.std(levels)),'tpMedianLevelRangeUv':float(np.ptp(levels))}
    return result,filtered

records=[];header_audits=[];plots={}
for row in selection['records']:
    for ext,expected in row['files'].items():
        original=out/'real'/expected['path']
        assert hashfile(original)==expected['sha256'] and original.stat().st_size==expected['bytes'],'Original file checksum mismatch'
    path=out/'real'/row['filename_hr'];lines=[l for l in path.with_suffix('.hea').read_text().splitlines() if l and not l.startswith('#')]
    head=lines[0].split();channels=int(head[1]);fs=float(head[2]);n=int(head[3]);gain_units=[l.split()[2] for l in lines[1:1+channels]]
    assert fs==500 and channels==12 and n==5000
    assert all('/mV' in g for g in gain_units),gain_units
    assert path.with_suffix('.dat').stat().st_size==n*channels*2
    fs,names,x=read(str(path));assert [v.upper() for v in names]==[v.upper() for v in LEADS]
    header_audits.append({'recordId':row['recordId'],'fs':fs,'samples':n,'channels':channels,'gainUnits':gain_units,'datSha256':hashfile(path.with_suffix('.dat')),'heaSha256':hashfile(path.with_suffix('.hea')),'fullSampleCount':True})
    r,f=inspect_record(x,{'cohort':'real-exploratory','recordId':row['recordId'],'patientId':row['patientId'],'fold':row['fold']});records.append(r)
    if row==selection['records'][0]:plots['real']=(f,row)
for row in synthetics['records']:
    assert hashfile(out/row['file'])==row['sha256'],'Synthetic export checksum mismatch'
    x=np.fromfile(out/row['file'],dtype='<f4').reshape(row['samples'],12).astype(float)
    r,f=inspect_record(x,{'cohort':row['cohort'],'seed':row['seed'],'profile':row['profile'],'sourceSha256':row['sha256']});records.append(r)
    if row['seed']==12066:plots[row['profile']]=(f,row)

metric_keys=['hfMedianSegmentRmsUv','hfAbsP99Uv','hfAbsMaxUv','hfKurtosis','hfLogRmsStd','tpMedianLevelStdUv','tpMedianLevelRangeUv']
summary={}
for group,chosen in [('real-exploratory',[r for r in records if r['cohort']=='real-exploratory'])]+[(p,[r for r in records if r.get('profile')==p and r['cohort']=='predeclared-synthetic-reserve']) for p in ['resting-v1','quiet-v1','ideal']]:
    summary[group]={'records':len(chosen),'failures':sum('failure' in r for r in chosen),'byLead':{}}
    for lead in LEADS:
        summary[group]['byLead'][lead]={}
        for key in metric_keys:
            values=[r['byLead'][lead][key] for r in chosen if lead in r['byLead'] and r['byLead'][lead][key] is not None]
            summary[group]['byLead'][lead][key]={'n':len(values),'p10':float(np.quantile(values,.1)) if values else None,'median':float(np.median(values)) if values else None,'p90':float(np.quantile(values,.9)) if values else None,'maximum':float(np.max(values)) if values else None}
report={'schemaVersion':1,'scope':'Descriptive comparison only; selected real patients are not an accredited independent holdout; no clinical validation.','sourceHashes':{'selection':hashfile(selection_path),'features.py':hashfile(ROOT/'scripts/fidelity/features.py'),'wfdb.py':hashfile(ROOT/'scripts/fidelity/wfdb.py'),'syntheticIndex':hashfile(out/'synthetic-reference-index.json')},'commonProcessing':{'fs':500,'highpassHz':.05,'applicationCount':1,'method':'causal first-order recurrence, initialized to first sample; one second excluded at both ends','syntheticGenerationFilter':'off; internal antialias remains','hfMeasurementHz':[25,249],'tpRule':'existing features.py: preceding energy peak +0.55RR to next peak -max(0.25RR,220ms); >=30ms','driftMetric':'STD/range of per-window TP medians; not a pure isolated artifact measurement'},'limitations':['Original recorder filtering and synthetic antialias are not the same acquisition chain.','TP windows are heuristic, not independently annotated T/P boundaries; some residual physiological content can remain.','NORM-only exploratory reference cannot validate disease morphology.','Synthetic reserve means predeclared seeds only, not independently acquired patients.','No parameter selection based on these results; factor0.5 fixed beforehand.','No clinical reviewer and no clinical plausibility upgrade.'],'headerAudits':header_audits,'records':records,'summary':summary}
report['sourceHashes']['characterize.py']=hashfile(__file__)
report['provenanceRevision']='Post-reproduction provenance-only hardening; numeric algorithm unchanged'
with (out/'reference-texture-report.json').open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)

fig,axs=plt.subplots(3,1,figsize=(12,13),layout='constrained',sharex=True,sharey=True)
for ax,key,label,color in zip(axs,['real','resting-v1','quiet-v1'],['Real exploratorio: primer registro seleccionado (673) · II','Sintético histórico: resting-v1 · semilla de desarrollo 12066 · II','Candidato: quiet-v1 · misma semilla 12066 · II'],['#4a4a4a','#bf5954','#087777']):
    x,row=plots[key];lo=1000;hi=2500;t=np.arange(lo,hi)/500
    # Constant display translation only; preserves amplitude, drift and samples.
    window=x[lo:hi,1];ax.plot(t,window-np.median(window),lw=1.15,color=color)
    ax.set_title(label,loc='left',fontsize=11);ax.set_xlim(2,5);ax.set_ylim(-.5,2);ax.set_ylabel('mV');ax.set_aspect(.4)
    ax.xaxis.set_major_locator(MultipleLocator(.2));ax.xaxis.set_minor_locator(MultipleLocator(.04));ax.yaxis.set_major_locator(MultipleLocator(.5));ax.yaxis.set_minor_locator(MultipleLocator(.1))
    ax.grid(which='major',color='#e7bfc5',lw=.6);ax.grid(which='minor',color='#f5e6e9',lw=.4);ax.spines[['top','right']].set_visible(False)
axs[-1].set_xlabel('Tiempo del registro (s)')
fig.suptitle('Textura de adquisición: referencia y dos perfiles sintéticos',fontsize=15,fontweight='bold')
fig.supxlabel('Escalas idénticas: división grande = 0,2 s y 0,5 mV (25 mm/s, 10 mm/mV).\nUn solo paso común de 0,05 Hz a 500 Hz; origen vertical centrado por mediana. No son pacientes emparejados.\nReferencia exploratoria, no reserva independiente ni validación clínica. Ondas originales conservadas.',fontsize=9)
fig.savefig(out/'reference-legacy-quiet.png',dpi=160)
print(json.dumps({g:{'records':v['records'],'failures':v['failures'],'II':{k:v['byLead']['II'][k]['median'] for k in metric_keys},'V2':{k:v['byLead']['V2'][k]['median'] for k in metric_keys}} for g,v in summary.items()},indent=2))
