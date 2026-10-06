import { describe,it,expect } from 'vitest';
import { generateEvents } from '../src/engine/rhythm';
import { assertEventCalendar } from '../src/engine/event-calendar';
import { PRESETS,fromPreset } from '../src/presets/catalog';
const sinus=()=>fromPreset(PRESETS.find(p=>p.id==='sinus')??PRESETS[0]);
describe('causal event calendar',()=>{
 it('keeps all events inside short acquisition boundaries, including late P and spikes',()=>{
  for(const preset of PRESETS) for(const duration of [.23,.451,.455,.53,1.01,2.73]){
   const c=fromPreset(preset),e=generateEvents(c,duration);
   for(const time of [...e.atria.map(a=>a.time),...e.beats.map(b=>b.time),...e.spikes]) expect(time).toBeLessThan(duration);
   expect(()=>assertEventCalendar(e,duration)).not.toThrow();
  }
 });
 it('rejects a corrupted preceding RR rather than silently repairing it',()=>{
  const e=generateEvents(sinus(),5);e.beats[1].rr+=.1;
  expect(()=>assertEventCalendar(e,5)).toThrow(/RR/);
 });
 it('rejects a conducted P with no correctly timed ventricular response',()=>{
  const e=generateEvents(sinus(),5);e.atria[0].pr!+=.01;
  expect(()=>assertEventCalendar(e,5)).toThrow(/conducida/);
 });
 it('permits a conducted P whose expected QRS lies beyond the observation boundary',()=>{
  expect(()=>assertEventCalendar({atria:[{time:.2,conducted:true,pr:.16,kind:'sinus'}],beats:[],spikes:[]},.3)).not.toThrow();
 });
 it('rejects unordered, nonfinite and out-of-window events',()=>{
  for(const bad of [NaN,Infinity,-.1,5]){
   const e=generateEvents(sinus(),5);e.atria[0].time=bad;
   expect(()=>assertEventCalendar(e,5)).toThrow();
  }
  const e=generateEvents(sinus(),5);e.beats.reverse();expect(()=>assertEventCalendar(e,5)).toThrow();
 });
 it('preserves prefixes when the observation window is extended',()=>{
  for(const p of PRESETS){
   const c=fromPreset(p),short=generateEvents(c,3),long=generateEvents(c,6);
   expect(short).toEqual({atria:long.atria.filter(a=>a.time<3),beats:long.beats.filter(b=>b.time<3),spikes:long.spikes.filter(t=>t<3)});
  }
 });
});
