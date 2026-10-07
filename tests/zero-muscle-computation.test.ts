import {it,expect,vi} from 'vitest';
const calls=vi.hoisted(()=>({count:0}));
vi.mock('../src/engine/random',async importOriginal=>{
 const api=await importOriginal<typeof import('../src/engine/random')>();
 return {...api,normal:(r:()=>number)=>{calls.count++;return api.normal(r);}};
});
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {assertExactSamples} from './support/exact-samples';
const load=()=>({...fromPreset(presetById('asystole')!),filter:'off' as const,notch:0 as const});

it('does not draw unused muscle variates at exactly zero amplitude',()=>{
 const c=load();c.artifacts={baseline:0,muscle:0,mains:0,loose:0,reversed:false};
 calls.count=0;const s=synthesize(c,10);
 expect(calls.count).toBe(0);
 for(const lead of Object.values(s.leads))expect(lead.every(x=>x===0)).toBe(true);
});
it('retains even arbitrarily small nonzero artifacts and deterministic reset',()=>{
 const c=load();c.artifacts={baseline:0,muscle:1e-12,mains:0,loose:0,reversed:false};
 calls.count=0;const a=synthesize(c,10);expect(calls.count).toBeGreaterThan(0);
 expect(a.leads.II.some(x=>x!==0)).toBe(true);
 synthesize({...c,artifacts:{...c.artifacts,muscle:0}},10);
 const b=synthesize(c,10);
 for(const lead of Object.keys(a.leads) as (keyof typeof a.leads)[])assertExactSamples(b.leads[lead],a.leads[lead],lead);
});
it('preserves the active branch and its linear gain response',()=>{
 const c=load();c.artifacts={baseline:0,muscle:.1,mains:0,loose:0,reversed:false};
 const a=synthesize(c,10),b=synthesize({...c,artifacts:{...c.artifacts,muscle:.2}},10);
 for(const lead of Object.keys(a.leads) as (keyof typeof a.leads)[])assertExactSamples(b.leads[lead],Float64Array.from(a.leads[lead],x=>2*x),lead);
});
