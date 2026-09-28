import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LEADS, type Lead, type Measurement } from '../src/engine/types';
import { analyzeSamples } from '../src/engine/sample-analysis';
import { externalWindow, exportECGCsv, parseECGCsv, type ExternalECG } from '../src/io/external-ecg';
import { assessExternalWindow, evaluateExternalWindow, assertExternalSamples } from '../src/io/external-assessment';
import { fingerprintECG, importReview, intervalMs, ManualHistory, MAX_REVIEW_BYTES, reviewSidecar,
  validateBounds, type BuildProvenance, type ManualAnnotation, type SignalIdentity } from '../src/io/external-review';
import { validateExternalReply } from '../src/ui/external-protocol';
import { renderReviewTrace, sampleAtReviewPoint, reviewPointAtSample } from '../src/render/external-review';

const build: BuildProvenance = {appVersion:'1.5.0', commit:'a'.repeat(40), sourceSha256:'b'.repeat(64), analysisSourceSha256:'c'.repeat(64), dirty:false};
function fixture(fs = 500): ExternalECG {
  const samples = fs * 10;
  return {fs, samples, duration:10, leads:Object.fromEntries(LEADS.map((l,j) => [l,
    Float64Array.from({length:samples}, (_,i) => Math.sin(i / fs * (j + 1.3) * 6) * (j + 1) / 10)])) as ExternalECG['leads'],
    provenance:{format:'csv', origin:'unverified', checksumVerified:false, channels:LEADS.map(lead => ({lead,gain:1,baseline:0,unit:'mV'}))}};
}
function ludb(id = 1): ExternalECG {
  const root = 'tests/reference/ludb/fixtures/development/';
  const m = JSON.parse(readFileSync(root + id + '.json','utf8')), dat = readFileSync(root + id + '.dat');
  const r = fixture(500);
  for (let j=0;j<12;j++) {
    const channel = m.channels[j];
    r.leads[channel.lead as Lead] = Float64Array.from({length:5000}, (_,i) => (dat.readInt16LE((i*12+j)*2)-channel.baseline)/channel.adcGain);
  }
  return r;
}
function annotation(id = 1): ManualAnnotation { return {id, lead:'II', kind:'QRS', startSample:500, endSample:550, origin:'manual', createdWith:{...build}}; }
const copy = <T>(value:T):T => structuredClone(value);
function canvas() {
  const ctx = new Proxy({measureText:()=>({width:30})}, {get:(t,k)=>Reflect.get(t,k) ?? (()=>{}),set:(t,k,v)=>Reflect.set(t,k,v)});
  return {style:{}, getContext:()=>ctx, setAttribute:()=>{}} as unknown as HTMLCanvasElement;
}

describe('A05 readable is not clinically validated or analytically eligible', () => {
  for (const fs of [100,125,250,500,1000]) it(`${fs} Hz: explicit domain and exact sample resolution, no resampling`, () => {
    const input = fixture(fs), before = copy(input);
    const result = assessExternalWindow(input);
    assert.equal(result.analysisAllowed, fs === 500); assert.equal(result.resolutionMs, 1000 / fs);
    assert.equal(result.clinicalValidation, false); assert.deepEqual(result.usedLeads, ['I','II','V1','V5']);
    assert.deepEqual(input, before);
  });
  for (const lead of ['I','II','V1','V5'] as const) it(`blocks a flat detection channel ${lead} without calling it asystole`, () => {
    const input = fixture(); input.leads[lead].fill(0);
    const r = assessExternalWindow(input); assert.equal(r.analysisAllowed,false);
    assert.ok(r.issues.some(i=>i.code==='flat-channel'&&i.lead===lead&&i.blocks));
  });
  it('keeps a non-analysis flat channel visible as an explicit warning',()=>{
    const input=fixture();input.leads.V6.fill(0);const r=assessExternalWindow(input);
    assert.equal(r.analysisAllowed,true);assert.ok(r.issues.some(i=>i.lead==='V6'&&!i.blocks));
  });
  it('flags an exact 100ms plateau at an observed extreme without asserting ADC saturation',()=>{
    const input=fixture();input.leads.II.fill(8,700,750);const r=assessExternalWindow(input);
    assert.equal(r.analysisAllowed,false);assert.ok(r.issues.some(i=>i.code==='extreme-plateau'&&i.reason.includes('no saturación confirmada')));
  });
  it('does not label 98ms as 100ms in the engineering plateau condition',()=>{
    const input=fixture();input.leads.II.fill(8,700,749);assert.equal(assessExternalWindow(input).analysisAllowed,true);
  });
  it('rejects identical analysis channels without generating replacements',()=>{
    const input=fixture();input.leads.II.set(input.leads.I);assert.ok(assessExternalWindow(input).issues.some(i=>i.code==='identical-channels'));
  });
  for(const invalid of ['nan','missing','length','short','float32'] as const) it(`rejects inconsistent input ${invalid}`,()=>{
    const r=fixture();
    if(invalid==='nan')r.leads.I[100]=NaN;
    if(invalid==='missing')delete (r.leads as Partial<ExternalECG['leads']>).V6;
    if(invalid==='length')r.leads.V1=new Float64Array(4000);
    if(invalid==='short')for(const l of LEADS)r.leads[l]=r.leads[l].slice(0,4500);
    if(invalid==='float32')r.leads.I=new Float32Array(5000) as unknown as Float64Array;
    assert.throws(()=>assertExternalSamples(r));
  });
  it('never invokes analysis on an excluded rate or a flat required channel',()=>{
    const run=()=>{throw Error('must not run');};
    assert.equal(evaluateExternalWindow(fixture(250),run).measurement,null);
    const input=fixture();input.leads.I.fill(0);assert.equal(evaluateExternalWindow(input,run).measurement,null);
  });
  for(const id of [1,2,3,4]) it(`exposed LUDB development ${id}: preserves sample-only measurements exactly when eligible`,()=>{
    const record=ludb(id),samples=externalWindow(record,0),before=copy(samples);
    const result=evaluateExternalWindow(samples,analyzeSamples);
    assert.equal(result.assessment.analysisAllowed,true,JSON.stringify(result.assessment.issues));
    assert.deepEqual(result.measurement,analyzeSamples(samples));assert.deepEqual(samples,before);
  });
});

