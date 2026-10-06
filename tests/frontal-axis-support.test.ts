import {describe,it,expect} from 'vitest';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {fixture} from './fixtures';
import {derive} from '../src/engine/leads';
import type {Lead} from '../src/engine/types';

function frontal(scale:number, dcI=0,dcII=0) {
  const s=fixture();
  for(let i=0;i<s.leads.I.length;i++){
    const v=derive({I:s.leads.I[i]*scale+dcI,II:s.leads.II[i]*scale+dcII} as Record<Lead,number>);
    for(const l of ['I','II','III','aVR','aVL','aVF'] as const)s.leads[l][i]=v[l];
  }
  return s;
}
describe('Zero frontal information is not a measured zero-degree axis',()=>{
  it.each([[0,0],[3,7]])('retires axes when both independent frontal channels are flat (%s,%s mV DC)',(a,b)=>{
    const s=frontal(0,a,b),before=structuredClone(s),m=analyzeSamples(s);
    expect(m.qrs).not.toBeNull();expect(m.hr).not.toBeNull();
    expect(m.axis).toBeNull();expect(m.pAxis).toBeNull();expect(m.tAxis).toBeNull();
    expect(m.evidence.axis.status).toBe('unavailable');expect(m.evidence.axis.reason).toContain('I y II');
    expect(m.rejected?.axis).toBe(0);expect(s).toEqual(before);
  });
  it('does not invent a clinical low-voltage cutoff',()=>{
    expect(analyzeSamples(frontal(1e-14)).axis).not.toBeNull();
  });
  it('does not reject a legitimate axis with only one flat limb channel',()=>{
    const s=fixture();s.leads.I.fill(0);const m=analyzeSamples(s);
    expect(m.axis).not.toBeNull();
  });
  it('keeps ordinary numerical results and candidates',()=>{
    const m=analyzeSamples(frontal(1));expect(m.axis).toBeCloseTo(46.996088,5);
    expect(m.evidence.axis.status).toBe('usable');expect(m.beats.length).toBe(8);
  });
});
