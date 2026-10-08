import {describe,it,expect} from 'vitest';
import {regionalActivationState,regionalActivationTimeline} from '../src/engine/regional-activation';
import {qrsKernels,qrsKernelValue} from '../src/engine/morphology';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {normalizeImportedCase} from '../src/presets/case-context';
import {activationPair} from '../src/ui/activation-model';
import type {Beat} from '../src/engine/types';
const setup=()=>({...fromPreset(presetById('lbbb')!),activationModel:'regional-lbbb-v1' as const,filter:'off' as const,hr:60,variability:0,pAmp:0,tAmp:0,st:0});
const beat:Beat={time:1,rr:1,kind:'normal'};
describe('Explicit experimental LBBB regional clock',()=>{
  it('preserves requested incompatible modes and uses a distinct domain',()=>{
    const c=setup();expect(regionalActivationState(c).active).toBe(true);
    expect(regionalActivationState({...c,qrs:120}).active).toBe(false);
    expect(regionalActivationState({...c,conduction:'rbbb'}).active).toBe(false);
    expect(normalizeImportedCase(c).activationModel).toBe('regional-lbbb-v1');
  });
  it('holds the early source fixed in absolute time while delayed supports advance',()=>{
    const c=setup(),a=qrsKernels({...c,qrs:130},beat),b=qrsKernels({...c,qrs:230},beat);
    for(let ms=0;ms<=50;ms+=.5)for(let j=0;j<3;j++)
      expect(qrsKernelValue(a[0],ms/130)*a[0].v[j]).toBeCloseTo(qrsKernelValue(b[0],ms/230)*b[0].v[j],12);
    const x=regionalActivationTimeline(130,'regional-lbbb-v1'),y=regionalActivationTimeline(230,'regional-lbbb-v1');
    expect(x[0]).toEqual(y[0]);expect(y[2].startMs).toBeGreaterThan(x[2].startMs);
    expect(y[3].endMs).toBe(230);
  });
  it('preserves events and exposes the actually applied model in the existing activation viewer',()=>{
    const c=setup(),a=synthesize({...c,activationModel:'template'},10),b=synthesize(c,10);
    expect(a.events).toEqual(b.events);expect(b.leads.V1).not.toEqual(a.leads.V1);
    const pair=activationPair(c,beat,'unchanged');
    expect(pair.a.timing.applied).toBe('regional-lbbb-v1');
    expect(pair.a.timing.regions[0].region).toBe('rv-septal');
  });
  it('retains sampled LBBB polarity and moves the lateral peak later when QRS widens',()=>{
    let previous=0;
    for(const qrs of [130,160,200,240]){
      const s=synthesize({...setup(),qrs},10),b=s.events.beats.find(b=>b.time>3)!;
      const segment=(l:'V1'|'V6')=>Array.from(s.leads[l].slice(Math.ceil(b.time*s.fs),Math.floor((b.time+qrs/1000)*s.fs)));
      const v1=segment('V1'),v6=segment('V6'),peak=Math.max(...v6),time=v6.indexOf(peak)*1000/s.fs;
      expect(Math.min(...v1)).toBeLessThan(-.1);expect(peak).toBeGreaterThan(.1);
      expect(time).toBeGreaterThan(previous);previous=time;
    }
  });
});
