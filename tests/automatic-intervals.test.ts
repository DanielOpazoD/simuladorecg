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
 it('keeps values over their intervals at the same row height, without crossing a column edge',()=>{
  const rows={...layout,pxPerMm:3.5,segments:['I','II','III','aVR','aVL','aVF'].map((lead,i)=>({...layout.segments[0],lead,x:i<3?10:73.5,y:10+(i%3)*35,polarity:1}))} as Layout;
  const m=fixture(),before=structuredClone(m),marks=automaticIntervals(m,rows,DEFAULT_CASE);
  for(const mark of marks){
   const s=rows.segments[mark.segment];
   expect(mark.labelAnchor).toBe('middle');expect(mark.labelX).toBeCloseTo((mark.x1+mark.x2)/2);
   expect(mark.labelY).toBeLessThan(mark.y);expect(mark.y+1).toBeLessThan(s.y+9);
  }
  for(let i=0;i<3;i++){expect(marks[i].labelY).toBe(marks[i+3].labelY);expect(marks[i].y).toBe(marks[i+3].y);}
  expect(m).toEqual(before);
  m.beats[0]={...m.beats[0],onset:2.2,offset:2.28,pOnset:2.05,tEnd:2.49};
  for(const mark of automaticIntervals(m,rows,DEFAULT_CASE)){
   const s=rows.segments[mark.segment],text=`${mark.key.toUpperCase()} ${mark.ms} ms${mark.review?'*':''}`;
   expect(mark.labelX+text.length*mark.fontMm*.62/2).toBeLessThan(s.x+s.width);
   expect(mark.end).toBeLessThanOrEqual(s.start+s.duration);
  }
 });
 it('rejects out-of-view endpoints and unorganized rhythms',()=>{
  const m=fixture();m.beats[0].pOnset=-.1;m.beats[0].tEnd=3;
  expect(automaticIntervals(m,layout,DEFAULT_CASE).map(x=>x.key)).toEqual(['qrs']);
  const c=cloneCase(DEFAULT_CASE);c.rhythm='vf';expect(automaticIntervals(fixture(),layout,c)).toEqual([]);
 });
 it('prefers a complete measured beat over a closer summary match cut by a short column',()=>{
  const m=fixture();m.beats[0].qrs=82;m.beats[0].offset=1.082;
  m.beats.push({...m.beats[0],onset:2.4,offset:2.48,pOnset:2.25,tEnd:2.8,qrs:80});
  const before=structuredClone(m),marks=automaticIntervals(m,layout,DEFAULT_CASE);
  expect(marks.map(x=>[x.key,x.ms])).toEqual([['pr',120],['qrs',82],['qt',320]]);
  expect(m).toEqual(before);
  // Without a complete candidate, never invent or truncate an off-screen QT.
  m.beats.shift();expect(automaticIntervals(m,layout,DEFAULT_CASE).map(x=>x.key)).toEqual(['pr','qrs']);
 });
});
