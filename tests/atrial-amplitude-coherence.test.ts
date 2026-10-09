import {describe,it,expect} from 'vitest';
import {synthesize} from '../src/engine/signal';
import {cloneCase,DEFAULT_CASE,LEADS} from '../src/engine/types';
const c={...cloneCase(DEFAULT_CASE),rhythm:'junctional' as const,hr:48,qrs:60,variability:0,filter:'off' as const};
const atrialPeak=(s:ReturnType<typeof synthesize>)=>{
  const event=s.events.atria.find(a=>a.time>2&&a.time<5)!;
  // Isolated late retrograde P: past QRS+FIR support, before T−FIR support.
  const lo=Math.ceil((event.time+.04)*s.fs),hi=Math.floor((event.time+.07)*s.fs);
  return Math.max(...LEADS.flatMap(l=>Array.from(s.leads[l].slice(lo,hi),Math.abs)));
};
describe('P amplitude scales the full non-sinus atrial vector',()=>{
  it('zero P amplitude removes the isolated retrograde P in every lead',()=>{
    const s=synthesize({...c,pAmp:0},10,{learnedBase:false}); // retrograde P is a kernel component; isolate it in that model
    expect(atrialPeak(s)).toBeLessThan(1e-12);
  });
  it('doubling P amplitude doubles the isolated late atrial component',()=>{
    const a=synthesize({...c,pAmp:.15},10,{learnedBase:false}),b=synthesize({...c,pAmp:.3},10,{learnedBase:false});
    expect(atrialPeak(b)/atrialPeak(a)).toBeCloseTo(2,10);
    expect(b.events).toEqual(a.events);
  });
});
