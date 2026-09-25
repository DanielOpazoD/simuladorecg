import { describe, expect, it } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { compareSignalContract, assertPresetSet } from '../scripts/lib/fidelity-contracts.mjs';

const original=synthesize(fromPreset(presetById('sinus')),10);
describe('CI gate rejects corrupt signals, not just reports their differences',()=>{
 it('accepts the unchanged signal',()=>expect(compareSignalContract(original,structuredClone(original),{exact:true}).maxDifferenceMv).toBe(0));
 it.each([
  ['precordial amplitude',s=>s.leads.V2[10]+=.001,/protected samples changed/],
  ['negative algebraic error',s=>s.leads.III[10]-=.001,/electrical identity/],
  ['NaN',s=>s.leads.V3[10]=NaN,/nonfinite/],
  ['channel length',s=>s.leads.V6=s.leads.V6.slice(1),/sample count/],
  ['absent channel',s=>delete s.leads.V5,/lead set/],
  ['activation time',s=>s.events.beats[0].time+=.002,/calendar changed/],
  ['QT reference',s=>s.events.beats[0].qt+=.002,/calendar changed/],
 ])('rejects deliberate mutation: %s',(_name,mutate,error)=>{
   const corrupted=structuredClone(original);mutate(corrupted);
   expect(()=>compareSignalContract(original,corrupted,{exact:true})).toThrow(error);
 });
 it('allows an intended regional sample difference only when the explicit exact contract is off',()=>{
  const changed=structuredClone(original);changed.leads.V2[10]+=.001;
  expect(compareSignalContract(original,changed,{exact:false}).maxDifferenceMv).toBeGreaterThan(0);
 });
 it('refuses to silently lose a preset from the comparison',()=>{
  expect(()=>assertPresetSet([{id:'a',strategy:'vectorial'}],[])).toThrow(/preset set changed/);
 });
 it('rejects an empty reference set',()=>expect(()=>assertPresetSet([],[])).toThrow(/empty reference/));
});
