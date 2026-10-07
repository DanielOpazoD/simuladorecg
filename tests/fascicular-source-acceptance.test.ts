import {describe,it,expect} from 'vitest';
import {sourcePolarity,hasInitialAndDominantPolarity as matches} from './support/fascicular-source-metrics';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
const thresholds=[.005,.01,.02];
function prepare(id:'lafb'|'lpfb') {
 const preset=presetById(id);if(!preset||preset.id!==id)throw Error('Missing declared preset');
 const c={...fromPreset(preset),filter:'off' as const,pAmp:0,tAmp:0,st:0,variability:0};
 c.artifacts={...c.artifacts,baseline:0,muscle:0,mains:0,loose:0};
 const s=synthesize(c,6),beat=s.events.beats.find(b=>b.time>3);
 if(!beat?.qrs)throw Error('Missing declared QRS support');
 return {c,s,beat};
}
// Prepare outside assertions so fixture/model failures fail normally.
const anterior=prepare('lafb'),posterior=prepare('lpfb');
const probe=(x:ReturnType<typeof prepare>,lead:'I'|'II'|'III'|'aVL'|'aVF',threshold:number)=>
 sourcePolarity(x.s.leads[lead],x.s.fs,x.beat.time,x.beat.time+x.beat.qrs!,threshold);
const posteriorI=thresholds.map(threshold=>({threshold,meetsRS:matches(probe(posterior,'I',threshold),'rS')}));
describe('Independent polarity probe',()=>{
 it('distinguishes qR, rS, QS and absent information',()=>{
  const get=(a:number[])=>sourcePolarity(a,1000,0,(a.length-1)/1000,.01);
  expect(matches(get([0,-.1,0,.4,1,0]),'qR')).toBe(true);
  expect(matches(get([0,.1,0,-.4,-1,0]),'rS')).toBe(true);
  expect(matches(get([0,-.1,-.4,-1,0]),'rS')).toBe(false);
  expect(matches(get([0,0,0,0]),'qR')).toBe(false);
  expect(get([0,0,0,0]).firstMs).toBeNull();
 });
 it('rejects invalid windows and nonfinite samples',()=>{
  expect(()=>sourcePolarity([0,1],0,0,1,.01)).toThrow();
  expect(()=>sourcePolarity([0,1],1000,0,1,.01)).toThrow();
  expect(()=>sourcePolarity([0,NaN],1000,0,.001,.01)).toThrow();
 });
});
describe('Fascicular source landmarks, not diagnostic validation',()=>{
 it.each(thresholds)('LAFB at relative probe %s has published directional features',threshold=>{
  const a=probe(anterior,'aVL',threshold);
  expect(matches(a,'qR')).toBe(true);expect(a.positivePeakMs).toBeGreaterThanOrEqual(45);
  for(const lead of ['II','III','aVF'] as const)expect(matches(probe(anterior,lead,threshold),'rS')).toBe(true);
 });
 it.each(posteriorI)('LPFB initial r and dominant S in I at relative probe $threshold',({meetsRS})=>{
  expect(meetsRS).toBe(true);
 });
 it.each(thresholds)('LPFB inferior initial-negative/dominant-positive features remain measurable at %s',threshold=>{
  for(const lead of ['III','aVF'] as const)expect(matches(probe(posterior,lead,threshold),'qR')).toBe(true);
 });
});
