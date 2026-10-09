import {describe,it,expect} from 'vitest';
import {applyAcquisitionScope} from '../src/engine/acquisition-measurement';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {synthesize} from '../src/engine/signal';
import {DEFAULT_CASE,cloneCase} from '../src/engine/types';
const raw=()=>analyzeSamples(synthesize(cloneCase(DEFAULT_CASE),10));
describe('known display filtering cannot promote measurement confidence',()=>{
 it('preserves diagnostic/off results with exact identity',()=>{const m=raw();for(const f of ['off','diagnostic'] as const)expect(applyAcquisitionScope(m,f)).toBe(m);});
 it('requires review for monitor measurements without altering candidates or numbers',()=>{
  const m=raw(),before=structuredClone(m),s=applyAcquisitionScope(m,'monitor');
  expect(s.evidence.hr.status).toBe('review');expect(s.hr).toBe(m.hr);expect(s.beats).toBe(m.beats);expect(s.detectedPeaks).toBe(m.detectedPeaks);expect(m).toEqual(before);
 });
 it('retires reported confidence for the 2 Hz demonstration filter',()=>{
  const m=raw(),s=applyAcquisitionScope(m,'aggressive');
  expect(Object.values(s.evidence).every(e=>e.status==='unavailable')).toBe(true);
  expect(s.hr).toBe(m.hr);expect(s.evidence.hr.reason).toContain('2 Hz');
 });
 it('never promotes an already unavailable metric',()=>{
  const m=raw();m.evidence.qt.status='unavailable';m.evidence.qt.reason='No T';
  expect(applyAcquisitionScope(m,'monitor').evidence.qt).toBe(m.evidence.qt);
 });
 it('fails closed for unknown acquisition provenance',()=>expect(()=>applyAcquisitionScope(raw(),'other' as never)).toThrow());
});

it('the actual worker applies known acquisition scope after sample-only analysis',async()=>{
 const {vi}=await import('vitest');
 const messages:unknown[]=[];
 const worker={postMessage:(value:unknown)=>messages.push(value),onmessage:null as unknown as (event:MessageEvent)=>Promise<void>};
 vi.stubGlobal('self',worker);
 try{
  await import('../src/engine/worker');
  for(const filter of ['diagnostic','monitor','aggressive'] as const){
   // The worker awaits the case's learned model before synthesizing.
   await worker.onmessage({data:{id:1,ecg:{...cloneCase(DEFAULT_CASE),filter},duration:10}} as MessageEvent);
   const response=messages.at(-1) as {measurement:ReturnType<typeof raw>;error?:string};
   expect(response.error).toBeUndefined();
   expect(response.measurement.evidence.hr.status).toBe(filter==='diagnostic'?'usable':filter==='monitor'?'review':'unavailable');
  }
 }finally{vi.unstubAllGlobals();}
});

it('cards hide retained numerical values and monitor text retains uncertainty',async()=>{
 const {metricCards,monitorRate,monitorRateNote}=await import('../src/ui/metric-cards');
 const c=cloneCase(DEFAULT_CASE),m=raw(),withheld=applyAcquisitionScope(m,'aggressive');
 expect(metricCards(c,withheld).every(card=>card.value==='—')).toBe(true);
 expect(monitorRate(c,withheld)).toBe('—');expect(monitorRateNote(c,withheld)).toBe('No estimable');
 expect(monitorRateNote(c,applyAcquisitionScope(m,'monitor'))).toContain('revisar');
});

it('the complete worker-to-audit-to-card path cannot revive unavailable acquisition measurements',async()=>{
 const {auditMeasurement}=await import('../src/engine/analysis/model-audit');
 const {metricCards}=await import('../src/ui/metric-cards');
 for(const filter of ['monitor','aggressive'] as const){
  const c={...cloneCase(DEFAULT_CASE),filter},signal=synthesize(c,10);
  const scoped=applyAcquisitionScope(analyzeSamples(signal),filter);
  const audited=auditMeasurement(signal,scoped);
  for(const key of Object.keys(scoped.evidence) as (keyof typeof scoped.evidence)[]){
   if(scoped.evidence[key].status==='unavailable')expect(audited.evidence[key].status,key).toBe('unavailable');
  }
  if(filter==='aggressive')expect(metricCards(c,audited).every(card=>card.value==='—')).toBe(true);
 }
});
