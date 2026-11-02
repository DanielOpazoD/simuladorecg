import {describe,it,expect} from 'vitest';
import {fromPreset,presetById} from '../src/presets/catalog';
import {quickAdjustmentControls,controls} from '../src/ui/controls';
import {changeCase} from '../src/ui/case-state';
const load=(id:string)=>fromPreset(presetById(id)!);
const enabled=(id:string)=>quickAdjustmentControls(load(id)).filter(f=>!f.disabled).map(f=>f.key);

describe('Ajustar ECG: six existing parameters, one definition',()=>{
 it('keeps targets intact and can omit all six from the secondary inspector',()=>{
  const c=load('sinus'),before=structuredClone(c),fields=quickAdjustmentControls(c);
  expect(fields.map(f=>f.key)).toEqual(['hr','pr','axis','qrs','conduction','qtc']);
  const secondary=controls(c,true,false);
  for(const f of fields){expect(secondary).not.toContain(`data-key="${f.key}"`);expect(controls(c)).toContain(`data-key="${f.key}"`);}
  expect(secondary).toContain('data-key="rhythm"');expect(c).toEqual(before);
 });
 it('integer targets from the learned examples are representable without slider rounding',()=>{
  for(const id of ['sinus','anterior','lbbb','wenckebach']){
   const c=load(id);
   for(const f of quickAdjustmentControls(c))if(f.kind==='number'&&!f.disabled){
    expect(f.value).toBe(c[f.key]);expect(f.value).toBeGreaterThanOrEqual(f.min);expect(f.value).toBeLessThanOrEqual(f.max);
    if(typeof f.step==='number')expect((f.value-f.min)%f.step).toBe(0);
   }
  }
 });
 it.each([
  ['sinus',['hr','pr','axis','qrs','conduction','qtc']],
  ['af',['hr','axis','qrs','conduction','qtc']],
  ['flutter',['axis','qrs','conduction','qtc']],
  ['complete',['hr','axis','qrs','conduction','qtc']],
  ['complete_v',['hr']],
  ['vt',['hr']],
  ['vvi',['hr']],
  ['vf',[]],['asystole',[]],
 ] as const)('%s only enables controls used by this event model',(id,keys)=>expect(enabled(id)).toEqual(keys));
 it('names the controlled rate clock without presenting it as ventricular rate',()=>{
  expect(quickAdjustmentControls(load('wenckebach'))[0].label).toBe('FC auricular');
  expect(quickAdjustmentControls(load('complete'))[0].label).toBe('FC escape');
  const c=load('vvi');c.pacingBehavior='demand-no-capture';
  const fields=quickAdjustmentControls(c);
  expect(fields[0].label).toBe('FC estímulos');expect(fields.filter(f=>!f.disabled).map(f=>f.key)).toEqual(['hr']);
 });
 it('preserves fractional imported targets instead of silently rounding the controls',()=>{
  const c=load('sinus');c.pr=144.5;
  const f=quickAdjustmentControls(c).find(f=>f.key==='pr')!;
  expect(f.value).toBe(144.5);expect(f.kind==='number'&&f.step).toBe('any');expect(c.pr).toBe(144.5);
 });
 it('retains QRS/QTc editing when an explicit historical source actually uses the targets',()=>{
  const c=load('vt');c.ventricularSource='representative_vt';
  expect(quickAdjustmentControls(c).filter(f=>!f.disabled).map(f=>f.key)).toEqual(['hr','qrs','qtc']);
 });
 it('VVI demand with an intrinsic escape retains and names its duration controls',()=>{
  const c=load('vvi');c.pacingBehavior='demand';c.intrinsicRate=90;c.hr=60;
  const fields=quickAdjustmentControls(c);
  expect(fields.filter(f=>!f.disabled).map(f=>f.key)).toEqual(['hr','qrs','qtc']);
  expect(fields.find(f=>f.key==='qrs')!.label).toBe('QRS escape');
  expect(fields.find(f=>f.key==='qtc')!.label).toBe('QTc escape');
 });
 it('reflects coordinated QRS/axis/PR transitions without writing a second model',()=>{
  const c=load('sinus'),next=changeCase(c,'conduction','wpw'),fields=quickAdjustmentControls(next);
  for(const key of ['qrs','axis','pr'] as const)expect(fields.find(f=>f.key===key)!.value).toBe(next[key]);
  expect(c.conduction).toBe('normal');expect(next.conduction).toBe('wpw');
  expect(controls(next,true,false)).not.toContain('data-key="conduction"');
 });
});
