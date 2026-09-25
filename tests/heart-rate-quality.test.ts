import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadLudb } from './reference/ludb/load-ludb.mjs';
import { analyzeSamples, heartRateDetectionQuality, HR_QUALITY_POLICY } from '../src/engine/sample-analysis';
import { measure } from '../src/engine/measure';
import { synthesize } from '../src/engine/signal';
import { PRESETS, fromPreset, presetById } from '../src/presets/catalog';
import type { Signal } from '../src/engine/types';

function withoutHRReason(m: ReturnType<typeof measure>) {
  const copy = structuredClone(m);
  copy.evidence.hr = { ...copy.evidence.hr, status: 'review', reason: '' };
  return copy;
}
function artificialSample(fs = 500): Pick<Signal, 'fs' | 'leads'> {
  // Independent triangular pulses on structured background. No ECG generator or labels.
  const n = fs * 10;
  const a = Float64Array.from({length:n}, (_, i) => {
    const t=i/fs;
    let v=.2*Math.sin(2*Math.PI*7.3*t)+.14*Math.sin(2*Math.PI*11.7*t);
    for(let beat=.5;beat<10;beat+=.8) {
      v+=1.5*Math.max(0,1-Math.abs(t-beat)/.025);
      v+=.6*Math.max(0,1-Math.abs(t-beat-.35)/.025);
    }
    return v;
  });
  const leads=Object.fromEntries(['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'].map((l,k)=>[l,Float64Array.from(a,v=>v*(1+k*.1))])) as Signal['leads'];
  return { fs,leads };
}

describe('Sample-only HR detection sensitivity, no numerical correction', () => {
  it.each([1,2,3,4,101,102,103,104])('preserves numerical analysis of known LUDB %s',id=>{
    const root=fileURLToPath(new URL('./reference/ludb/fixtures',import.meta.url));
    const {signal}=loadLudb(root,id<100?'development':'control',id);
    expect(withoutHRReason(analyzeSamples(signal))).toEqual(withoutHRReason(measure(signal)));
  });
  it.each(PRESETS.filter(p=>p.strategy!=='pending').map(p=>p.id))('preserves every numerical result in %s', id=>{
    const signal=synthesize(fromPreset(presetById(id)!),10);
    const clean=structuredClone(signal.leads), before=measure(signal), after=analyzeSamples(signal);
    expect(withoutHRReason(after)).toEqual(withoutHRReason(before));
    expect(signal.leads).toEqual(clean);
    if(before.evidence.hr.status!=='usable') expect(after.evidence.hr).toEqual(before.evidence.hr);
  });
  it.each(['sinus','af','af_fast','af_slow','rsa','pvc','bigeminy','trigeminy','wenckebach','mobitz2','lbbb','rbbb','vvi','ddd','hyperk','vt'])('does not call clean %s unreliable solely for its rhythm',id=>{
    const signal=synthesize(fromPreset(presetById(id)!),10);
    expect(analyzeSamples(signal).evidence.hr.status).toBe(measure(signal).evidence.hr.status);
  });
  it('flags ambiguous independent pulses, rather than assigning a new heart rate',()=>{
    const signal=artificialSample();const before=measure(signal), after=analyzeSamples(signal);
    expect(before.hr).not.toBeNull();expect(before.evidence.hr.status).toBe('usable');
    expect(heartRateDetectionQuality(signal,before.detectedPeaks).requiresReview).toBe(true);
    expect(after.evidence.hr.status).toBe('review');expect(after.evidence.hr.reason).toContain('umbral');
    expect(after.hr).toBe(before.hr);
  });
  it('cannot access events, truth, case, configured SNR or noise labels',()=>{
    const raw=artificialSample();const forbidden=new Proxy(raw,{get(target,key){if(key!=='fs'&&key!=='leads')throw new Error('Forbidden '+String(key));return Reflect.get(target,key);}});
    expect(()=>analyzeSamples(forbidden)).not.toThrow();
  });
  it('treats flat signal as unavailable without fabricating a rate',()=>{
    const signal=artificialSample();for(const lead of Object.values(signal.leads))lead.fill(0);
    expect(analyzeSamples(signal).hr).toBeNull();expect(analyzeSamples(signal).evidence.hr.status).toBe('unavailable');
  });
  it('is invariant to a common DC offset',()=>{
    const signal=artificialSample(),other=structuredClone(signal);
    Object.values(other.leads).forEach(a=>a.forEach((v,i)=>a[i]=v+12));
    expect(analyzeSamples(other).evidence.hr.status).toBe(analyzeSamples(signal).evidence.hr.status);
  });
  it('keeps the same review decision at 250 and 500 Hz on the analytical case',()=>{
    expect(analyzeSamples(artificialSample(250)).evidence.hr.status).toBe('review');
    expect(analyzeSamples(artificialSample(500)).evidence.hr.status).toBe('review');
  });
  it('does not expose mutable policy constants',()=>expect(Object.isFrozen(HR_QUALITY_POLICY)).toBe(true));
  it('routes the application worker through independent quality before model audit',()=>{
    const worker=readFileSync(new URL('../src/engine/worker.ts',import.meta.url),'utf8');
    expect(worker).toContain('analyzeSamples({ fs: signal.fs, leads: signal.leads })');
    expect(worker).not.toContain('auditMeasurement');
  });
});
