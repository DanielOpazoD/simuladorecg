import {describe,it,expect} from 'vitest';
import {synthesize} from '../src/engine/signal';
import {generateEvents} from '../src/engine/rhythm';
import {assignRepolarization} from '../src/engine/repolarization';
import {assertRepresentableEvents,ModelScopeError} from '../src/engine/constraints';
import {fromPreset,presetById} from '../src/presets/catalog';
import type {ECGCase,EventSeries} from '../src/engine/types';
const base={...fromPreset(presetById('wpw')!),hr:60,qrs:120,variability:0,filter:'off' as const};
const unsupported:Partial<ECGCase>[]=[{rhythm:'junctional'},{rhythm:'sinus',av:'complete',escape:'junctional'},{rhythm:'af'},{rhythm:'flutter',atrialRate:240,flutterRatio:4}];
describe('Delta requires an antegrade association represented by this scheduler',()=>{
 it.each(unsupported.flatMap(changes=>['off','diagnostic','monitor','aggressive'].map(filter=>({...changes,filter:filter as ECGCase['filter']}))))('rejects an unsupported delta clock %j without fabricating conduction',changes=>{
  const c={...base,...changes},events=generateEvents(c,10);assignRepolarization(c,events.beats);
  const prior=structuredClone(events),input=structuredClone(c);let error:unknown;
  try{assertRepresentableEvents(c,events);}catch(e){error=e;}
  expect(error).toBeInstanceOf(ModelScopeError);
  expect((error as ModelScopeError).code).toBe('wpw-antegrade-clock');
  expect((error as ModelScopeError).previousBeat).toBeNull();
  expect((error as ModelScopeError).intervalMs).toBeNull();
  expect(String(error)).toContain('no representa');
  expect(events).toEqual(prior);expect(c).toEqual(input);
  expect(()=>synthesize(c,10)).toThrow(ModelScopeError);
  expect(()=>synthesize({...c,conduction:'normal'},10)).not.toThrow();
 });
 it('does not accept a PR number without its actual conducted atrial event',()=>{
  const events:EventSeries={atria:[],spikes:[],beats:[{time:1,kind:'normal',pr:.16,rr:1,qt:.4,qrs:.12}]};
  expect(()=>assertRepresentableEvents(base,events)).toThrow(ModelScopeError);
  events.atria=[{time:.84,conducted:true,pr:.16,kind:'sinus'}];
  expect(()=>assertRepresentableEvents(base,events)).not.toThrow();
  events.atria[0].time=.7;
  expect(()=>assertRepresentableEvents(base,events)).toThrow(ModelScopeError);
 });
 it.each([{rhythm:'sinus'},{rhythm:'sinus',ectopy:'pac'},{rhythm:'sinus',ectopy:'pvc'},{rhythm:'paced',pacing:'AAI'}] as Partial<ECGCase>[])
 ('preserves explicitly represented antegrade examples %j',changes=>{
  const c={...base,...changes};expect(()=>synthesize(c,10)).not.toThrow();
 });
 it.each([{rhythm:'vt'},{rhythm:'paced',pacing:'VVI'},{rhythm:'sinus',av:'complete',escape:'ventricular'},{rhythm:'asystole'}] as Partial<ECGCase>[])
 ('does not invent a delta or reject a calendar where no normal beat receives it %j',changes=>{
  expect(()=>synthesize({...base,...changes},10)).not.toThrow();
 });
});
