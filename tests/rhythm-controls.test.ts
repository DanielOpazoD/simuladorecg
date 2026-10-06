import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE, cloneCase, type ECGCase } from '../src/engine/types';
import { rhythmControlState } from '../src/ui/rhythm-controls';
import { controls } from '../src/ui/controls';
const state=(patch:Partial<ECGCase>)=>rhythmControlState({...cloneCase(DEFAULT_CASE),...patch});
describe('Control applicability follows the implemented rhythm clock',()=>{
  it('flutter exposes only its atrial/conduction clock',()=>expect(state({rhythm:'flutter'})).toMatchObject({baseRateDisabled:true,atrialRateDisabled:false,variabilityDisabled:true,prDisabled:true}));
  it('complete sinus AV block separates escape from independent atria',()=>expect(state({av:'complete'})).toMatchObject({baseRateLabel:'Frecuencia de escape',atrialRateDisabled:false,variabilityDisabled:true,prDisabled:true}));
  it('a stale AV option must not relabel VT rate as atrial or escape',()=>{
    expect(state({rhythm:'vt',av:'two_one'})).toMatchObject({baseRateLabel:'Frecuencia base',atrialRateDisabled:false});
    expect(state({rhythm:'vt',av:'complete'}).baseRateLabel).toBe('Frecuencia base');
  });
  it.each(['vf','asystole'] as const)('does not offer rate control without scheduled beats in %s',rhythm=>expect(state({rhythm})).toMatchObject({baseRateDisabled:true,prDisabled:true}));
  it('enables ectopic coupling only when it acts',()=>{
    expect(state({ectopy:'none'}).couplingDisabled).toBe(true);
    expect(state({ectopy:'pvc'}).couplingDisabled).toBe(false);
    expect(state({ectopy:'pvc',av:'first'}).couplingDisabled).toBe(true);
  });
  it('paced PR acts only with an atrial stimulus',()=>{
    expect(state({rhythm:'paced',pacing:'VVI'}).prDisabled).toBe(true);
    expect(state({rhythm:'paced',pacing:'DDD'}).prDisabled).toBe(false);
  });
  it('renders native disabled controls without modifying the case',()=>{
    const c={...cloneCase(DEFAULT_CASE),rhythm:'flutter' as const},copy=structuredClone(c),html=controls(c);
    for(const key of ['hr','pr','variability','coupling'])expect(html.match(new RegExp(`<input[^>]*data-key="${key}"[^>]*>`))?.[0]).toContain('disabled');
    expect(html.match(/<input[^>]*data-key="atrialRate"[^>]*>/)?.[0]).not.toContain('disabled');
    expect(c).toEqual(copy);
  });
});
