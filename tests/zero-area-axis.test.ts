import {describe,it,expect} from 'vitest';
import {fixture} from './fixtures';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {measure} from '../src/engine/measure';
const frontal=['I','II','III','aVR','aVL','aVF'] as const;
function balanced(fs:number,amplitude:number,imbalance=0){
 const s=fixture({fs});for(const lead of frontal)s.leads[lead].fill(0);
 // Independent precordial complexes locate the same window. Equal signed
 // frontal lobes have nonzero excursion but zero net area, at every beat.
 for(let beat=0;beat<10;beat++){
  const at=Math.round((beat+.39)*fs);
  for(const [index,value] of [[at,amplitude],[at+1,-amplitude+imbalance]]){
   const I=value,II=value/2;
   const v={I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};
   for(const lead of frontal)s.leads[lead][index]=v[lead];
  }
 }
 return s;
}
describe('Zero signed frontal area is not a zero-degree measured direction',()=>{
 it.each([250,500,1000])('does not invent an axis from balanced nonconstant frontal samples at %s Hz',fs=>{
  const s=balanced(fs,1e-8),copy=structuredClone(s),m=analyzeSamples(s),raw=measure(s);
  expect(m.beats.length).toBeGreaterThan(3);expect(m.hr).toBeCloseTo(60,8);
  expect(raw.beats.every(b=>b.axis===null)).toBe(true);
  expect(m.axis).toBeNull();expect(m.evidence.axis.status).toBe('unavailable');
  expect(m.detectedPeaks).toEqual(raw.detectedPeaks);expect(s).toEqual(copy);
 });
 it.each([250,500,1000])('also handles smooth biphasic frontal lobes with ordinary amplitude at %s Hz',fs=>{
  const s=balanced(fs,0),half=Math.round(.016*fs);
  for(let beat=0;beat<10;beat++){
   const at=Math.round((beat+.37)*fs);
   for(let k=0;k<half;k++)for(const sign of [1,-1]){
    const index=at+k+(sign===1?0:half),I=sign*Math.min(k+1,half-k)/32,II=I/2;
    const v={I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};
    for(const lead of frontal)s.leads[lead][index]=v[lead];
   }
  }
  const m=analyzeSamples(s);
  expect(m.beats.length).toBeGreaterThan(3);expect(m.hr).toBeCloseTo(60,8);
  expect(m.beats.every(b=>b.axis===null)).toBe(true);
  expect(m.axis).toBeNull();expect(m.evidence.axis.status).toBe('unavailable');
 });
 it('keeps missing axes out of a mixed summary and marks it for review',()=>{
  const s=balanced(500,1e-8);
  for(let beat=5;beat<10;beat++)s.leads.I[Math.round((beat+.39)*s.fs)]+=1e-8;
  const m=analyzeSamples(s);
  expect(m.beats.some(b=>b.axis===null)).toBe(true);
  expect(m.beats.some(b=>b.axis!==null)).toBe(true);
  expect(m.axis).not.toBeNull();expect(m.evidence.axis.status).toBe('review');
  const present=m.beats.filter(b=>b.axis!==null);
  expect(m.evidence.axis.count).toBe(present.length);
  expect(m.support?.axis.total).toBe(present.length);
  expect(m.support?.axis.candidates.map(c=>c.peak)).toEqual(present.map(b=>b.peak));
 });
 it('retains an arbitrarily small but nonzero net area without a voltage threshold',()=>{
  const m=analyzeSamples(balanced(500,1e-8,1e-14));
  expect(m.axis).toBeCloseTo(0,8);expect(m.evidence.axis.status).not.toBe('unavailable');
 });
});

it.each(['P','T'] as const)('does not invent a %s direction when only precordial wave information exists',wave=>{
 const s=fixture(),[start,end]=wave==='P'?[.17,.31]:[.5,.8];
 for(let i=0;i<s.leads.I.length;i++)if(i/s.fs%1>=start&&i/s.fs%1<=end)
  for(const lead of frontal)s.leads[lead][i]=0;
 const m=analyzeSamples(s);
 expect(m.pr).not.toBeNull();expect(m.qt).not.toBeNull();expect(m.axis).not.toBeNull();
 expect(wave==='P'?m.pAxis:m.tAxis).toBeNull();
 expect(wave==='P'?m.tAxis:m.pAxis).not.toBeNull();
});

