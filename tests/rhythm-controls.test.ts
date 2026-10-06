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

describe('Ventricular source control applicability',()=>{
  it.each(['af','flutter','vt','paced'] as const)('stale complete AV does not enable escape in %s',rhythm=>{
    expect(state({rhythm,av:'complete'}).escapeDisabled).toBe(true);
  });
  it('keeps escape active only for complete sinus AV block',()=>{
    expect(state({rhythm:'sinus',av:'complete'}).escapeDisabled).toBe(false);
    expect(state({rhythm:'sinus',av:'normal'}).escapeDisabled).toBe(true);
  });
  it.each([
    {rhythm:'vt'},{rhythm:'torsades'},{rhythm:'idioventricular'},
    {rhythm:'paced',pacing:'VVI'},{rhythm:'paced',pacing:'DDD'},
    {rhythm:'sinus',av:'complete',escape:'ventricular'},
  ] as Partial<ECGCase>[])('source-driven complexes disable overridden QRS controls: %j',patch=>{
    expect(state(patch)).toMatchObject({conductionDisabled:true,qrsAxisDisabled:true});
  });
  it.each([
    {rhythm:'sinus',ectopy:'pvc'}, {rhythm:'sinus',av:'complete',escape:'junctional'},
    {rhythm:'paced',pacing:'AAI'}, {rhythm:'af'}, {rhythm:'junctional'},
  ] as Partial<ECGCase>[])('retains controls that act on conducted beats: %j',patch=>{
    expect(state(patch)).toMatchObject({conductionDisabled:false,qrsAxisDisabled:false});
  });
});

// A disabled UI field must actually be inert in the sampled model, not merely
// absent from a visually plausible label. These are counterfactual controls.
import { synthesize } from '../src/engine/signal';
import { LEADS } from '../src/engine/types';
describe('Control applicability agrees with sampled effects',()=>{
  it.each([
    {rhythm:'vt'},{rhythm:'torsades'},{rhythm:'idioventricular'},
    {rhythm:'paced',pacing:'VVI'},{rhythm:'paced',pacing:'DDD'},
    {rhythm:'sinus',av:'complete',escape:'ventricular'},
  ] as Partial<ECGCase>[])('overridden axis and conduction leave samples stable: %j',patch=>{
    const c={...cloneCase(DEFAULT_CASE),...patch}, a=synthesize(c,3);
    for(const change of [{axis:-123},{conduction:'rbbb' as const}]){
      const b=synthesize({...c,...change},3);
      for(const lead of LEADS) expect(b.leads[lead]).toEqual(a.leads[lead]);
    }
  });
});

describe('Native contextual conduction disclosure',()=>{
  it('groups inactive fields once, preserves their values, and leaves rhythm selectable',()=>{
    const c={...cloneCase(DEFAULT_CASE),rhythm:'af' as const,av:'complete' as const};
    const html=controls(c),start=html.indexOf('<details class="inactive-controls"'),end=html.indexOf('</details>',start);
    expect(start).toBeGreaterThan(0);
    expect(html.slice(start,end)).toContain('data-key="escape" disabled');
    expect(html.slice(start,end)).toContain('data-key="av" disabled');
    expect(html.slice(start,end)).not.toContain('data-key="rhythm"');
    expect(html.match(/data-key="escape"/g)).toHaveLength(1);
    expect(html.slice(start,end)).toContain('value="complete" selected');
    expect(html.slice(start,html.indexOf('>',start))).not.toContain(' open');
  });
});
