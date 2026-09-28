import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureExternalTrace,captureTrace,comparisonExport,comparisonWindow,DEFAULT_COMPARISON_VIEW,
  hasGeneratorBeats,leadDifferences,traceMetricDifferences,traceStart,traceName,type ComparisonTrace} from '../src/ui/comparison-model';
import {LEADS,DEFAULT_CASE,type Signal} from '../src/engine/types';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {assessExternalWindow} from '../src/io/external-assessment';
import {externalWindow,parseWfdb16,type ExternalECG} from '../src/io/external-ecg';
import {fingerprintECG,type BuildProvenance} from '../src/io/external-review';
import {renderComparison} from '../src/render/comparison';

const build:BuildProvenance={appVersion:'1.5.0',commit:'a'.repeat(40),sourceSha256:'b'.repeat(64),analysisSourceSha256:'c'.repeat(64),dirty:false};
function record(fs=500,seconds=20):ExternalECG {
  return {fs,duration:seconds,samples:fs*seconds,
    leads:Object.fromEntries(LEADS.map((l,j)=>[l,Float64Array.from({length:fs*seconds},(_,i)=>Math.sin(i/fs*(j+1))+(j+1)*.01)])) as ExternalECG['leads'],
    provenance:{format:'csv',origin:'unverified',checksumVerified:false,channels:LEADS.map(lead=>({lead,gain:1,baseline:0,unit:'mV'}))}};
}
async function source(fs=500,start=0) {
  const r=record(fs),s=externalWindow(r,start/fs),assessment=assessExternalWindow(s),identity=await fingerprintECG(r);
  return {record:r,identity,assessment,measurement:assessment.analysisAllowed?analyzeSamples(s):null,startSample:start};
}
async function trace(fs=500,start=0){return captureExternalTrace(await source(fs,start),build);}
async function synthetic() {
  const r=record(500,10),s:Signal={fs:500,duration:10,leads:r.leads,truth:{hr:60,pr:160,qrs:90,qt:400,axis:55},
    events:{beats:[{time:1,kind:'normal',rr:1}],atria:[],spikes:[]},warnings:[]};
  return captureTrace(structuredClone(DEFAULT_CASE),s,analyzeSamples(r));
}
describe('A11: immutable external segments, provenance and source-aware comparison',()=>{
  it('copies the selected ten seconds in twelve leads, not the first ten by mistake',async()=>{
    const x=await source(500,1000),a=captureExternalTrace(x,build);
    assert.equal(a.signal.duration,10);assert.equal(traceStart(a),2);assert.match(traceName(a),/2.000–12.000/);
    assert.deepEqual(a.external.identity,x.identity);assert.equal(a.external.identity.samples,10000);
    for(const l of LEADS)assert.deepEqual(a.signal.leads[l],x.record.leads[l].slice(1000,6000));
    assert.equal(a.external.startSample,1000);
  });
  it('owns copies independent of original samples, measurement, identity, acquisition and build',async()=>{
    const x=await source(),localBuild=structuredClone(build),a=captureExternalTrace(x,localBuild),saved=structuredClone(a);
    x.record.leads.V6.fill(900);x.record.provenance.channels[0].gain=999;x.identity.sha256='d'.repeat(64);
    x.measurement!.hr=999;localBuild.commit='d'.repeat(40);assert.deepEqual(a,saved);
  });
  it('does not attach a case, diagnosis, truth or events to an external trace or export',async()=>{
    const a=await trace(),s=await synthetic(),x=comparisonExport(a,s,DEFAULT_COMPARISON_VIEW,'1.5.0');
    const exported=JSON.parse(JSON.stringify(x));
    assert.equal(exported.schemaVersion,2);assert.equal(exported.syntheticOnly,false);
    for(const key of ['case','events','truth','diagnosis','name']){
      assert.ok(!(key in a));assert.ok(!(key in a.signal));assert.ok(!(key in exported.A));
    }
    assert.equal(exported.A.sourceKind,'external');assert.equal(exported.B.sourceKind,'synthetic');
    assert.equal(exported.A.measurementMethod,'sample-only; no model audit');assert.equal(exported.A.recordIdentity.sha256,a.external.identity.sha256);
    assert.ok(exported.B.case);assert.ok(exported.B.events);assert.equal(exported.changedSettings,null);
  });
  for(const fs of [100,125,250,500,1000]) it(`preserves original samples and manual-only status at ${fs} Hz`,async()=>{
    const x=await source(fs),a=captureExternalTrace(x,build),exp=JSON.parse(JSON.stringify(comparisonExport(a,a,DEFAULT_COMPARISON_VIEW,'1.5.0')));
    assert.equal(a.signal.fs,fs);assert.equal(exp.A.fs,fs);assert.equal(exp.A.units,'mV');
    for(const lead of LEADS)assert.deepEqual(exp.A.leads[lead],Array.from(x.record.leads[lead].slice(0,fs*10)));
    if(fs!==500){assert.equal(exp.A.measurement,null);assert.equal(exp.A.assessment.analysisAllowed,false);assert.ok(exp.metrics.every((m:{delta:number|null})=>m.delta===null));}
  });
  for(const start of [-1,.5,5001,NaN,Infinity])it(`rejects invalid absolute selection ${start}`,async()=>{
    const x=await source();assert.throws(()=>captureExternalTrace({...x,startSample:start},build),/Identidad|ventana/);
  });
  it('rejects an identity with a different rate or record length',async()=>{
    const x=await source();assert.throws(()=>captureExternalTrace({...x,identity:{...x.identity,fs:250}},build));
    assert.throws(()=>captureExternalTrace({...x,identity:{...x.identity,samples:9000}},build));
  });
  it('rechecks analysis policy and refuses stale or fabricated assessments',async()=>{
    const x=await source();assert.throws(()=>captureExternalTrace({...x,assessment:{...x.assessment,analysisAllowed:false}},build));
    assert.throws(()=>captureExternalTrace({...x,measurement:null},build),/Aptitud/);
    const low=await source(250);assert.throws(()=>captureExternalTrace({...low,measurement:x.measurement},build),/Aptitud/);
  });
  it('rejects a measurement tied to a different relative window',async()=>{
    const x=await source();x.measurement!.window.end=20;assert.throws(()=>captureExternalTrace(x,build),/Ventana/);
  });
  it('returns zero RMS/bias for equivalent external copies without normalizing them',async()=>{
    const a=await trace(),b=structuredClone(a),rows=leadDifferences(a,b,comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW));
    for(const r of rows){assert.equal(r.samples,1000);assert.equal(r.coverage,1);assert.equal(r.biasMv,0);assert.equal(r.rmsMv,0);}
  });
  it('detects a known voltage difference only in its original lead',async()=>{
    const a=await trace(),b=structuredClone(a);b.signal.leads.V2=b.signal.leads.V2.map(v=>v+.25);
    const rows=leadDifferences(a,b,comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW));
    const r=rows.find(r=>r.lead==='V2')!;assert.ok(Math.abs(r.biasMv!-.25)<1e-12);assert.ok(Math.abs(r.rmsMv!-.25)<1e-12);
    assert.ok(rows.filter(r=>r.lead!=='V2').every(r=>r.maxAbsMv===0));
  });
  it('aligns two manual sample origins without time warping, interpolation or mutation',async()=>{
    const a=await trace(),b=await trace(),saved=structuredClone({a,b});
    const v={...DEFAULT_COMPARISON_VIEW,alignment:'manual' as const,manualA:500,manualB:1000};
    const w=comparisonWindow(a,b,v);assert.deepEqual(w,{startA:1,startB:2,duration:2,axisStart:0});
    const exp=JSON.parse(JSON.stringify(comparisonExport(a,b,v,'1.5.0')));
    assert.deepEqual(exp.alignmentSamples,{A:500,B:1000});assert.match(exp.alignmentSource,/operator-selected/);
    assert.deepEqual({a,b},saved);
  });
  for(const sample of [-1,1.5,5000,NaN,Infinity])it(`rejects a manual origin outside the copied sample grid: ${sample}`,async()=>{
    const a=await trace();assert.throws(()=>comparisonWindow(a,a,{...DEFAULT_COMPARISON_VIEW,alignment:'manual',manualA:sample}));
  });
  it('excludes missing end coverage instead of zero padding',async()=>{
    const a=await trace(),w=comparisonWindow(a,a,{...DEFAULT_COMPARISON_VIEW,alignment:'manual',manualA:4900,manualB:4900});
    for(const row of leadDifferences(a,a,w)){assert.equal(row.samples,100);assert.equal(row.coverage,.1);assert.equal(row.rmsMv,0);}
  });
  it('never uses generator alignment for a real record',async()=>{
    const a=await trace(),b=await synthetic();assert.equal(hasGeneratorBeats(a),false);
    assert.throws(()=>comparisonWindow(a,b,{...DEFAULT_COMPARISON_VIEW,alignment:'beat'}),/sintéticas/);
  });
  it('blocks mismatched fs without deleting or modifying either source',async()=>{
    const a=await trace(500),b=await trace(250),saved=structuredClone({a,b});
    assert.throws(()=>comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW),/Muestreo/);
    assert.throws(()=>comparisonExport(a,b,DEFAULT_COMPARISON_VIEW,'1.5.0'),/Muestreo/);
    assert.deepEqual({a,b},saved);
  });
  it('withholds all numeric deltas across different audit procedures',async()=>{
    const a=await trace(),b=await synthetic();a.measurement!.hr=60;b.measurement.hr=80;
    a.measurement!.evidence.hr.status=b.measurement.evidence.hr.status='usable';
    const r=traceMetricDifferences(a,b)[0];assert.equal(r.a,60);assert.equal(r.b,80);assert.equal(r.delta,null);assert.match(r.reasonDelta,/Procedimientos/);
  });
  it('allows a descriptive external/external delta with qualified compatible estimates',async()=>{
    const a=await trace(),b=structuredClone(a);a.measurement!.hr=60;b.measurement!.hr=80;
    a.measurement!.evidence.hr.status=b.measurement!.evidence.hr.status='usable';
    assert.equal(traceMetricDifferences(a,b)[0].delta,20);
    b.capturedWith.analysisSourceSha256='d'.repeat(64);assert.equal(traceMetricDifferences(a,b)[0].delta,null);
  });
  it('withholds deltas for unknown analyzer, absent values, review and unequal windows',async()=>{
    const a=await trace(),b=structuredClone(a);a.measurement!.hr=b.measurement!.hr=60;
    a.measurement!.evidence.hr.status=b.measurement!.evidence.hr.status='usable';
    for(const mutation of [
      (x:typeof b)=>{x.capturedWith.analysisSourceSha256='unknown';},
      (x:typeof b)=>{x.measurement!.hr=null;},
      (x:typeof b)=>{x.measurement!.evidence.hr.status='review';},
      (x:typeof b)=>{x.measurement!.window.end=8;},
    ]){const x=structuredClone(b);mutation(x);assert.equal(traceMetricDifferences(a,x)[0].delta,null);}
  });
  it('renders with shared geometric scale and preserves all samples/metadata',async()=>{
    const a=await trace(),b=await synthetic(),saved=structuredClone({a,b}),labels:string[]=[];
    const noop=()=>{},ctx=new Proxy({}, {get:()=>noop,set:()=>true});
    const canvas={style:{},setAttribute:(_key:string,value:string)=>labels.push(value),getContext:()=>ctx} as unknown as HTMLCanvasElement;
    const proof=renderComparison(canvas,a,b,DEFAULT_COMPARISON_VIEW,390);
    assert.equal(proof.geometry.width,900);assert.equal(proof.geometry.pxPerMv,18);assert.ok(labels.some(l=>l.includes('Archivo CSV')));
    assert.deepEqual({a,b},saved);
  });
  for(const id of [1,2,3,4])it(`copies all 60,000 physical samples from exposed LUDB development ${id}`,async()=>{
    const root='tests/reference/ludb/fixtures/development/',meta=JSON.parse(readFileSync(root+id+'.json','utf8'));
    const dat=readFileSync(root+id+'.dat'),n=5000;
    const channels=meta.channels as {lead:string;adcGain:number;baseline:number}[];
    const header=[`${id} 12 500 5000`,...channels.map((c,j)=>{
      let sum=0;for(let i=0;i<n;i++)sum=(sum+dat.readInt16LE((i*12+j)*2))&65535;
      return `${id}.dat 16 ${c.adcGain}(${c.baseline})/mV 16 0 ${dat.readInt16LE(j*2)} ${sum} 0 ${c.lead}`;
    })].join('\n');
    const r=parseWfdb16(header,dat.buffer.slice(dat.byteOffset,dat.byteOffset+dat.byteLength) as ArrayBuffer,`${id}.dat`);
    const assessment=assessExternalWindow(r),a=captureExternalTrace({record:r,identity:await fingerprintECG(r),assessment,measurement:assessment.analysisAllowed?analyzeSamples(r):null,startSample:0},build);
    for(const l of LEADS)assert.deepEqual(a.signal.leads[l],r.leads[l]);
  });
});
