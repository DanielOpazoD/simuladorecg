import {describe,it,expect} from 'vitest';
import {DEFAULT_CASE,cloneCase,normalizeCase,LEADS} from '../src/engine/types';
import {generateEvents} from '../src/engine/rhythm';
import {synthesize} from '../src/engine/signal';
import {nominalVentricularRR} from '../src/engine/repolarization';
import {controls} from '../src/ui/controls';
import {rhythmControlState} from '../src/ui/rhythm-controls';
const demand=()=>({...cloneCase(DEFAULT_CASE),rhythm:'paced' as const,pacing:'VVI' as const,pacingBehavior:'demand' as const,intrinsicRate:0,hr:60});
describe('VVI demand in the actual generator, with guaranteed capture only',()=>{
 it('captures each stimulus when intrinsic activity is absent',()=>{
  const s=synthesize(demand(),10);expect(s.events.spikes.length).toBe(10);expect(s.events.beats.length).toBe(10);
  for(const b of s.events.beats)expect(s.events.spikes.some(t=>Math.abs(b.time-t-.005)<1e-9)).toBe(true);
 });
 it('inhibits actual generated stimuli when intrinsic events are faster',()=>{
  const c={...demand(),intrinsicRate:90},s=synthesize(c,10);
  expect(s.events.spikes.length).toBe(0);expect(s.events.beats.every(b=>b.kind==='ventricular')).toBe(true);
  expect(nominalVentricularRR(c)).toBeCloseTo(2/3,12);
 });
 it('retains old VVI sequences in fixed mode and ignores the inactive intrinsic control',()=>{
  const c={...demand(),pacingBehavior:'fixed' as const};
  expect(generateEvents({...c,intrinsicRate:90},10)).toEqual(generateEvents(c,10));
 });
 it('retains the captured historical waveform with no intrinsic source',()=>{
  const c=demand(),a=synthesize(c,10),b=synthesize({...c,pacingBehavior:'fixed'},10);
  for(const lead of LEADS)expect(a.leads[lead].every((v,i)=>v===b.leads[lead][i]),lead).toBe(true);
 });
 it('rejects unsupported capture-failure imports rather than silently turning capture on',()=>{
  expect(()=>normalizeCase({...demand(),pacingCapture:'no'})).toThrow(/captura/);
 });
 it('rejects invalid imported modes and nonfinite intrinsic rates',()=>{
  expect(()=>normalizeCase({...demand(),pacingBehavior:'unknown'})).toThrow();
  expect(()=>normalizeCase({...demand(),intrinsicRate:NaN})).toThrow();
 });
 it('labels the controller rate separately from intrinsic ventricular activity',()=>{
  expect(rhythmControlState(demand()).baseRateLabel).toBe('Frecuencia mínima VVI');
  const html=controls(demand());expect(html).toContain('captura garantizada');
  expect(html).toMatch(/data-key="intrinsicRate"[^>]*>/);
 });
});
