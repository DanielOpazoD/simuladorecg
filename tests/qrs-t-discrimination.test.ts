import {describe,it,expect} from 'vitest';
import {auditMeasurement} from '../src/engine/analysis/model-audit';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {tWaveSupport} from '../src/engine/constraints';
import {detectVentricularCandidates} from '../src/engine/analysis/ventricular-candidates';

describe('sample-only QRS–T discrimination, exposed regressions',()=>{
 for(const hr of [73,120])for(const pr of [90,100.3,101.7])for(const filter of ['off','diagnostic'] as const)
 it(`${hr} bpm / PR ${pr} / ${filter}: keeps QRS and rejects counted T`,()=>{
  const c={...fromPreset(presetById('wpw')!),hr,pr,filter,electrolyte:'lowvoltage' as const,variability:0,seed:17};
  Object.assign(c.artifacts,{baseline:.05,muscle:.05,mains:.05});
  const s=synthesize(c,10),snapshot=Object.fromEntries(Object.entries(s.leads).map(([key,value])=>[key,value.slice()]));
  const m=analyzeSamples({fs:s.fs,leads:s.leads});
  expect(m.hr).not.toBeNull();expect(Math.abs(m.hr!-hr)).toBeLessThan(1);
  expect(m.evidence.hr.status).toBe('usable');
  const displayed=auditMeasurement(s,m);
  expect(displayed.hr).toBe(m.hr);expect(displayed.evidence.hr.status).toBe('usable');
  for(const time of m.detectedPeaks){
   expect(s.events.beats.some(b=>time>=b.time&&time<=b.time+b.qrs!)).toBe(true);
   expect(s.events.beats.some(b=>{const t=tWaveSupport(c,b.qrs!,b.qt!);return time>=b.time+t.start&&time<=b.time+t.start+t.duration;})).toBe(false);
  }
  for(const b of m.beats){
   const index=m.detectedPeaks.indexOf(b.peak);
   expect(index).toBeGreaterThan(0);
   expect(b.rr).toBeCloseTo(b.peak-m.detectedPeaks[index-1],10);
  }
  expect(s.leads).toEqual(snapshot);
 });
 it.each(['pvc','bigeminy','trigeminy','couplet','vvi','ddd','lbbb','rbbb','vt'])('preserves real %s ventricular activations',id=>{
  const c={...fromPreset(presetById(id)!),variability:0};
  const s=synthesize(c,10),m=analyzeSamples({fs:s.fs,leads:s.leads});
  const interior=s.events.beats.filter(b=>b.time>.2&&b.time+b.qrs!<9.8);
  for(const b of interior)expect(m.detectedPeaks.filter(p=>p>=b.time-.01&&p<=b.time+b.qrs!+.03).length).toBe(1);
 });
 it('leaves candidate formation unchanged when shape rejection is explicitly disabled',()=>{
  const s=synthesize(fromPreset(presetById('wpw')!),10);
  const a=detectVentricularCandidates(s,{tReject:false});
  expect(a.peaks.every(i=>a.candidates.includes(i))).toBe(true);
 });
});
