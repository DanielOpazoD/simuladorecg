import {describe,it,expect} from 'vitest';
import {vviDemandEvents} from '../src/engine/vvi-demand';
const s={lowerRate:60,intrinsicRate:0,capture:true};
describe('ideal VVI controller separates sensing, stimulus and capture',()=>{
 it('paces and captures when no intrinsic activity exists',()=>{
  const e=vviDemandEvents(s,3);
  expect(e.spikes).toEqual([.45,1.45,2.45]);
  e.beats.forEach((b,i)=>{expect(b.time).toBeCloseTo(e.spikes[i]+.005,12);expect(b.kind).toBe('paced');});
 });
 it('a faster intrinsic ventricular source inhibits every stimulus',()=>{
  const e=vviDemandEvents({...s,intrinsicRate:90},3);
  expect(e.spikes).toEqual([]);expect(e.beats.length).toBe(4);
  expect(e.beats.every(b=>b.kind==='ventricular')).toBe(true);
 });
 it('resets the pacing deadline after a sensed event rather than using a fixed grid',()=>{
  const e=vviDemandEvents({...s,intrinsicRate:30},3);
  expect(e.beats[0].time).toBe(.4);expect(e.spikes[0]).toBe(1.4);
  expect(e.beats.slice(1).every(b=>b.kind==='paced')).toBe(true);
 });
 it('a noncapturing stimulus cannot create a beat or suppress biological escape',()=>{
  const e=vviDemandEvents({...s,intrinsicRate:30,capture:false},5);
  expect(e.beats.map(b=>b.time)).toEqual([.4,2.4,4.4]);
  expect(e.spikes).toEqual([1.4,3.4]);
 });
 it('no intrinsic source and no capture leave only stimuli',()=>{
  const e=vviDemandEvents({...s,capture:false},3);expect(e.beats).toEqual([]);expect(e.spikes.length).toBe(3);
 });
 it('a simultaneous intrinsic event wins the ideal sensing tie',()=>{
  const e=vviDemandEvents({...s,intrinsicRate:60},3);expect(e.spikes).toEqual([]);
 });
 it('clips a capture beyond the end without losing the last stimulus',()=>{
  const e=vviDemandEvents(s,.452);expect(e.spikes).toEqual([.45]);expect(e.beats).toEqual([]);
 });
 it('uses actual preceding intervals and stays chronological',()=>{
  const e=vviDemandEvents({...s,intrinsicRate:30},10);
  e.beats.slice(1).forEach((b,i)=>expect(b.rr).toBeCloseTo(b.time-e.beats[i].time,12));
 });
 it('rejects invalid rates and durations instead of entering an endless loop',()=>{
  for(const duration of [0,-1,Infinity,NaN])expect(()=>vviDemandEvents(s,duration)).toThrow();
  for(const lowerRate of [0,-1,Infinity,NaN])expect(()=>vviDemandEvents({...s,lowerRate},3)).toThrow();
 });
});
