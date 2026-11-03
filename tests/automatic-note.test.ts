import {describe,it,expect} from 'vitest';
import {automaticIntervalNote,automaticIntervals,renderAutomaticIntervals} from '../src/ui/automatic-intervals';
import {DEFAULT_CASE,type Measurement} from '../src/engine/types';
import type {Layout} from '../src/render/ecg';

const fixture=()=>({qrs:80,pr:150,qt:400,evidence:{qrs:{status:'usable'},pr:{status:'usable'},qt:{status:'review'}},
  beats:[{onset:1,offset:1.08,pOnset:.88,tEnd:1.32,qrs:80,pr:999,qt:999}]} as unknown as Measurement);
const layout={mode:'paper',pxPerMm:4,widthMm:100,heightMm:60,segments:[{x:10,y:10,width:62.5,height:35,start:0,duration:2.5,lead:'II',polarity:1}]} as Layout;
const mark=(key:string,review=false)=>({key,review});
const fakeRoot=()=>({hidden:false,style:{} as Record<string,string>,innerHTML:'',cleared:0,replaceChildren(){this.cleared++;}});
const render=(root:ReturnType<typeof fakeRoot>,m:Measurement|null,active=true)=>renderAutomaticIntervals(root as unknown as HTMLElement,m,layout,DEFAULT_CASE,active);

describe('automatic interval footer note',()=>{
 it('says nothing without marks and never presumes QT or review',()=>{
  expect(automaticIntervalNote([])).toBe('');
  expect(automaticIntervalNote([mark('qrs')])).toBe('Estimados por latido');
  expect(automaticIntervalNote([mark('pr',true),mark('qrs')])).toBe('Estimados por latido · * Revisar');
  expect(automaticIntervalNote([mark('pr'),mark('qrs'),mark('qt')])).toBe('Estimados por latido · QT sin corregir');
  expect(automaticIntervalNote([mark('pr'),mark('qrs'),mark('qt',true)])).toBe('Estimados por latido · QT sin corregir · * Revisar');
 });
 it('follows the drawn marks: withdrawn or out-of-view QT adds no QT caveat, input is not mutated',()=>{
  const withdrawn=fixture();withdrawn.evidence.qt.status='unavailable';
  expect(automaticIntervalNote(automaticIntervals(withdrawn,layout,DEFAULT_CASE))).toBe('Estimados por latido');
  const cut=fixture();cut.beats[0].tEnd=3;
  expect(automaticIntervalNote(automaticIntervals(cut,layout,DEFAULT_CASE))).toBe('Estimados por latido');
  const frozen=Object.freeze([Object.freeze(mark('qt',true))]);
  expect(automaticIntervalNote(frozen)).toContain('QT sin corregir');
  expect(frozen).toEqual([{key:'qt',review:true}]);
 });
 it('renders the note as DOM text after the SVG, with a single .auto-review only when reviewing',()=>{
  const root=fakeRoot();render(root,fixture());
  expect(root.hidden).toBe(false);
  const [svg,rest]=root.innerHTML.split('</svg>');
  expect(svg.startsWith('<svg viewBox="0 0 100 60" role="img"')).toBe(true);
  expect(svg.match(/<g class="auto-/g)).toHaveLength(3);
  expect(svg).not.toContain('Estimados');
  expect(rest).toBe('<span class="auto-note">Estimados por latido · QT sin corregir<span class="auto-review"> · * Revisar</span></span>');
  expect(root.innerHTML.match(/auto-review/g)).toHaveLength(1);
  const clean=fixture();clean.evidence.qt.status='usable';const root2=fakeRoot();render(root2,clean);
  expect(root2.innerHTML.split('</svg>')[1]).toBe('<span class="auto-note">Estimados por latido · QT sin corregir</span>');
  expect(root2.innerHTML).not.toContain('auto-review');
 });
 it('keeps the unavailable state without a note, and an empty hidden root when inactive',()=>{
  const none=fixture();none.evidence.qrs.status='unavailable';const root=fakeRoot();render(root,none);
  expect(root.innerHTML).toContain('auto-unavailable');
  expect(root.innerHTML).not.toContain('auto-note');
  const off=fakeRoot();render(off,fixture(),false);
  expect(off.hidden).toBe(true);expect(off.cleared).toBe(1);expect(off.innerHTML).toBe('');
 });
});