describe('A17 canonical physical-signal identity',()=>{
  it('agrees with an independent Node SHA-256 implementation of the specified bytes',async()=>{
    const r=fixture(),before=copy(r),fp=await fingerprintECG(r);
    const head=Buffer.from(`ecg-physical-f64le-v1\n500\n5000\nmV\n${LEADS.join(',')}\n`),bytes=Buffer.alloc(head.length+5000*12*8);head.copy(bytes);
    let k=head.length;for(const l of LEADS)for(const value of r.leads[l]){bytes.writeDoubleLE(value===0?0:value,k);k+=8;}
    assert.equal(fp.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(r,before);
  });
  it('changes on one sample and on fs even when the displayed values would round equally',async()=>{
    const a=fixture(),b=copy(a);b.leads.V6[100]+=Number.EPSILON;
    assert.notEqual((await fingerprintECG(a)).sha256,(await fingerprintECG(b)).sha256);
    b.leads.V6[100]=a.leads.V6[100];b.fs=250;b.duration=20;
    assert.notEqual((await fingerprintECG(a)).sha256,(await fingerprintECG(b)).sha256);
  });
  it('uses all twelve channels in fixed order and ignores source-file representation',async()=>{
    const a=fixture(),b=parseECGCsv(exportECGCsv(a));b.provenance.checksumVerified=true;b.provenance.format='wfdb16';
    b.leads=Object.fromEntries([...LEADS].reverse().map(l=>[l,b.leads[l]])) as ExternalECG['leads'];
    assert.deepEqual(await fingerprintECG(a),await fingerprintECG(b));
  });
  it('canonicalizes signed zero but preserves all other physical doubles',async()=>{
    const a=fixture(),b=copy(a);a.leads.I[0]=0;b.leads.I[0]=-0;
    assert.equal((await fingerprintECG(a)).sha256,(await fingerprintECG(b)).sha256);
  });
});

describe('A10 reversible manual intervals, never automatic corrections',()=>{
  for(const fs of [100,125,250,500,1000]) it(`one sample at ${fs} Hz changes interval by exactly 1000/fs ms`,()=>{
    const a=annotation();a.startSample=10;a.endSample=20;
    const b={...a,endSample:21};assert.ok(Math.abs((intervalMs(b,fs)-intervalMs(a,fs))-1000/fs)<1e-12);
  });
  for(const kind of ['PR','QRS','QT'] as const) it(`${kind}: round trip preserves absolute indices and recorded build`,async()=>{
    const identity=await fingerprintECG(fixture()),a={...annotation(),kind};
    const sidecar=reviewSidecar(identity,[a],build);const decoded=importReview(JSON.stringify(sidecar),identity);
    assert.deepEqual(decoded,sidecar);assert.ok(!('measurement' in decoded));assert.ok(!('leads' in decoded));
    const exported=reviewSidecar(identity,decoded.annotations,{...build,commit:'d'.repeat(40)});
    assert.equal(exported.annotations[0].createdWith.commit,build.commit);assert.equal(exported.exportedWith.commit,'d'.repeat(40));
  });
  const mutations: [string,(o:Record<string, any>)=>void][] = [
    ['other hash',o=>o.signal.sha256='f'.repeat(64)], ['other fs',o=>o.signal.fs=250], ['other count',o=>o.signal.samples=10000],
    ['reordered leads',o=>o.signal.leads.reverse()], ['units',o=>o.signal.units='uV'], ['schema',o=>o.schemaVersion=2],
    ['non-manual origin',o=>o.annotations[0].origin='automatic'], ['patient field',o=>o.patient='PRIVATE'],
    ['negative bound',o=>o.annotations[0].startSample=-1], ['fractional bound',o=>o.annotations[0].endSample=550.5],
    ['reversed interval',o=>o.annotations[0].endSample=400], ['last index off-by-one',o=>o.annotations[0].endSample=5000],
    ['unknown lead',o=>o.annotations[0].lead='MLII'], ['unknown metric',o=>o.annotations[0].kind='diagnosis'],
    ['duplicate id',o=>o.annotations.push(o.annotations[0])], ['fake validation',o=>o.clinicalValidation=true],
    ['bad build',o=>o.annotations[0].createdWith.commit='<script>'], ['annotation extra field',o=>o.annotations[0].diagnosis='PRIVATE']
  ];
  for(const [name,mutate]of mutations)it(`rejects ${name} atomically without mutating current annotations or identity`,async()=>{
    const identity=await fingerprintECG(fixture()),before=copy(identity),original=reviewSidecar(identity,[annotation()],build),malformed=copy(original);
    mutate(malformed);assert.throws(()=>importReview(JSON.stringify(malformed),identity));assert.deepEqual(identity,before);assert.deepEqual(original.annotations,[annotation()]);
  });
  it('rejects oversized, invalid JSON and excessive annotation counts',async()=>{
    const identity=await fingerprintECG(fixture());assert.throws(()=>importReview(' '.repeat(MAX_REVIEW_BYTES+1),identity));assert.throws(()=>importReview('{',identity));
    assert.throws(()=>reviewSidecar(identity,Array.from({length:101},(_,i)=>annotation(i+1)),build));
  });
  it('handles property order without weakening semantic identity checks',async()=>{
    const identity=await fingerprintECG(fixture()),data=reviewSidecar(identity,[annotation()],build);
    data.signal=Object.fromEntries(Object.entries(data.signal).reverse()) as unknown as SignalIdentity;
    assert.equal(importReview(JSON.stringify(data),identity).annotations.length,1);
  });
  it('undo/redo covers save, edit, delete, replacement and clearing; exposes no mutable history',()=>{
    const h=new ManualHistory(),a=annotation(),b={...a,endSample:600};h.replace([a]);h.replace([b]);h.replace([]);
    h.undo();assert.deepEqual(h.list,[b]);h.undo();assert.deepEqual(h.list,[a]);h.redo();assert.deepEqual(h.list,[b]);
    const exposed=h.list;exposed[0].startSample=0;assert.equal(h.list[0].startSample,500);
    h.replace([annotation(2)]);assert.equal(h.canRedo,false);h.undo();assert.deepEqual(h.list,[b]);
  });
  it('bounds reject crossing and accept the actual last sample, without millisecond heuristics',()=>{
    assert.doesNotThrow(()=>validateBounds({...annotation(),endSample:4999},5000));assert.throws(()=>validateBounds({...annotation(),startSample:550},5000));
  });
  it('rendering and pixel/sample round trips preserve all samples',()=>{
    const r=fixture(),before=copy(r),g=renderReviewTrace(canvas(),r,{lead:'II',startSample:400,seconds:.8,range:2},annotation(),900);
    for(let i=400;i<800;i++)assert.equal(sampleAtReviewPoint(reviewPointAtSample(i,g),g),i);
    assert.equal(sampleAtReviewPoint(-900,g),400);assert.equal(sampleAtReviewPoint(90000,g),799);assert.deepEqual(r,before);
  });
});

describe('worker boundary and gate cannot be forged with a flag',()=>{
  async function good(){const record=ludb(),samples=externalWindow(record,0);return {id:7,kind:'read' as const,startSample:0,record,identity:await fingerprintECG(record),...evaluateExternalWindow(samples,analyzeSamples)};}
  it('accepts an intact report unchanged, rejecting a different request or window',async()=>{
    const r=await good();assert.equal(validateExternalReply(r,7,'read',null,0),r);
    assert.throws(()=>validateExternalReply(r,8,'read',null,0));assert.throws(()=>validateExternalReply(r,7,'read',null,500));
  });
  it('rejects inconsistent assessment and malformed/nonfinite/missing numeric output',async()=>{
    const r=await good();const a=copy(r);a.assessment.analysisAllowed=false;assert.throws(()=>validateExternalReply(a,7,'read',null,0));
    const b=copy(r);b.measurement!.qrs=NaN;assert.throws(()=>validateExternalReply(b,7,'read',null,0));
    const c=copy(r);c.measurement=null;assert.throws(()=>validateExternalReply(c,7,'read',null,0));
  });
  it('accepts manual-only data but rejects a fabricated automatic measurement on it',async()=>{
    const record=fixture(250),result=evaluateExternalWindow(record,()=>{throw Error('excluded');});
    const data={id:7,kind:'read',startSample:0,record,identity:await fingerprintECG(record),...result};
    assert.equal(validateExternalReply(data,7,'read',null,0).measurement,null);
    const measured = (await good()).measurement;
    assert.throws(()=>validateExternalReply({...data,measurement:measured},7,'read',null,0));
  });
});
