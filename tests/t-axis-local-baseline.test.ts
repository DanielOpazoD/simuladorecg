import {describe, it, expect} from 'vitest';
import {fixture} from './fixtures';
import {analyzeSamples} from '../src/engine/sample-analysis';

function drifting(fs:number, slope:number, dc=0) {
 const s=fixture({fs});
 for(let i=0;i<s.leads.I.length;i++) {
  const v=dc+slope*i/fs;
  s.leads.I[i]+=v;s.leads.III[i]-=v;s.leads.aVR[i]-=v/2;
  s.leads.aVL[i]+=v;s.leads.aVF[i]-=v/2;
 }
 return s;
}
describe('T-peak direction uses its interpolated baseline',()=>{
 it.each([250,500,1000])('does not attribute linear drift to T direction at %s Hz',fs=>{
  // Analytic lead scales are I=.7 and II=1. The reference does not use the generator.
  const truth=Math.atan2(1.3/Math.sqrt(3),.7)*180/Math.PI;
  for(const slope of [-.05,-.01,0,.01,.05]) {
   const s=drifting(fs,slope),snapshot=structuredClone(s),m=analyzeSamples(s);
   expect(m.tAxis).not.toBeNull();
   // The anchor medians span finite windows. 0.15° is a fixture bound,
   // not a general drift guarantee or clinical accuracy specification.
   expect(Math.abs(m.tAxis!-truth)).toBeLessThan(.15);
   expect(m.hr).toBe(60);expect(s).toEqual(snapshot);
  }
 });
 it('retains ordinary direction and DC-offset invariance',()=>{
  const plain=analyzeSamples(drifting(500,0));
  expect(plain.tAxis).toBeCloseTo(46.99608805717719,10);
  for(const dc of [-3,3])expect(analyzeSamples(drifting(500,0,dc)).tAxis)
   .toBeCloseTo(plain.tAxis!,10);
 });
});
