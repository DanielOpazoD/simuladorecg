import {describe,it,expect} from 'vitest';
import {automaticIntervals} from '../src/ui/automatic-intervals';
import {DEFAULT_CASE,cloneCase,type Measurement} from '../src/engine/types';
import type {Layout} from '../src/render/ecg';

const fixture=()=>({qrs:80,pr:150,qt:400,evidence:{qrs:{status:'usable'},pr:{status:'usable'},qt:{status:'review'}},
  beats:[{onset:1,offset:1.08,pOnset:.88,tEnd:1.32,qrs:80,pr:999,qt:999}]} as unknown as Measurement);
const layout={mode:'paper',segments:[{x:10,y:10,width:62.5,height:35,start:0,duration:2.5,lead:'II'}]} as Layout;
describe('automatic interval geometry from accepted sample boundaries',()=>{
 it('projects endpoints and labels the actual beat, not the summary median or cached duration',()=>{
  const marks=automaticIntervals(fixture(),layout,cloneCase(DEFAULT_CASE));
  expect(marks.map(m=>[m.key,m.ms,m.x1,m.x2])).toEqual([['pr',120,32,35],['qrs',80,35,37],['qt',320,35,43]]);
  expect(marks[2].review).toBe(true);
  expect(marks.every(m=>m.y<19)).toBe(true);
 });
 it('does not resurrect withdrawn intervals, even with retained candidate boundaries',()=>{
  const m=fixture();m.evidence.qt.status='unavailable';m.pr=null;
  expect(automaticIntervals(m,layout,DEFAULT_CASE).map(x=>x.key)).toEqual(['qrs']);
  m.evidence.qrs.status='unavailable';expect(automaticIntervals(m,layout,DEFAULT_CASE)).toEqual([]);
 });
 it('separates intervals across simultaneous rows without changing their timing',()=>{
  const rows={...layout,pxPerMm:3.5,segments:['I','II','III'].map((lead,i)=>({...layout.segments[0],lead,y:10+i*35}))} as Layout;
  const marks=automaticIntervals(fixture(),rows,DEFAULT_CASE);
  expect(marks.map(m=>[m.key,m.segment,m.ms])).toEqual([['pr',0,120],['qrs',1,80],['qt',2,320]]);
  for(const m of marks){expect(m.y).toBeLessThan(rows.segments[m.segment].y+9);expect(m.fontMm*rows.pxPerMm).toBeGreaterThanOrEqual(14);}
 });
 it('rejects out-of-view endpoints and unorganized rhythms',()=>{
  const m=fixture();m.beats[0].pOnset=-.1;m.beats[0].tEnd=3;
  expect(automaticIntervals(m,layout,DEFAULT_CASE).map(x=>x.key)).toEqual(['qrs']);
  const c=cloneCase(DEFAULT_CASE);c.rhythm='vf';expect(automaticIntervals(fixture(),layout,c)).toEqual([]);
 });
});
