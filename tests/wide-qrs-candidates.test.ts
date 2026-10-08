import {it,expect} from 'vitest';
import type {Signal} from '../src/engine/types';
import {detectVentricularCandidates} from '../src/engine/analysis/ventricular-candidates';
const weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
/** Analytical C1 deflections isolate slope grouping; not a physiological generator. */
function train(fs:number,width:number,period:number,extra=false):Pick<Signal,'fs'|'leads'>{
 const starts:number[]=[];for(let t=.5;t+width<9.8;t+=period)starts.push(t);
 const pulse=(phase:number,duration:number)=>{
  if(phase<=0||phase>=duration)return 0;
  const edge=Math.min(.035,duration/3),u=Math.min(phase,duration-phase)/edge;
  return u>=1?1:(1-Math.cos(Math.PI*u))/2;
 };
 const values=Float64Array.from({length:fs*10},(_,i)=>starts.reduce((sum,t)=>sum+pulse(i/fs-t,width)-(extra?pulse(i/fs-t-.22,width):0),0));
 return {fs,leads:Object.fromEntries(Object.entries(weights).map(([lead,w])=>[lead,Float64Array.from(values,x=>w*x)])) as Signal['leads']};
}
it.each([100,250,500,1000])('groups opposing edges of one continuous wide deflection at %s Hz',fs=>{
 const s=train(fs,.24,.6),raw=detectVentricularCandidates(s,{tReject:false}),after=detectVentricularCandidates(s);
 expect(raw.peaks.length).toBe(32);expect(after.peaks.length).toBe(16);
 expect(after.boundaryCandidates).toEqual(raw.peaks);
 expect(after.peaks.every(p=>raw.peaks.includes(p))).toBe(true);
 const rr=after.peaks.slice(1).map((p,i)=>(p-after.peaks[i])/fs);
 rr.forEach(value=>expect(value).toBeCloseTo(.6,2));
});
it.each([250,500,1000])('retains separate opposing narrow complexes at %s Hz',fs=>{
 const s=train(fs,.065,.8,true);
 expect(detectVentricularCandidates(s).peaks).toEqual(detectVentricularCandidates(s,{tReject:false}).peaks);
});
it.each([250,500,1000])('does not group genuinely repeating fast broad complexes at %s Hz',fs=>{
 const s=train(fs,.24,.25);
 expect(detectVentricularCandidates(s).peaks).toEqual(detectVentricularCandidates(s,{tReject:false}).peaks);
});
it('preserves input arrays and common DC/gain invariance on the analytical fixture',()=>{
 const s=train(500,.24,.6),before=structuredClone(s),expected=detectVentricularCandidates(s).peaks;
 expect(s).toEqual(before);
 for(const a of Object.values(s.leads))for(let i=0;i<a.length;i++)a[i]=a[i]*1.7+12;
 expect(detectVentricularCandidates(s).peaks).toEqual(expected);
});

import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
it.each([350,430])('does not lose additional true fast VT activations at QTc %s',qtc=>{
 const c={...fromPreset(presetById('vt')!),hr:240,qrs:240,qtc,filter:'off' as const,variability:0,seed:53};
 Object.assign(c.artifacts,{baseline:0,muscle:0,mains:0});
 const s=synthesize(c,10),d=detectVentricularCandidates({fs:s.fs,leads:s.leads});
 // The numerical predecessor detects 34 candidates here and already misses
 // some real activations. Preserve that floor, allowing future improvement;
 // do not bless 34 as physiological truth. The first grouping trial fell to20.
 expect(d.peaks.length).toBeGreaterThanOrEqual(34);
 expect(d.peaks.length).toBeLessThanOrEqual(s.events.beats.length+1);
});
it('preserves candidate grouping under lead polarity reversal',()=>{
 const s=train(500,.24,.6),expected=detectVentricularCandidates(s).peaks;
 for(const lead of ['I','II','V1','V5'] as const){
  for(let i=0;i<s.leads[lead].length;i++)s.leads[lead][i]*=-1;
  expect(detectVentricularCandidates(s).peaks).toEqual(expected);
 }
});

import {analyzeSamples} from '../src/engine/sample-analysis';
it('measures the whole supported complex after opposing slopes are grouped',()=>{
 const s=train(500,.24,.833),raw=detectVentricularCandidates(s,{tReject:false});
 const rr=raw.peaks.slice(1).map((p,i)=>(p-raw.peaks[i])/s.fs).sort((a,b)=>a-b);
 expect(rr[Math.floor(rr.length/2)]).toBeLessThan(.22);
 const m=analyzeSamples(s);
 expect(m.beats.length).toBeGreaterThanOrEqual(8);
 expect(Math.abs(m.qrs!-240)).toBeLessThanOrEqual(8);
 for(const b of m.beats){
  expect(Math.abs(b.qrs-240)).toBeLessThanOrEqual(8);
  expect(b.onset).toBeLessThan(b.peak);expect(b.offset).toBeGreaterThan(b.peak);
  expect(Math.abs(b.axis!-Math.atan2(1.6/Math.sqrt(3),1)*180/Math.PI)).toBeLessThan(.1);
 }
 expect(m.pr).toBeNull();expect(m.qt).toBeNull();
 expect(m.hr).toBeCloseTo(60/.833,1);
});
