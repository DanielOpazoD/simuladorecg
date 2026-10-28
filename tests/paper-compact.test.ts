import {describe,expect,it} from 'vitest';
import {DEFAULT_CASE,cloneCase,type Signal} from '../src/engine/types';
import {makeArrays} from '../src/engine/leads';
import {paperLayout,paperRowExtents} from '../src/render/ecg';
const signal=():Signal=>({fs:500,duration:10,leads:makeArrays(5000),events:{beats:[],atria:[],spikes:[]},truth:{hr:60,pr:null,qrs:null,qt:null,axis:null},warnings:[]});
describe('compact calibrated rows',()=>{
 it('isolates a large local deflection instead of enlarging unrelated rows',()=>{
  const c=cloneCase(DEFAULT_CASE);c.view.format='6x2';const s=signal();s.leads.I[500]=8;
  const extents=paperRowExtents(c,s),layout=paperLayout(c,1000,4,80,extents);
  expect(extents[0].above).toBe(80);expect(layout.segments[0].height).toBe(90);
  expect(layout.segments[1].height).toBe(20);
  expect(layout.segments[0].baseline-layout.segments[0].y).toBe(89);
  expect(layout.heightMm).toBeLessThan(paperLayout(c,1000,4,80).heightMm);
 });
 it('uses the displayed time window, and includes the same sample when a full strip exposes it',()=>{
  const c=cloneCase(DEFAULT_CASE);c.view.format='6x2';c.view.timing='sequential';const s=signal();s.leads.II[4000]=10;
  expect(paperRowExtents(c,s).every(e=>e.above===10)).toBe(true);
  c.view.format='3x4+1';expect(paperRowExtents(c,s).at(-1)?.above).toBe(100);
 });
 it('reserves below the baseline for negative peaks and inverts aVR in Cabrera',()=>{
  const c=cloneCase(DEFAULT_CASE);c.view.format='12x1';c.view.cabrera=true;const s=signal();s.leads.aVR[500]=6;
  const layout=paperLayout(c,1000,4,0,paperRowExtents(c,s));
  const seg=layout.segments.find(x=>x.lead==='aVR')!;
  expect(seg.polarity).toBe(-1);expect(seg.y+seg.height-seg.baseline).toBe(61);
 });
 it('covers the comparison overlay and unequal gains, without touching either record',()=>{
  const c=cloneCase(DEFAULT_CASE);c.view.format='12x1';c.view.gain=5;c.view.chestGain=20;
  const s=signal(),previous=signal();s.leads.V2[500]=-4;previous.leads.V2[500]=3;
  const before=structuredClone(s),reference=structuredClone(previous);
  const extents=paperRowExtents(c,s,previous),l=paperLayout(c,1000,4,0,extents),seg=l.segments.find(x=>x.lead==='V2')!;
  expect(seg.height).toBe(149);expect(seg.baseline-60).toBe(seg.y+8);expect(seg.baseline+80).toBe(seg.y+seg.height-1);
  expect(s).toEqual(before);expect(previous).toEqual(reference);
 });
 it.each(['6x2','3x4','3x4+1','12x1'] as const)('compacts whitespace while protecting peaks and label bands in %s',format=>{
  const c=cloneCase(DEFAULT_CASE);c.view.format=format;
  const s=signal();s.leads.I[100]=5;s.leads.V2[300]=-7;
  const extents=paperRowExtents(c,s),layout=paperLayout(c,1000,4,0,extents);
  const ys=[...new Set(layout.segments.map(s=>s.y))];
  expect(layout.widthMm).toBe(paperLayout(c,1000,4).widthMm);expect(layout.pxPerMm).toBe(4);
  for(const seg of layout.segments){
   const e=extents[ys.indexOf(seg.y)],oldHeight=Math.max(24,e.above+e.below+12);

   expect(seg.height).toBeLessThanOrEqual(oldHeight-2);expect(seg.baseline-e.above).toBeGreaterThanOrEqual(seg.y+(seg.labelBandMm??9));expect(seg.baseline+e.below).toBeLessThanOrEqual(seg.y+seg.height-1);
  }
 });
});
