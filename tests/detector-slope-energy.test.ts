import {describe,it,expect} from 'vitest';
import {detectVentricularCandidates} from '../src/engine/analysis/ventricular-candidates';
import {fixture} from './fixtures';
const names=['I','II','V1','V5'] as const;
// Independent array-based oracle preserves the documented four-channel order.
// No generator, candidate identity, diagnosis or event reference enters the sum.
function oracle(leads:ReturnType<typeof fixture>['leads'],fs:number){
 const n=Math.min(leads.I.length,Math.round(10*fs)),win=Math.round(.018*fs);
 const slope=Float64Array.from({length:n},(_,i)=>i?Math.hypot(...names.map(l=>(leads[l][i]-leads[l][i-1])*fs)):0);
 const energy=new Float64Array(n);let sum=0;
 for(let i=0;i<n;i++){sum+=slope[i];if(i>=win)sum-=slope[i-win];energy[i]=sum/win;}
 return energy;
}
describe('Allocation-free slopes retain exact four-channel arithmetic',()=>{
 it.each([100,250,500,1000])('preserves raw energy and inputs at %s Hz',fs=>{
  const s=fixture({fs}),copy=structuredClone(s),out=detectVentricularCandidates(s);
  expect(out.energy).toEqual(oracle(out.leads as typeof s.leads,fs));
  expect(s).toEqual(copy);
 });
 // At 250 Hz the discrete 2/8 ms offsets yield a ratio of two for a single impulse,
 // so that fixture does not trigger the unchanged >3.5 gate.
 it.each([500,1000])('preserves the median-filter impulse branch at %s Hz',fs=>{
  const s=fixture({fs});for(const lead of names)s.leads[lead][Math.round(2.1*fs)]+=100;
  const copy=structuredClone(s),out=detectVentricularCandidates(s);
  expect(out.leads.I).not.toBe(s.leads.I);
  expect(out.energy).toEqual(oracle(out.leads as typeof s.leads,fs));expect(s).toEqual(copy);
 });
 it('does not cache stale channel data between calls or threshold settings',()=>{
  const s=fixture(),first=detectVentricularCandidates(s);
  for(const lead of names)s.leads[lead].fill(0);
  for(const candidateFraction of [.35,.6]){
   const next=detectVentricularCandidates(s,{candidateFraction});
   expect(first.peaks.length).toBeGreaterThan(0);expect(next.peaks).toEqual([]);
   expect(next.energy.every(v=>v===0)).toBe(true);
  }
 });
});
