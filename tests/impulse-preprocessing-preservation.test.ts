import assert from 'node:assert/strict';
import {describe,it,expect} from 'vitest';
import {fixture} from './fixtures';
import {suppressImpulses} from '../src/engine/analysis/impulses';

const active=['I','II','V1','V5'];
describe('impulse preprocessing allocation contract',()=>{
 it.each([100,250,500,1000])('preserves pass-through identity without impulses at %s Hz',fs=>{
  const s=fixture({fs}),snapshot=structuredClone(s),r=suppressImpulses(s);
  expect(r.masks).toEqual([]);expect(r.signal).toBe(s);expect(s).toEqual(snapshot);
 });
 it.each([500,1000])('preserves exact masks and copy-on-write channel identity at %s Hz',fs=>{
  for(const sign of [-1,1]) {
   const s=fixture({fs});
   for(const lead of Object.keys(s.leads) as (keyof typeof s.leads)[])
    for(const t of [.5,2,5,9.5])s.leads[lead][Math.round(t*fs)]+=sign*10;
   const snapshot=structuredClone(s),r=suppressImpulses(s);
   expect(r.masks).toEqual([.5,2,5,9.5].map(t=>({start:(Math.round(t*fs)-Math.round(.034*fs))/fs,end:(Math.round(t*fs)+Math.round(.008*fs))/fs})));
   expect(s).toEqual(snapshot);
   for(const lead of Object.keys(s.leads) as (keyof typeof s.leads)[]) {
    expect(r.signal.leads[lead]===s.leads[lead]).toBe(!active.includes(lead));
    for(let i=0;i<s.leads[lead].length;i++) {
     const masked=active.includes(lead)&&r.masks.some(m=>i/fs>=m.start&&i/fs<=m.end);
     if(!masked)assert.equal(r.signal.leads[lead][i],s.leads[lead][i],`Unmasked ${lead} sample ${i} changed`);
    }
   }
   expect(r.signal.leads.I[Math.round(.5*fs)]).toBe(0);
  }
 });
 it('does not reuse stale data when the caller modifies the same input object',()=>{
  const s=fixture();expect(suppressImpulses(s).masks).toEqual([]);
  for(const lead of active)s.leads[lead as 'I'][250]+=10;
  expect(suppressImpulses(s).masks).toHaveLength(1);
 });
});
