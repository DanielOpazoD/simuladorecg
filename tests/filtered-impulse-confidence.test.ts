import {it,expect} from 'vitest';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {applyAcquisitionFilter, type AcquisitionFilter} from '../src/engine/filter';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import type {Signal} from '../src/engine/types';
function isolatedPulses(fs:number,filter:AcquisitionFilter):Pick<Signal,'fs'|'leads'>{
 const x=new Float64Array(fs*10);
 // Four-ms biphasic rectangular electrical pulses, no ventricular activation.
 for(let t=.5;t<10;t+=1)for(let i=Math.round(t*fs);i<Math.round((t+.004)*fs);i++)x[i]=i<Math.round((t+.002)*fs)?2:-.44;
 applyAcquisitionFilter(x,fs,filter);
 const weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1,V6:.9};
 return {fs,leads:Object.fromEntries(Object.entries(weights).map(([l,w])=>[l,Float64Array.from(x,v=>v*w)])) as Signal['leads']};
}
it.each([250,500,1000])('does not report a confident ventricular rate from filtered isolated impulses at %s Hz',fs=>{
 for(const filter of ['monitor','aggressive'] as const){
  const s=isolatedPulses(fs,filter),before=s.leads.I.slice(),m=analyzeSamples(s);
  expect(m.evidence.hr.status,filter).toBe('unavailable');
  expect(m.evidence.qrs.status,filter).toBe('unavailable');
  expect(s.leads.I).toEqual(before);
 }
});
it.each(['sinus','rbbb','lbbb','wpw','vvi','idioventricular'])('does not mistake true %s complexes for isolated impulses',id=>{
 const c=fromPreset(presetById(id)!);c.filter='monitor';
 const m=analyzeSamples(synthesize(c,10));expect(m.evidence.hr.status).not.toBe('unavailable');
});

it('keeps raw candidates and numbers while withholding their interpretation',()=>{
 const s=isolatedPulses(500,'monitor'),m=analyzeSamples(s);
 expect(m.detectedPeaks.length).toBeGreaterThan(3);expect(m.hr).not.toBeNull();
 expect(m.evidence.hr.status).toBe('unavailable');expect(m.evidence.hr.reason).toContain('impulsos');
});

it('external estimate presentation withholds values without deleting raw candidates',async()=>{
 const {availableMetricValue}=await import('../src/ui/metric-cards');
 const m=analyzeSamples(isolatedPulses(500,'monitor')),raw=m.hr;
 expect(availableMetricValue(m,'hr')).toBeNull();expect(m.hr).toBe(raw);expect(raw).not.toBeNull();
});

it('does not label a weak noisy impulse train as a usable ventricular rate',()=>{
 const fs=500,weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1,V6:.9};
 const leads=Object.fromEntries(Object.entries(weights).map(([l,w],j)=>[l,Float64Array.from({length:5000},(_,i)=>w*.3*Math.exp(-.5*(((i/fs+.5)%1-.5)/.006)**2)+.005*Math.sin(2*Math.PI*(19+j)*i/fs+j))])) as Signal['leads'];
 for(let i=0;i<5000;i++){const a=leads.I[i],b=leads.II[i];leads.III[i]=b-a;leads.aVR[i]=-(a+b)/2;leads.aVL[i]=a-b/2;leads.aVF[i]=b-a/2;}
 expect(analyzeSamples({fs,leads}).evidence.hr.status).not.toBe('usable');
});

it('the browser impulse fixture passes the unchanged external integrity gate before analysis',async()=>{
 const {assessExternalWindow}=await import('../src/io/external-assessment');
 const fs=500,weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
 const x=Float64Array.from({length:5000},(_,i)=>{const t=i/fs;return Math.exp(-.5*(((t+.5)%1-.5)/.006)**2)+1e-6*Math.sin(2*Math.PI*.7*t);});
 const s={fs,leads:Object.fromEntries(Object.entries(weights).map(([l,w])=>[l,Float64Array.from(x,v=>v*w)])) as Signal['leads']};
 expect(assessExternalWindow(s).analysisAllowed).toBe(true);
 const m=analyzeSamples(s);expect(m.hr).not.toBeNull();expect(m.evidence.hr.status).toBe('unavailable');
});
