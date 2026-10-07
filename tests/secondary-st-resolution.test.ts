import {describe,it,expect} from 'vitest';
import {secondaryRepolarization,secondarySTEnvelope,secondaryDiscordanceDot} from '../src/engine/secondary-repolarization';
import {qrsKernels} from '../src/engine/morphology';
import {fromPreset,presetById} from '../src/presets/catalog';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {synthesize} from '../src/engine/signal';
import {project} from '../src/engine/leads';
const cases=['lbbb','rbbb','irbbb','vvi','pvc','vt','idioventricular'];
function setup(id:string){const c={...fromPreset(presetById(id)!),filter:'off' as const,variability:0,hr:60,atrialRate:60,qtc:600,pAmp:0,tAmp:0,st:0};c.artifacts={...c.artifacts,baseline:0,muscle:0,mains:0,loose:0};const s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3&&(id!=='pvc'||b.kind==='pvc'))!;return{c,s,b};}
describe('Represented secondary ST source',()=>{
 it.each(cases)('%s has a nonzero discordant ST vector independent of T amplitude',id=>{
  const{c,b}=setup(id),k=qrsKernels(c,b),a=secondaryRepolarization(c,b,k),t=secondaryRepolarization({...c,tAmp:.56},b,k);
  expect(a.st).not.toBeNull();expect(Math.hypot(...a.st!)).toBeGreaterThan(.001);
  expect(secondaryDiscordanceDot(a.reference!,a.st!)).toBeLessThan(0);expect(t.st).toEqual(a.st);
 });
 it.each(['sinus','lafb','lpfb','wpw','torsades'])('%s does not acquire an unsupported secondary mechanism',id=>{
  const{c,b}=setup(id);expect(secondaryRepolarization(c,b,qrsKernels(c,b)).st).toBeNull();
 });
 it('retains both true PVCs when ST connects a late/early pair of slope candidates',()=>{
  const c={...fromPreset(presetById('couplet')!),hr:60,coupling:.35,filter:'off' as const,variability:0,seed:29};
  Object.assign(c.artifacts,{baseline:0,muscle:0,mains:0,loose:0});const s=synthesize(c,10),m=analyzeSamples({fs:s.fs,leads:s.leads});
  const pvc=s.events.beats.filter(b=>b.kind==='pvc'&&b.time>1&&b.time<9);
  expect(pvc).toHaveLength(2);
  const matched=new Set<number>();
  for(const beat of pvc){const index=m.detectedPeaks.findIndex((t,i)=>!matched.has(i)&&Math.abs(t-(beat.time+beat.qrs!/2))<.15);expect(index).toBeGreaterThanOrEqual(0);matched.add(index);}
 });
 it('is C1 at both ends and J, and is zero beyond the pre-existing T endpoint',()=>{
  const j=.16,t=.30,d=.22,h=1e-7;
  for(const x of [j-.04,t+d/2]){expect(secondarySTEnvelope(x,j,t,d)).toBe(0);expect(Math.abs(secondarySTEnvelope(x+h,j,t,d)-secondarySTEnvelope(x-h,j,t,d))/(2*h)).toBeLessThan(.001);}
  expect(secondarySTEnvelope(j,j,t,d)).toBe(1);expect(secondarySTEnvelope(j+.06,j,t,d)).toBe(1);expect(secondarySTEnvelope(t+d,j,t,d)).toBe(0);
 });
 it.each(['lbbb','rbbb','vvi'])('%s renders measurable ST with T=0 and scales it with the QRS source',id=>{
  const{c,s,b}=setup(id),i=Math.round((b.time+b.qrs!+.06)*s.fs),source=secondaryRepolarization(c,b,qrsKernels(c,b));
  const expected=project(source.st!);
  const gain=synthesize({...c,qrsAmp:c.qrsAmp*2},10);
  for(const l of ['I','II','V1','V5'] as const){expect(Math.sign(s.leads[l][i])).toBe(Math.sign(expected[l]));expect(Math.abs(s.leads[l][i])).toBeGreaterThan(.001);expect(gain.leads[l][i]).toBeCloseTo(2*s.leads[l][i],10);}
  expect(gain.events).toEqual(s.events);
 });
});
