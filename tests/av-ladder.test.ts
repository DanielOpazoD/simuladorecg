import { describe,it,expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { LEADS, type Signal } from '../src/engine/types';
import { fromPreset,presetById } from '../src/presets/catalog';
import { buildAvLadder,avLadderSvg } from '../src/ui/av-ladder';

const load=(id:string)=>({...fromPreset(presetById(id)!),acquisition:'ideal' as const,filter:'off' as const});
const fixture=():Signal=>({fs:500,duration:2,leads:Object.fromEntries(LEADS.map(l=>[l,new Float64Array(1000)])) as Signal['leads'],events:{atria:[{time:.2,kind:'sinus',conducted:true,pr:.16}],beats:[{time:.36,kind:'normal',pr:.16,rr:.8,qrs:.08,qt:.4}],spikes:[]},truth:{hr:75,pr:160,qrs:80,qt:400,axis:45},warnings:[]});

describe('escalera AV desde asociaciones explícitas del modelo',()=>{
 it.each(['av1','wenckebach','mobitz2','av21','highav','complete','complete_v'])('%s conserva el registro y representa sus asociaciones sin inferirlas',id=>{
  const c=load(id),s=synthesize(c,10),before=structuredClone(s),m=buildAvLadder(c,s,0,9.998);
  expect(m).not.toBeNull();expect(s).toEqual(before);
  expect(m!.atria.filter(a=>!a.conducted).length).toBe(s.events.atria.filter(a=>!a.conducted&&a.time<=9.998).length);
  for(const a of m!.atria.filter(a=>a.conducted)){
   expect(a.ventricularTime!-a.time).toBeCloseTo(a.prMs!/1000,9);
   const source=s.events.atria.find(p=>p.time===a.time)!;expect(source.conducted).toBe(true);
  }
  if(c.av==='complete'){expect(m!.atria.every(a=>!a.conducted)).toBe(true);expect(m!.ventricles.every(v=>!v.linked)).toBe(true);expect(avLadderSvg(m!,8,50,0,499.9)).not.toContain('class="av-link"');}
 });
 it.each(['sinus','af','flutter','vt','vf','vvi','pvc'])('%s no recibe una escalera de bloqueo AV ajena a su dominio',id=>{
  const c=load(id),s=synthesize(c,10);expect(buildAvLadder(c,s,0,9.998)).toBeNull();
 });
 it('no une una P al QRS más cercano cuando falta la asociación exacta',()=>{
  const c=load('av1'),s=fixture();s.events.beats[0].time+=.001;
  expect(buildAvLadder(c,s,0,1.998)).toBeNull();
  s.events.beats[0].time=.36;s.events.beats[0].pr=.17;expect(buildAvLadder(c,s,0,1.998)).toBeNull();
 });
 it('rechaza metadatos ausentes, vínculos ambiguos, muestras incompletas y valores no finitos',()=>{
  const c=load('av1');
  for(const corrupt of [(s:Signal)=>{s.events.atria[0].pr=undefined;},(s:Signal)=>{s.events.beats.push({...s.events.beats[0],time:.36+5e-10});},(s:Signal)=>{s.leads.V2=s.leads.V2.slice(0,900);},(s:Signal)=>{s.leads.II[50]=NaN;},(s:Signal)=>{s.fs=0;},(s:Signal)=>{s.events.atria=[];},(s:Signal)=>{s.events.spikes.push(.1);}]){
   const s=fixture();corrupt(s);expect(buildAvLadder(c,s,0,1.998)).toBeNull();
  }
 });
 it('el borde inicial no transforma una P ausente del registro en escape ni bloqueo',()=>{
  const c=load('av1'),s=fixture();s.events.beats.unshift({time:.12,kind:'normal',pr:.16,rr:.8,qrs:.08,qt:.4});
  const m=buildAvLadder(c,s,0,1.998)!;expect(m.atria).toHaveLength(1);expect(m.ventricles[0]).toEqual({time:.12,linked:false});
  expect(avLadderSvg(m,8,50,0,99.9)).not.toContain('class="av-blocked"');
 });
 it('una asociación cruza el borde de la ventana sin inventar una P ni una barra',()=>{
  const c=load('av1'),m=buildAvLadder(c,fixture(),.3,.6)!;
  expect(m.atria[0].time).toBe(.2);const svg=avLadderSvg(m,8,50,0,15);
  expect(svg).toContain('class="av-link"');expect(svg).not.toContain('class="av-atrial"');
  expect(svg).not.toContain('class="av-blocked"');expect(svg).not.toContain('class="av-pr"');expect(svg).toContain('clip-path="url(#teach-av-clip)"');
 });
 it('una respuesta prevista fuera del registro no se dibuja como bloqueo ni QRS visible',()=>{
  const c=load('av1'),s=fixture();s.events.atria.push({time:1.85,kind:'sinus',conducted:true,pr:.3});
  const m=buildAvLadder(c,s,0,1.998)!;expect(m.atria[1].conducted).toBe(true);expect(m.ventricles).toHaveLength(1);
  expect(avLadderSvg(m,8,50,0,99.9)).not.toContain('class="av-blocked"');
 });
 it('una P y un escape coincidentes en bloqueo completo siguen sin vínculo',()=>{
  const c=load('complete'),s=fixture();s.events.atria[0]={time:.36,kind:'sinus',conducted:false};s.events.beats[0].pr=undefined;
  const m=buildAvLadder(c,s,0,1.998)!;expect(m.ventricles[0].linked).toBe(false);
  expect(avLadderSvg(m,8,50,0,99.9)).not.toContain('class="av-link"');
  s.events.atria[0].conducted=true;s.events.atria[0].pr=.16;expect(buildAvLadder(c,s,0,1.998)).toBeNull();
 });
 it('no interpreta un estado de conducción ausente como P bloqueada',()=>{
  const s=fixture();s.events.atria[0].pr=undefined;
  Reflect.deleteProperty(s.events.atria[0],'conducted');
  expect(buildAvLadder(load('complete'),s,0,1.998)).toBeNull();
 });
 it('conserva PR y tiempos en sus unidades y no añade una lectura anatómica',()=>{
  const m=buildAvLadder(load('av1'),fixture(),0,1.998)!,svg=avLadderSvg(m,8,50,0,99.9);
  expect(svg).toContain('data-pr-ms="160"');expect(svg).toContain('x1="18"');expect(svg).toContain('x2="26"');
  expect(svg).not.toMatch(/Mobitz|His|nodal|infranodal/);
 });
});
