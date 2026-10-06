import {describe,it,expect} from 'vitest';
import {DEFAULT_CASE,cloneCase,normalizeCase} from '../src/engine/types';
import {generateEvents} from '../src/engine/rhythm';
import {nominalVentricularRR,assignRepolarization} from '../src/engine/repolarization';
import {synthesize} from '../src/engine/signal';
import {controls} from '../src/ui/controls';
import {changeCase,isCaseControlKey} from '../src/ui/case-state';
const flutter=(pattern:'fixed'|'2-3'|'3-4')=>({...cloneCase(DEFAULT_CASE),rhythm:'flutter' as const,flutterPattern:pattern,atrialRate:300,filter:'off' as const});
describe('variable flutter has an explicit atrial-cycle conduction sequence',()=>{
 it.each([['2-3',[2,3]],['3-4',[3,4]]] as const)('%s preserves integer atrial cycles', (pattern,ratios)=>{
  const c=flutter(pattern),b=generateEvents(c,10).beats;
  for(let i=1;i<b.length;i++)expect((b[i].time-b[i-1].time)/(60/c.atrialRate)).toBeCloseTo(ratios[(i-1)%2],11);
  expect(nominalVentricularRR(c)).toBeCloseTo((ratios[0]+ratios[1])/2*.2,12);
  assignRepolarization(c,b);expect(b[0].adaptedRR).toBeCloseTo(nominalVentricularRR(c),12);
 });
 it('changing a disabled fixed ratio or base rate cannot alter the variable signal',()=>{
  const c=flutter('2-3'),a=synthesize({...c,flutterRatio:4,hr:200},10),b=synthesize(c,10);
  for(const lead of Object.keys(a.leads) as (keyof typeof a.leads)[])expect(a.leads[lead].every((v,i)=>v===b.leads[lead][i]),lead).toBe(true);
 });
 it('changing atrial rate scales the same sequence without a new random schedule',()=>{
  const a=generateEvents(flutter('2-3'),10).beats,b=generateEvents({...flutter('2-3'),atrialRate:240},10).beats;
  for(let i=1;i<Math.min(a.length,b.length);i++)expect((b[i].time-b[i-1].time)/(a[i].time-a[i-1].time)).toBeCloseTo(1.25,11);
 });
 it('old cases and fixed mode retain identical events',()=>{
  const c=flutter('fixed');delete (c as Partial<typeof c>).flutterPattern;
  expect(generateEvents(c,10)).toEqual(generateEvents(flutter('fixed'),10));
 });
 it('normalizes the new field, rejects unknown values and applies it through existing controls',()=>{
  expect(isCaseControlKey('flutterPattern')).toBe(true);
  expect(changeCase(flutter('fixed'),'flutterPattern','2-3').flutterPattern).toBe('2-3');
  expect(()=>normalizeCase({...flutter('fixed'),flutterPattern:'random'})).toThrow();
 });
 it('shows sequence scope and disables only the inactive fixed-ratio selector',()=>{
  const html=controls(flutter('2-3'));
  expect(html).toMatch(/data-key="flutterRatio"[^>]*disabled/);
  expect(html).toContain('Secuencia docente');
 });
});
