import {describe,it,expect} from 'vitest';
import {LEAD_REGISTRY} from '../src/engine/lead-registry';
import {DOWER,frontal,project,axisFromLeads} from '../src/engine/leads';
const historical=(axis:number,amp:number,z=0):[number,number,number]=>{
 const a=axis*Math.PI/180,i=amp*Math.cos(a)-.059*z,ii=amp*Math.cos(a-Math.PI/3)+.132*z;
 const det=.632*1.066+.235*.235;
 return[(i*1.066+.235*ii)/det,(.632*ii-.235*i)/det,z];
};
describe('One immutable frontal projection contract',()=>{
 it('prevents accidental mutation of calibrated projection coefficients',()=>{
  expect(Object.isFrozen(LEAD_REGISTRY)).toBe(true);
  for(const row of Object.values(LEAD_REGISTRY)){
   expect(Object.isFrozen(row)).toBe(true);
   expect(Object.isFrozen('projection' in row?row.projection:row.from)).toBe(true);
  }
  expect(Object.isFrozen(DOWER)).toBe(true);
  for(const row of Object.values(DOWER))expect(Object.isFrozen(row)).toBe(true);
 });
 it('rejects attempted coefficient mutation without changing forward or inverse projection',()=>{
  const before=project(frontal(63,.7,.4));
  const attempts:[object,PropertyKey,unknown][]=[[LEAD_REGISTRY.I.projection,0,99],[DOWER.I,0,99],[LEAD_REGISTRY.I,'group','chest']];
  for(const [target,key,value] of attempts){
   const previous=Reflect.get(target,key),changed=Reflect.set(target,key,value);
   // Restore a vulnerable predecessor before asserting, so red tests cannot
   // corrupt subsequent tests in the same module instance.
   if(changed)Reflect.set(target,key,previous);
   expect(changed).toBe(false);expect(project(frontal(63,.7,.4))).toEqual(before);
  }
 });
 it('preserves historical inverse bytes and independent I/II geometry over axes, signed amplitudes and Z',()=>{
  for(let angle=-180;angle<=180;angle+=3)for(const amp of [-1,-.1,0,.1,1])for(const z of [-2,-.3,0,.3,2]){
   const v=frontal(angle,amp,z);expect(v).toEqual(historical(angle,amp,z));
   const p=project(v),a=angle*Math.PI/180;
   expect(p.I).toBeCloseTo(amp*Math.cos(a),12);expect(p.II).toBeCloseTo(amp*Math.cos(a-Math.PI/3),12);
   if(amp>0){const err=((axisFromLeads(p.I,p.II)-angle+540)%360)-180;expect(Math.abs(err)).toBeLessThan(1e-10);}
  }
 });
});
