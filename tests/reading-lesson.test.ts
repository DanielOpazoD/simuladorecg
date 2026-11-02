import {describe,it,expect} from 'vitest';
import {fromPreset,presetById} from '../src/presets/catalog';
import {synthesize} from '../src/engine/signal';
import {LEADS} from '../src/engine/types';
import {avReadingLesson,avReadingHtml} from '../src/ui/av-reading';
import {buildAvLadder} from '../src/ui/av-ladder';
import {echoReadingLesson} from '../src/ui/reading-lesson';
import {educationalReading} from '../src/ui/educational-reading';
import {structuredDescription} from '../src/ui/structured-description';
const load=(id:string)=>({...fromPreset(presetById(id)!),acquisition:'ideal' as const,filter:'off' as const});

describe('apoyos de lectura inline, datos y dominio',()=>{
 it.each(['av1','wenckebach','mobitz2','av21','highav','complete','complete_v'])('%s muestra asociaciones sin alterar el registro',id=>{
  const c=load(id),s=synthesize(c,12),before=structuredClone(s),state=structuredClone(c),lesson=avReadingLesson(c,s);
  expect(lesson).not.toBeNull();expect(s).toEqual(before);expect(c).toEqual(state);
  expect(lesson!.from).toBeGreaterThanOrEqual(0);expect(lesson!.to).toBeLessThanOrEqual(10);
  const html=avReadingHtml(lesson!,s);expect(html).toContain('data-speed="50"');expect(html).toContain('class="lesson-wave"');
  expect(html).not.toMatch(/<button|<select|<input|<details|ST en J/);
  if(c.av==='complete')expect(html).not.toContain('class="av-link"');
  expect(echoReadingLesson(c,s)).toBeNull();
 });
 it('Wenckebach contiene progresión, P no conducida y PR menor después de la pausa',()=>{
  const c=load('wenckebach'),s=synthesize(c,10),lesson=avReadingLesson(c,s)!;
  const index=lesson.ladder.atria.findIndex(a=>!a.conducted),before=lesson.ladder.atria.slice(0,index),after=lesson.ladder.atria[index+1];
  expect(before.length).toBeGreaterThanOrEqual(3);
  expect(before.every((a,i)=>a.conducted&&(i===0||a.prMs!>before[i-1].prMs!))).toBe(true);
  expect(after.conducted).toBe(true);expect(after.prMs!).toBeLessThan(before.at(-1)!.prMs!);
  expect(avReadingHtml(lesson,s)).toMatch(/<text class="av-pr" data-pr-ms="160"[^>]*>160 ms<\/text>/);
  expect(avReadingHtml(lesson,s)).toContain('role="region"');
  expect(avReadingHtml(lesson,s)).toContain('1 sin respuesta ventricular');
 });
 it('un tramo corto no demuestra un ciclo completo aunque su calendario sea válido',()=>{
  const c=load('wenckebach'),s=synthesize(c,10);
  // Synthesis deliberately enforces a minimum record duration. This negative
  // fixture crops the acquired record and its events rather than assuming 2 s.
  s.duration=2;for(const lead of LEADS)s.leads[lead]=s.leads[lead].slice(0,2*s.fs);
  s.events.atria=s.events.atria.filter(a=>a.time<2);s.events.beats=s.events.beats.filter(b=>b.time<2);
  expect(buildAvLadder(c,s,0,1.998)).not.toBeNull();expect(avReadingLesson(c,s)).toBeNull();
 });
 it('una asociación desplazada no recibe esquema y no se une al QRS cercano',()=>{
  const c=load('av1'),s=synthesize(c,10),p=s.events.atria.find(a=>a.conducted)!;
  const b=s.events.beats.find(b=>Math.abs(b.time-p.time-p.pr!)<1e-9)!;b.time+=.001;
  expect(avReadingLesson(c,s)).toBeNull();
 });
 it('una pausa sin descenso posterior de PR no se presenta como reinicio verificado',()=>{
  const c=load('wenckebach'),s=synthesize(c,7),blocked=s.events.atria.map((a,i)=>!a.conducted?i:-1).filter(i=>i>=0);
  const p=s.events.atria[blocked[1]+1],old=p.time+p.pr!,b=s.events.beats.find(b=>Math.abs(b.time-old)<1e-9)!;
  p.pr=.28;b.time=p.time+p.pr;b.pr=p.pr;
  expect(buildAvLadder(c,s,0,6.998)).not.toBeNull();expect(avReadingLesson(c,s)).toBeNull();
  expect(educationalReading(c,s,structuredDescription(c,s))).toContain('no se verifica');
 });
 it.each(['sinus','af','flutter','pvc','lbbb','vf','asystole','vvi'])('%s no recibe apoyos fuera del objetivo docente',id=>{
  const c=load(id),s=synthesize(c,10);expect(avReadingLesson(c,s)).toBeNull();expect(echoReadingLesson(c,s)).toBeNull();
 });
 it.each(['anterior','inferior','inferior_lcx'])('%s reutiliza un ejemplo de contracción ya disponible',id=>{
  const c=load(id),s=synthesize(c,12),before=structuredClone(s),lesson=echoReadingLesson(c,s);
  expect(lesson).not.toBeNull();expect(lesson!.cycle.end).toBeLessThanOrEqual(10);expect(lesson!.scenario.affected.length).toBeGreaterThan(0);
  expect(s).toEqual(before);expect(avReadingLesson(c,s)).toBeNull();
 });
 it('conexión, representación, fases y muestras inválidas retiran el esquema',()=>{
  const c=load('inferior'),s=synthesize(c,12);
  for(const patch of [{artifacts:{...c.artifacts,reversed:true}},{view:{...c.view,cabrera:true}},{av:'first' as const},{phase:'chronic' as const}])
   expect(echoReadingLesson({...c,...patch},s)).toBeNull();
  s.leads.V2[5]=NaN;expect(echoReadingLesson(c,s)).toBeNull();
 });
});
