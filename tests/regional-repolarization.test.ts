import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { regionalTCorrection, regionalTerritory } from '../src/engine/regional-repolarization';
import { tVector, tWave } from '../src/engine/morphology';
import { project } from '../src/engine/leads';
import { LEADS, type Lead, type ECGCase } from '../src/engine/types';
import { morphologyMetrics } from './support/morphology-metrics';
const ids = ['inferior', 'inferior_lcx', 'anterior', 'lateral'];
function load(id: string): ECGCase { return { ...fromPreset(presetById(id)!), variability: 0, hr: 72, filter: 'off' }; }
function inspect(c: ECGCase, lead: Lead) {
 const s = synthesize(c,10), b = s.events.beats.find(x=>x.time>3)!;
 const tStart = b.qt! - Math.min(.22,(b.qt! - b.qrs!)*.68);
 return morphologyMetrics(s.leads[lead],s.fs,{baseline:[b.time-.04,b.time-.02],qrs:[b.time,b.time+b.qrs!],t:[b.time+tStart,b.time+b.qt!]});
}
function difference(a: Float64Array,b: Float64Array) { let d=0; for(let i=0;i<a.length;i++) d=Math.max(d,Math.abs(a[i]-b[i])); return d; }
describe('Scoped regional repolarization', () => {
 it.each(ids)('%s retains exact basal samples at zero intensity and resolved phase', id=>{
  const c=load(id); c.phase='hyperacute'; c.st=0;
  const a=synthesize(c,10),b=synthesize({...c,ischemia:'none'},10);
  for(const l of LEADS) expect(a.leads[l]).toEqual(b.leads[l]);
  c.phase='chronic'; c.st=8;
  const d=synthesize(c,10); for(const l of LEADS) expect(d.leads[l]).toEqual(b.leads[l]);
 });
 it.each(ids)('%s preserves all T amplitude contracts and QRS/events', id=>{
  const c=load(id); c.phase='hyperacute'; c.tAmp=0;
  const z=synthesize(c,10),h=synthesize({...c,tAmp:.14},10),f=synthesize({...c,tAmp:.28},10);
  expect(z.events).toEqual(f.events);
  for(const l of LEADS) for(let i=0;i<f.leads[l].length;i+=13)
   expect(h.leads[l][i]-z.leads[l][i]).toBeCloseTo((f.leads[l][i]-z.leads[l][i])/2,12);
  const b=f.events.beats.find(x=>x.time>3)!;
  for(const l of LEADS) for(let i=Math.ceil((b.time-.04)*f.fs);i<Math.floor((b.time+b.qrs!+.012)*f.fs);i++) expect(f.leads[l][i]).toBe(z.leads[l][i]);
 });
 it.each(ids)('%s preserves limb identities through filters and electrode reversal', id=>{
  for(const filter of ['off','diagnostic','monitor'] as const) for(const reversed of [false,true]) {
   const c=load(id); c.phase='evolving'; c.filter=filter; c.artifacts={...c.artifacts,reversed};
   const s=synthesize(c,10);
   for(let i=0;i<s.leads.I.length;i+=37) {
    const a=s.leads.I[i],b=s.leads.II[i];
    expect(Math.abs(s.leads.III[i]-(b-a))).toBeLessThan(1e-12);
    expect(Math.abs(s.leads.aVR[i]+(a+b)/2)).toBeLessThan(1e-12);
    expect(Math.abs(s.leads.aVL[i]-(a-b/2))).toBeLessThan(1e-12);
   }
  }
 });
 it('hyperacute changes are not a global multiplier: inferior versus anterior',()=>{
  const c=load('inferior'),d=load('anterior'); c.phase=d.phase='hyperacute';
  const i=inspect(c,'II'),iv=inspect(c,'V3'),a=inspect(d,'II'),av=inspect(d,'V3');
  expect(i.tPeakMv).toBeGreaterThan(a.tPeakMv+.2);
  expect(av.tPeakMv).toBeGreaterThan(iv.tPeakMv+.3);
  expect(inspect(c,'aVL').tPeakMv).toBeLessThan(-.2);
 });
 it.each([['inferior','II'],['inferior_lcx','II'],['anterior','V3'],['lateral','V5']] as const)('%s produces broad hyperacute and negative evolving T in %s',(id,l)=>{
  const c=load(id), basal=inspect({...c,ischemia:'none'},l); c.phase='hyperacute';
  const h=inspect(c,l); expect(h.tAbsoluteAreaMvS).toBeGreaterThan(basal.tAbsoluteAreaMvS);
  expect(h.tFwhmMs!).toBeGreaterThan(basal.tFwhmMs!);
  c.phase='evolving'; expect(inspect(c,l).tPeakMv).toBeLessThan(-.15);
 });
 it('does not apply regional corrections to secondary or conflicting causes',()=>{
  const c=load('anterior'), b={time:1,rr:1,kind:'normal' as const}; c.phase='hyperacute';
  for(const other of [{conduction:'lbbb'}, {overload:'lv'}, {electrolyte:'hyperkalemia'}] as Partial<ECGCase>[])
   expect(regionalTerritory({...c,...other},b)).toBeNull();
  expect(regionalTerritory(c,{...b,kind:'paced'})).toBeNull();
 });
 it.each(ids)('%s has zero endpoints and smooth joins; intensity response is continuous',id=>{
  const c=load(id); c.phase='evolving'; const b={time:1,rr:1,kind:'normal' as const},v=project(tVector(c,b)).V3;
  for(const u of [0,1]) expect(regionalTCorrection(c,b,'V3',u,v,tWave(u))).toBe(0);
  for(const u of [1e-6,1-1e-6]) expect(Math.abs(regionalTCorrection(c,b,'V3',u,v,tWave(u))/1e-6)).toBeLessThan(.05);
  const a=synthesize({...c,st:0},10),h=synthesize({...c,st:1},10),f=synthesize({...c,st:2},10);
  for(const l of LEADS) for(let i=0;i<a.leads[l].length;i+=19) expect(h.leads[l][i]-a.leads[l][i]).toBeCloseTo((f.leads[l][i]-a.leads[l][i])/2,12);
  expect(difference(a.leads.V3,f.leads.V3)).toBeGreaterThan(.01);
 });
});
