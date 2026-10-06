import {it,expect} from 'vitest';
import {analyzeSamples} from '../src/engine/sample-analysis';
import type {Signal} from '../src/engine/types';
const weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
export function alternatingFixture(fs=500):Pick<Signal,'fs'|'leads'>{
 const x=Float64Array.from({length:fs*10},(_,i)=>{
  const t=i/fs;let v=0;
  for(let b=.5;b<10;b+=.84)v+=Math.exp(-.5*((t-b)/.014)**2)-.9*Math.exp(-.5*((t-b-.22)/.016)**2);
  return v;
 });
 return {fs,leads:Object.fromEntries(Object.entries(weights).map(([l,w])=>[l,Float64Array.from(x,v=>w*v)])) as Signal['leads']};
}
it.each([100,250,500,1000])('does not confirm repetitive opposite short-long candidates at%sHz',fs=>{
 const m=analyzeSamples(alternatingFixture(fs));
 expect(m.detectedPeaks.length).toBeGreaterThan(15);
 expect(m.evidence.hr.status).not.toBe('usable');
});

import {measure} from '../src/engine/measure';
import {alternatingCandidateAmbiguity,reviewAlternatingCandidates} from '../src/engine/analysis/alternating-confidence';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
it('retains raw numerical candidates and never halves the ambiguous rate',()=>{
 const s=alternatingFixture(),before=measure(s),after=analyzeSamples(s);
 expect(after.hr).toBe(before.hr);expect(after.detectedPeaks).toEqual(before.detectedPeaks);
 expect(after.beats).toEqual(before.beats);expect(after.hr).toBeGreaterThan(130);
 expect(after.evidence.hr.reason).toContain('doble conteo');
});
it.each(['sinus','af','flutter','rbbb','lbbb','vvi','vt'])('does not flag the ordinary%s example',id=>{
 const s=synthesize(fromPreset(presetById(id)!),10),m=measure(s);
 expect(alternatingCandidateAmbiguity(s,m.detectedPeaks)).toBe(false);
});
it('preserves already unavailable evidence and numeric data',()=>{
 const s=alternatingFixture(),m=measure(s);
 m.evidence.hr={...m.evidence.hr,status:'unavailable',reason:'prior evidence'};
 expect(reviewAlternatingCandidates(s,m)).toBe(m);
});
it('external fixture admission is independent of its confidence result',async()=>{
 const {assessExternalWindow}=await import('../src/io/external-assessment');
 expect(assessExternalWindow(alternatingFixture()).analysisAllowed).toBe(true);
});
