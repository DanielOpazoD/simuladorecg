import {describe,it,expect} from 'vitest';
import {fromPreset,presetById} from '../src/presets/catalog';
import {synthesize} from '../src/engine/signal';
import {qrsKernels,tVector,wpwDeltaVector} from '../src/engine/morphology';
import {secondaryRepolarization} from '../src/engine/secondary-repolarization';
import {project,frontal,type Vec} from '../src/engine/leads';
import {LEADS,type Beat,type ECGCase} from '../src/engine/types';
import {tAxisControlState} from '../src/ui/controls';
const base=()=>({...fromPreset(presetById('wpw')!),hr:60,atrialRate:60,variability:0,filter:'off' as const,qtc:600});
const beat:Beat={time:1,kind:'normal',rr:1,pr:.1};
function independentArea(c:ECGCase):Vec {
 const ks=qrsKernels(c,beat),dur=c.qrs/1000,v:Vec=[0,0,0],n=20000;
 for(let i=1;i<n;i++){
  const u=i/n,t=u*dur,phase=t/.045,delta=phase>0&&phase<1?Math.sin(Math.PI*phase):0;
  const d=frontal(c.axis,.25,.03),gain=c.qrsAmp*(c.electrolyte==='lowvoltage'?.38:1);
  for(let j=0;j<3;j++){
   let value=d[j]*gain*delta;
   for(const k of ks)value+=k.v[j]*Math.exp(-.5*((u-k.mu)/k.sigma)**2)*Math.min(1,u/.035,(1-u)/.035);
   v[j]+=value/n/Math.sqrt(2*Math.PI);
  }
 }
 return v;
}
describe('Complete WPW ST/T coupling to the represented ventricular source',()=>{
 it.each([60,90,135,200].flatMap(qrs=>[-120,0,55,120].map(axis=>({qrs,axis}))))('uses the actual compact QRS and delta areas at %j',settings=>{
  const c={...base(),...settings},actual=secondaryRepolarization(c,beat,qrsKernels(c,beat)),expected=independentArea(c);
  expect(actual.mode).toBe('preexcited-qrs');
  for(let j=0;j<3;j++)expect(actual.reference![j]).toBeCloseTo(expected[j],7);
  const q=project(expected),st=project(actual.st!),t=project(actual.t!);
  for(const lead of LEADS){expect(q[lead]*st[lead]).toBeLessThanOrEqual(1e-12);expect(q[lead]*t[lead]).toBeLessThanOrEqual(1e-12);}
 });
 it('includes delta rather than just relabelling an ordinary QRS mean',()=>{
  const c=base(),ks=qrsKernels(c,beat),a=secondaryRepolarization(c,beat,ks),b=secondaryRepolarization({...c,axis:-80},beat,ks);
  expect(a.reference).not.toEqual(b.reference);expect(a.t).not.toEqual(b.t);
  expect(wpwDeltaVector(c,.5)).not.toEqual(wpwDeltaVector({...c,axis:-80},.5));
 });
 it.each(['pvc','ventricular','paced'] as const)('does not attribute delta to a %s source',kind=>{
  const c=base(),b={...beat,kind} as Beat,normal={...c,conduction:'normal' as const};
  expect(secondaryRepolarization(c,b,qrsKernels(c,b))).toEqual(secondaryRepolarization(normal,b,qrsKernels(normal,b)));
 });
 it('renders a nonzero secondary ST plateau with T=0 and no primary lesion',()=>{
  const c={...base(),pAmp:0,tAmp:0,st:0},s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3)!;
  const expected=project(secondaryRepolarization(c,b,qrsKernels(c,b)).st!),i=Math.round((b.time+b.qrs!+.06)*s.fs),scaled=synthesize({...c,qrsAmp:c.qrsAmp*2},10);
  expect(Math.max(...Object.values(expected).map(Math.abs))).toBeGreaterThan(.01);
  for(const l of LEADS){expect(s.leads[l][i]).toBeCloseTo(expected[l],10);expect(scaled.leads[l][i]).toBeCloseTo(2*s.leads[l][i],10);}
  expect(s.events).toEqual(scaled.events);expect(s.truth).toEqual(scaled.truth);
 });
 it.each(['off','diagnostic','monitor','aggressive'] as const)('keeps T gain independent of ST through %s',filter=>{
  const c={...base(),filter},zero=synthesize({...c,tAmp:0},10),unit=synthesize(c,10),twice=synthesize({...c,tAmp:c.tAmp*2},10);
  let observed=0;for(const l of LEADS)for(let i=0;i<zero.leads[l].length;i++){
   const t=unit.leads[l][i]-zero.leads[l][i];observed=Math.max(observed,Math.abs(t));expect(Math.abs(twice.leads[l][i]-zero.leads[l][i]-2*t)).toBeLessThan(1e-10);
  }expect(observed).toBeGreaterThan(.01);expect(unit.events).toEqual(twice.events);
 });
 it('disables the unused primary T-axis control and actually follows QRS direction',()=>{
  const c=base();expect(tAxisControlState(c).disabled).toBe(true);expect(tAxisControlState(c).reason).toContain('delta');
  expect(tVector(c,beat)).toEqual(tVector({...c,tAxis:-140},beat));
  expect(tVector(c,beat)).not.toEqual(tVector({...c,axis:-100},beat));
  const a=synthesize(c,10),b=synthesize({...c,tAxis:-140},10);for(const l of LEADS)expect(a.leads[l]).toEqual(b.leads[l]);
 });
});
