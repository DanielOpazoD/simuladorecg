import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { attachMeasurementSupport, MEASUREMENT_SUPPORT_POLICY } from '../src/engine/measurement-support';
import { analyzeSamples } from '../src/engine/sample-analysis';
import { measure } from '../src/engine/measure';
import { synthesize } from '../src/engine/signal';
import { fromPreset,presetById } from '../src/presets/catalog';
import { measurementSupportHtml } from '../src/ui/measurement-support';
const sample=()=>synthesize(fromPreset(presetById('sinus')!),10);
describe('Per-metric support and selective abstention',()=>{
 it('freezes the explicit engineering policy',()=>{const p=JSON.parse(readFileSync(new URL('../benchmarks/measurement-quality/protocol.json',import.meta.url),'utf8'));expect(MEASUREMENT_SUPPORT_POLICY).toEqual(p.policy);expect(Object.isFrozen(MEASUREMENT_SUPPORT_POLICY)).toBe(true);});
 it('traces actual PR/QRS/QT endpoints and different axes leads',()=>{
  const m=analyzeSamples(sample());const b=m.beats[0];
  expect(m.support!.pr.candidates[0]).toMatchObject({start:b.pOnset,end:b.onset});
  expect(m.support!.qrs.candidates[0]).toMatchObject({start:b.onset,end:b.offset});
  expect(m.support!.qt.candidates[0]).toMatchObject({start:b.onset,end:b.tEnd});
  expect(m.support!.axis.leads).toEqual(['I','II']);
 });
 it('different missing waves give different candidate populations',()=>{
  const m=measure(sample());m.beats[0]={...m.beats[0],pr:null,pOnset:null};m.beats[1]={...m.beats[1],qt:null,tEnd:null};
  const a=attachMeasurementSupport(m,null);expect(a.support!.pr.total).toBe(m.beats.length-1);
  expect(a.support!.qt.candidates.every(c=>c.peak!==m.beats[1].peak)).toBe(true);
 });
 it('does not treat irregular RR or a disagreement alone as noise',()=>{
  const m=measure(sample()),a=attachMeasurementSupport(m,{requiresReview:false,challengedPeaksSeconds:[]});
  expect(a.evidence).toEqual(m.evidence);expect(a.qrs).toBe(m.qrs);
 });
 it('retires intervals without enough stable beats but never edits candidates',()=>{
  const m=measure(sample()),original=structuredClone(m);
  const a=attachMeasurementSupport(m,{requiresReview:true,challengedPeaksSeconds:[]});
  for(const k of ['pr','qrs','qt','axis'] as const){expect(a[k]).toBeNull();expect(a.evidence[k].status).toBe('unavailable');expect(a.rejected![k]).toBe(m[k]);}
  expect(a.qtc.bazett).toBeNull();expect(a.pAxis).toBeNull();expect(a.tAxis).toBeNull();
  expect(a.beats).toEqual(m.beats);expect(a.detectedPeaks).toEqual(m.detectedPeaks);expect(m).toEqual(original);expect(a.hr).toBe(m.hr);
 });
 it('review retains the exact number when some support remains',()=>{
  const m=measure(sample());const a=attachMeasurementSupport(m,{requiresReview:true,challengedPeaksSeconds:m.beats.slice(0,3).map(b=>b.peak)});
  expect(a.qrs).toBe(m.qrs);expect(a.evidence.qrs.status).toBe('review');expect(a.rejected?.qrs).toBeUndefined();
 });
 it('does not let stable QRS beats imply stable PR from another population',()=>{
  const m=measure(sample());for(const b of m.beats.slice(3)){b.pr=null;b.pOnset=null;}
  const a=attachMeasurementSupport(m,{requiresReview:true,challengedPeaksSeconds:m.beats.slice(3).map(b=>b.peak)});
  expect(a.pr).toBeNull();expect(a.qrs).toBe(m.qrs);expect(a.support!.pr.stable).toBe(0);
 });
 it('matches challenged peaks one-to-one, not by counts',()=>{
  const m=measure(sample());const a=attachMeasurementSupport(m,{requiresReview:true,challengedPeaksSeconds:m.detectedPeaks.map(x=>x+.2)});
  expect(a.support!.qrs.stable).toBe(0);expect(a.qrs).toBeNull();
 });
 it('never promotes an unavailable or review state',()=>{
  const m=measure(sample());m.evidence.pr.status='review';const a=attachMeasurementSupport(m,null);expect(a.evidence.pr.status).toBe('review');
  m.qt=null;m.evidence.qt.status='unavailable';expect(attachMeasurementSupport(m,null).qt).toBeNull();
 });
 it('presents provenance as candidates, not a clinical confidence percentage',()=>{
  const h=measurementSupportHtml(analyzeSamples(sample()));expect(h).toContain('antes de la auditoría');expect(h).toContain('I, II, V1, V5');expect(h).toContain('no certeza clínica');
 });
 it('does not fabricate provenance for a historical measurement',()=>expect(measurementSupportHtml(measure(sample()))).toBe(''));
});
