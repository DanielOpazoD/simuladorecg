import {it,expect} from 'vitest';
import {wpwDeltaVector,qrsAmplitudeScale} from '../src/engine/morphology';
import {frontal} from '../src/engine/leads';
import {fromPreset,presetById} from '../src/presets/catalog';
const c=fromPreset(presetById('wpw')!);
it.each([-2,-.1,-.001,-Number.EPSILON,0,1,1+Number.EPSILON,1.001,2])('has no source contribution outside open support at phase %s',phase=>{
 expect(wpwDeltaVector(c,phase)).toEqual([0,0,0]);
});
it('preserves every interior coefficient instead of moving events to the sample grid',()=>{
 for(const phase of [Number.EPSILON,.001,.1,.5,.9,.999,1-Number.EPSILON])for(const qrsAmp of [.1,1,3])for(const electrolyte of ['none','lowvoltage'] as const){
  const settings={...c,qrsAmp,electrolyte},v=frontal(c.axis,.25,.03),gain=qrsAmplitudeScale(settings)*Math.sin(Math.PI*phase);
  expect(wpwDeltaVector(settings,phase)).toEqual(v.map(x=>x*gain));
 }
});

import {synthesize} from '../src/engine/signal';
import {wpwNativeLeadII} from './support/wpw-native-pulse';
it.each([90,100,100.3,101.7])('matches independently bounded native delta and secondary ST through acquisition at PR %s ms',pr=>{
 for(const filter of ['off','diagnostic','monitor','aggressive'] as const){
  const settings={...c,pr,filter,hr:73,variability:0,pAmp:0,tAmp:0,st:0},actual=synthesize(settings,10),without=synthesize({...settings,conduction:'normal'},10);
  const expected=wpwNativeLeadII(settings,10,false,true);let error=0;
  for(let i=0;i<expected.length;i++)error=Math.max(error,Math.abs(actual.leads.II[i]-without.leads.II[i]-expected[i]));
  expect(error).toBeLessThan(1e-10);
 }
});
