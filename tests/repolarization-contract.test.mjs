import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {PHYSICAL_LEADS,beatWindows,assertTraceContract,assertSampleRegion} from './support/repolarization-contract.mjs';
function fixture() {
  const leads=Object.fromEntries(PHYSICAL_LEADS.map(l=>[l,new Float64Array(600)]));
  // Independent rectangular fixture: 180-ms QRS, ST and negative T, not the generator.
  for(const l of PHYSICAL_LEADS){leads[l].fill(1,100,190);leads[l].fill(-.05,190,220);leads[l].fill(-.2,220,310);}
  return {fs:500,duration:1.2,leads,events:{atria:[],spikes:[],beats:[{time:.2,qrs:.18,qt:.42,rr:1,kind:'normal'}]},truth:{axis:20},warnings:[]};
}
describe('Independent repolarization contract must discriminate six seeded defects',()=>{
  it('accepts a distinct unchanged copy and covers all twelve channels',()=>{
    const a=fixture(),r=assertTraceContract(a,structuredClone(a));assert.equal(r.checked,7200);
    const w=beatWindows(a.events.beats[0]);assert.equal(Math.round((w.qrs[1]-w.qrs[0])*a.fs),90);
  });
  const mutations={
    'shift QRS':s=>{for(const l of PHYSICAL_LEADS){s.leads[l][100]=0;s.leads[l][190]=1;}},
    'invert T':s=>{for(const l of PHYSICAL_LEADS)for(let i=220;i<310;i++)s.leads[l][i]*=-1;},
    'alter ST':s=>{s.leads.II[205]+=.1;},
    'scale one lead':s=>{for(let i=0;i<600;i++)s.leads.V6[i]*=2;},
    'drop event':s=>{s.events.beats.pop();},
    'seconds as milliseconds':s=>{s.events.beats[0].qrs=180;},
  };
  for(const [name,mutate] of Object.entries(mutations))it(`rejects ${name}`,()=>{
    const a=fixture(),b=structuredClone(a);mutate(b);assert.throws(()=>assertTraceContract(a,b));
  });
  it('does not hide millisecond or submillisecond event units',()=>{
    assert.throws(()=>beatWindows({time:1,qrs:180,qt:420}),/seconds/);
    assert.throws(()=>beatWindows({time:1,qrs:.00018,qt:.42}),/seconds/);
  });
  it('rejects empty regions rather than accepting a vacuous comparison',()=>{
    const a=fixture();assert.throws(()=>assertSampleRegion(a,a,.2,.2),/empty/);
  });
  it('checks the terminal QRS, not only a sample near onset',()=>{
    const a=fixture(),b=structuredClone(a);b.leads.V5[185]+=.01;
    const [start,end]=beatWindows(a.events.beats[0]).qrs;
    assert.throws(()=>assertSampleRegion(a,b,start,end),/V5/);
  });
});
