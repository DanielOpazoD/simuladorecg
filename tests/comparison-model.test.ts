import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { captureTrace, changedSettings, comparisonExport, comparisonWindow, DEFAULT_COMPARISON_VIEW, leadDifferences, metricDifferences } from '../src/ui/comparison-model';
import { comparisonLayout } from '../src/render/comparison';
import { DEFAULT_CASE, LEADS, type Signal } from '../src/engine/types';
import { measure } from '../src/engine/measure';
import { fixture } from './fixtures';

function input() {
  const f=fixture(), measurement=measure(f);
  const signal:Signal={...f,duration:10,events:{beats:[{time:.01,kind:'normal',rr:1},{time:2,kind:'normal',rr:1}],atria:[],spikes:[]},truth:{hr:60,pr:160,qrs:90,qt:400,axis:55},warnings:[]};
  return {c:structuredClone(DEFAULT_CASE),s:signal,m:measurement};
}
function trace(){const x=input();return captureTrace(x.c,x.s,x.m);}

describe('A/B comparison copies existing samples without another model or detector',()=>{
  it('isolates A from subsequent changes in parameters, samples and measurements',()=>{
    const x=input(),a=captureTrace(x.c,x.s,x.m),saved=structuredClone(a);
    x.c.artifacts.baseline=.7;x.c.view.gain=20;x.s.leads.I.fill(99);x.s.events.beats[0].time=7;x.m.qt=123;
    assert.deepEqual(a,saved);
  });
  it('bounds a 65-second trace to the first ten seconds without recomputing samples',()=>{
    const x=input();x.s.duration=65;
    for(const l of LEADS)x.s.leads[l]=Float64Array.from({length:32500},(_,i)=>i/500);
    x.s.events.beats.push({time:60,kind:'normal',rr:1});
    const a=captureTrace(x.c,x.s,x.m);
    assert.equal(a.signal.duration,10);for(const l of LEADS){assert.equal(a.signal.leads[l].length,5000);assert.equal(a.signal.leads[l][4999],9.998);}
    assert.equal(a.signal.events.beats.length,2);assert.deepEqual(a.measurement,x.m);
  });
  for(const fs of [0,NaN,Infinity,5000])it(`rejects invalid sampling ${fs}`,()=>{const x=input();x.s.fs=fs;assert.throws(()=>captureTrace(x.c,x.s,x.m));});
  it('rejects missing samples and nonfinite voltage rather than zero filling',()=>{
    const x=input();x.s.leads.V1=new Float64Array(12);assert.throws(()=>captureTrace(x.c,x.s,x.m));
    x.s.leads.V1=new Float64Array(5000);x.s.leads.V1[900]=NaN;assert.throws(()=>captureTrace(x.c,x.s,x.m));
  });
  it('retains exact zero differences for identical traces',()=>{
    const a=trace(),b=structuredClone(a),d=leadDifferences(a,b,comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW));
    assert.equal(d.length,12);for(const row of d){assert.equal(row.rmsMv,0);assert.equal(row.maxAbsMv,0);assert.equal(row.samples,1000);assert.equal(row.coverage,1);}
  });
  it('reports a known voltage shift with unchanged polarity and physical units',()=>{
    const a=trace(),b=structuredClone(a);b.signal.leads.V5=b.signal.leads.V5.map(v=>v+.25);
    const d=leadDifferences(a,b,comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW));
    assert.ok(Math.abs(d.find(r=>r.lead==='V5')!.rmsMv!-.25)<1e-12);
    assert.ok(Math.abs(d.find(r=>r.lead==='V5')!.biasMv!-.25)<1e-12);
    assert.ok(d.filter(r=>r.lead!=='V5').every(r=>r.maxAbsMv===0));
  });
  it('shifts origins for beat alignment but does not resample or stretch a beat',()=>{
    const a=trace(),b=trace();b.signal.events.beats[1].time=3.0004;
    const w=comparisonWindow(a,b,{...DEFAULT_COMPARISON_VIEW,alignment:'beat',beatA:1,beatB:1});
    assert.deepEqual(w,{startA:1.8,startB:2.8,duration:1.2,axisStart:-.2});
  });
  it('reports missing coverage at the start of a record instead of inventing samples',()=>{
    const a=trace(),w=comparisonWindow(a,a,{...DEFAULT_COMPARISON_VIEW,alignment:'beat'});
    const d=leadDifferences(a,a,w)[0];assert.ok(d.samples>0&&d.samples<600);assert.ok(d.coverage<1);assert.equal(d.rmsMv,0);
  });
  it('does not invent an anchor for asystole or an invalid index',()=>{
    const a=trace();a.signal.events.beats=[];assert.throws(()=>comparisonWindow(a,a,{...DEFAULT_COMPARISON_VIEW,alignment:'beat'}));
    const b=trace();assert.throws(()=>comparisonWindow(b,b,{...DEFAULT_COMPARISON_VIEW,alignment:'beat',beatA:99}));
  });
  it('rejects heterogeneous sampling instead of silently resampling',()=>{const a=trace(),b=trace();b.signal.fs=250;assert.throws(()=>comparisonWindow(a,b,DEFAULT_COMPARISON_VIEW));});
  for(const start of [-1,9,NaN])it(`rejects invalid record offset ${start}`,()=>{const a=trace();assert.throws(()=>comparisonWindow(a,a,{...DEFAULT_COMPARISON_VIEW,start}));});
  it('isolates changed model/acquisition parameters from presentation',()=>{
    const a=structuredClone(DEFAULT_CASE),b=structuredClone(a);b.name='new';b.presetId='custom';b.view.gain=20;b.view.palette='dark';
    assert.deepEqual(changedSettings(a,b),[]);b.artifacts.reversed=true;b.qrs=160;b.seed++;
    assert.deepEqual(changedSettings(a,b).map(r=>r.key).sort(),['artifacts.reversed','qrs','seed']);
  });
  it('never substitutes programmed truth for missing measured intervals',()=>{
    const a=input().m,b=structuredClone(a);a.qt=null;b.qt=410;a.evidence.qt.status='unavailable';
    const row=metricDifferences(a,b).find(r=>r.key==='qt')!;assert.equal(row.a,null);assert.equal(row.delta,null);
  });
  for(const s of ['review','unavailable'] as const)it(`withholds delta for ${s} rather than promoting the estimate`,()=>{
    const a=input().m,b=structuredClone(a);a.hr=60;b.hr=90;a.evidence.hr.status=s;b.evidence.hr.status='usable';
    assert.equal(metricDifferences(a,b)[0].delta,null);
  });
  it('requires equal measurement windows and computes a circular angle difference',()=>{
    const a=input().m,b=structuredClone(a);a.axis=179;b.axis=-179;a.evidence.axis.status='usable';b.evidence.axis.status='usable';
    assert.equal(metricDifferences(a,b).find(r=>r.key==='axis')!.delta,2);
    b.window.end=8;assert.ok(metricDifferences(a,b).every(r=>r.delta===null));
  });
  it('shares geometric scaling between traces; viewport cannot autoscale voltage',()=>{
    const small=comparisonLayout(390,2,2),large=comparisonLayout(1400,2,2);
    assert.equal(small.width,900);assert.equal(small.pxPerMv,large.pxPerMv);
    assert.equal(comparisonLayout(900,4,2).pxPerMv,small.pxPerMv/2);
  });
  it('exports both electrical signals and their provenance, independently of plotting range',()=>{
    const a=trace(),b=trace(),view={...DEFAULT_COMPARISON_VIEW,rangeMv:1};
    b.case.qrs=150;const x=comparisonExport(a,b,view,'test-version');
    assert.equal(x.kind,'ecg-lab-comparison');assert.equal(x.syntheticOnly,true);assert.equal(x.clinicalValidation,false);
    assert.equal(x.A.units,'mV');assert.deepEqual(x.A.leads.I,Array.from(a.signal.leads.I));
    assert.equal(x.changedSettings[0].key,'qrs');assert.equal(x.A.fs,500);assert.equal(x.A.duration,10);
    assert.equal('version' in x,false,'This export is not silently importable as a single case');
    assert.deepEqual(JSON.parse(JSON.stringify(x)).B.leads,b.signal.leads && Object.fromEntries(LEADS.map(l=>[l,Array.from(b.signal.leads[l])])));
  });
});
