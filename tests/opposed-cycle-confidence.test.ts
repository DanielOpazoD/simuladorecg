import {it,expect} from 'vitest';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {measure} from '../src/engine/measure';
import {alternatingCandidateAmbiguity} from '../src/engine/analysis/alternating-confidence';
import type {Signal} from '../src/engine/types';
const weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
/** Same samples permit distinct candidate interpretations; no event truth is input. */
function fixture(fs:number,opposite=true,dropSome=false):Pick<Signal,'fs'|'leads'>{
 const values=Float64Array.from({length:fs*10},(_,i)=>{
  const t=i/fs;let value=0;
  for(let start=.5;start<10;start+=.6){
   value+=Math.exp(-.5*((t-start)/.014)**2);
   if(!dropSome||start<7||start>8)value+=(opposite?-.9:.9)*Math.exp(-.5*((t-start-.3)/.016)**2);
  }
  return value;
 });
 return {fs,leads:Object.fromEntries(Object.entries(weights).map(([lead,w])=>[lead,Float64Array.from(values,x=>w*x)])) as Signal['leads']};
}
it.each([100,250,500,1000])('reviews regular opposed candidates at %s Hz without inventing an event label',fs=>{
 const s=fixture(fs),raw=measure(s),m=analyzeSamples(s);
 expect(raw.hr).toBeGreaterThan(170);expect(raw.evidence.hr.status).toBe('usable');
 expect(alternatingCandidateAmbiguity(s,raw.detectedPeaks)).toBe(true);
 expect(m.evidence.hr.status).toBe('review');expect(m.hr).toBe(raw.hr);expect(m.detectedPeaks).toEqual(raw.detectedPeaks);
 expect(m.beats).toEqual(raw.beats);expect(m.evidence.hr.reason).toContain('complejos distintos');
});
it.each([100,250,500,1000])('does not flag same-direction regular complexes at %s Hz',fs=>{
 const s=fixture(fs,false),m=measure(s);expect(alternatingCandidateAmbiguity(s,m.detectedPeaks)).toBe(false);
});
it('retains the strong pattern screen with a minority of absent deflections',()=>{
 const s=fixture(500,true,true),m=analyzeSamples(s);expect(m.evidence.hr.status).toBe('review');expect(m.hr).toBe(measure(s).hr);
});
it('changes only quality metadata, never rate, intervals, support coordinates or samples',()=>{
 const s=fixture(500),samples=structuredClone(s),raw=measure(s),m=analyzeSamples(s);
 for(const key of ['hr','instantHr','rr','pr','qrs','qt','axis','pAxis','tAxis','qtc','detectedPeaks','beats','window'] as const)expect(m[key]).toEqual(raw[key]);
 expect(s).toEqual(samples);
});
