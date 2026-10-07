import {describe,it,expect} from 'vitest';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {qrsKernels} from '../src/engine/morphology';
import {kernelWeight} from '../src/engine/regional-activation';
import {project,axisFromLeads,type Vec} from '../src/engine/leads';
import {sourcePolarity,hasInitialAndDominantPolarity as matches} from './support/fascicular-source-metrics';
import type {ECGCase} from '../src/engine/types';
function caseFor(conduction:ECGCase['conduction'],axis=120,qrs=100,gain=1):ECGCase {
 const c={...fromPreset(presetById('lpfb')!),conduction,axis,qrs,qrsAmp:gain,filter:'off' as const,pAmp:0,tAmp:0,st:0,variability:0};
 c.artifacts={...c.artifacts,baseline:0,muscle:0,mains:0,loose:0};return c;
}
describe('Resolved LPFB activation source',()=>{
 for(const conduction of ['lpfb'] as const)for(const axis of [100,120,140])for(const gain of [.5,1,2]){
  it(`${conduction}, axis ${axis}, gain ${gain}: lateral rS and inferior qR`,()=>{
   const c=caseFor(conduction,axis,conduction==='lpfb'?100:150,gain),s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3)!;
   for(const threshold of [.005,.01,.02])for(const lead of ['I','aVL','III','aVF'] as const){
    const observed=sourcePolarity(s.leads[lead],s.fs,b.time,b.time+b.qrs!,threshold);
    expect(matches(observed,lead==='I'||lead==='aVL'?'rS':'qR'),lead).toBe(true);
   }
   const initial=sourcePolarity(s.leads.I,s.fs,b.time,b.time+.025,.01);
   // Numerical prominence, not a diagnostic voltage threshold.
   expect(initial.maximumMv).toBeGreaterThan(.02*gain);
   const sum:Vec=[0,0,0];for(const k of qrsKernels(c,b))for(let j=0;j<3;j++)sum[j]+=k.v[j]*kernelWeight(k);
   const p=project(sum);expect(axisFromLeads(p.I,p.II)).toBeCloseTo(axis,8);
  });
 }
 for(const qrs of [80,100,118])it(`isolated duration ${qrs} preserves landmark sequence`,()=>{
  const s=synthesize(caseFor('lpfb',120,qrs),10),b=s.events.beats.find(b=>b.time>3)!;
  for(const lead of ['I','aVL','III','aVF'] as const)expect(matches(sourcePolarity(s.leads[lead],s.fs,b.time,b.time+b.qrs!,.02),lead==='I'||lead==='aVL'?'rS':'qR')).toBe(true);
 });
 it('diagnostic acquisition retains clinically visible r and S at the default',()=>{
  const c=caseFor('lpfb');c.filter='diagnostic';const s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3)!;
  const cut=(lo:number,hi:number)=>Array.from(s.leads.I.slice(Math.ceil((b.time+lo)*s.fs),Math.floor((b.time+hi)*s.fs)));
  expect(Math.max(...cut(0,.025))).toBeGreaterThan(.04);
  expect(Math.min(...cut(.025,.09))).toBeLessThan(-.25);
 });
 it('BRD + LPFB retains early lateral r, inferior q and the mean axis',()=>{
  const c=caseFor('rbbb_lpfb',120,150),s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3)!;
  for(const threshold of [.005,.01,.02])for(const lead of ['I','aVL','III','aVF'] as const)
   expect(matches(sourcePolarity(s.leads[lead],s.fs,b.time,b.time+b.qrs!,threshold),lead==='I'||lead==='aVL'?'rS':'qR')).toBe(true);
 });
 it.each(['off','diagnostic'] as const)('single uncertain extra candidate is not falsely usable at 120/min (%s)',filter=>{
  const c={...fromPreset(presetById('lpfb')!),hr:120,filter,variability:0};
  c.artifacts={...c.artifacts,baseline:.075,muscle:.075,mains:.075};
  const s=synthesize(c,10),m=analyzeSamples({fs:s.fs,leads:s.leads});
  expect(m.evidence.hr.status).toBe('review');
  expect(m.evidence.hr.reason).toContain('umbral');
 });
 it('ventricular sources override fascicular controls',()=>{
  const a=caseFor('lpfb'),b={...a,conduction:'normal' as const};
  for(const kind of ['pvc','paced','ventricular'] as const){const beat={time:1,rr:1,kind};expect(qrsKernels(a,beat)).toEqual(qrsKernels(b,beat));}
 });
});
