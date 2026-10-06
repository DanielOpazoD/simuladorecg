import {describe,it,expect} from 'vitest';
import {cloneCase,DEFAULT_CASE,type ECGCase} from '../src/engine/types';
import {synthesize} from '../src/engine/signal';
import {controls} from '../src/ui/controls';
const input=(html:string,key:string)=>html.match(new RegExp(`<input[^>]*data-key="${key}"[^>]*>`))?.[0];
describe('wave controls describe components actually synthesized',()=>{
 it.each(['af','flutter','vf','asystole','idioventricular','torsades'] as const)('does not offer a P amplitude in %s without P events',rhythm=>{
   const c={...cloneCase(DEFAULT_CASE),rhythm},before=synthesize(c,10),after=synthesize({...c,pAmp:.4,pAxis:120},10);
   expect(before.events.atria).toEqual([]);
   expect(after.leads).toEqual(before.leads);
   for(const key of ['pAmp','pAxis'])expect(input(controls(c),key)).toContain('disabled');
 });
 it('VVI has no atrial stimulus; DDD and VT retain their atrial component',()=>{
   const c=cloneCase(DEFAULT_CASE);
   expect(input(controls({...c,rhythm:'paced',pacing:'VVI'}),'pAmp')).toContain('disabled');
   for(const patch of [{rhythm:'paced',pacing:'DDD'},{rhythm:'vt'}] as Partial<ECGCase>[])
     expect(input(controls({...c,...patch}),'pAmp')).not.toContain('disabled');
 });
 it('retrograde P amplitude acts but its fixed direction does not use sinus P axis',()=>{
   const c={...cloneCase(DEFAULT_CASE),rhythm:'junctional' as const};
   expect(input(controls(c),'pAmp')).not.toContain('disabled');
   expect(input(controls(c),'pAxis')).toContain('disabled');
 });
 it.each(['vf','asystole'] as const)('retires QRS and QT controls without organized beats in %s',rhythm=>{
   const c={...cloneCase(DEFAULT_CASE),rhythm};
   for(const key of ['qrs','qtc','axis','qrsAmp','tAxis'])expect(input(controls(c),key)).toContain('disabled');
 });
});
