import { describe, it, expect } from 'vitest';
import { renderPaper } from '../src/render/ecg';
import { DEFAULT_CASE, cloneCase, type Signal } from '../src/engine/types';
import { makeArrays } from '../src/engine/leads';

describe('Actual paper renderer retains the last acquired sample', () => {
  it.each([1, 2, 3])('does not erase a terminal spike at pixel ratio %s', ratio => {
    const c=cloneCase(DEFAULT_CASE); c.view.format='12x1'; c.view.fit=false;
    const leads=makeArrays(5000); for(const a of Object.values(leads))a[4999]=1;
    const s={fs:500,duration:10,leads} as Signal;
    const points:number[][]=[];
    const ctx=new Proxy({}, {get:(_,key)=>key==='lineTo'||key==='moveTo'?(x:number,y:number)=>points.push([x,y]):()=>{},set:()=>true});
    const canvas={style:{},getContext:()=>ctx} as unknown as HTMLCanvasElement;
    const layout=renderPaper(canvas,s,c,1000,{ratio});
    const seg=layout.segments[0],x=seg.x+4999/500*c.view.speed,y=seg.baseline-c.view.gain;
    expect(points.some(([a,b])=>Math.abs(a-x)<1e-9&&Math.abs(b-y)<1e-9)).toBe(true);
    expect(leads.I[4999]).toBe(1);
  });
});

import { traceSampleIndices } from '../src/render/trace-samples';
describe('Calibrated rendering reduction', () => {
  const indices=(a:Float64Array,from=0,to=a.length/500,pps=50)=>{
    const out:number[]=[];traceSampleIndices(a,500,from,to,pps,i=>out.push(i));return out;
  };
  it('preserves ordered extrema and endpoints without duplicating time',()=>{
    const a=Float64Array.from([0,5,-4,2,1,0,0,0,0,3]);
    expect(indices(a)).toEqual([0,1,2,9]);
    expect(a).toEqual(Float64Array.from([0,5,-4,2,1,0,0,0,0,3]));
  });
  it('uses a half-open time window without preceding or future samples',()=>{
    expect(indices(new Float64Array(10),.001,.009,1000)).toEqual([1,2,3,4]);
  });
  it('retains every sample at sufficient resolution',()=>expect(indices(new Float64Array(5),0,.01,1000)).toEqual([0,1,2,3,4]));
  it('draws no samples for an empty or out-of-record window',()=>{
    expect(indices(new Float64Array(5),2,3)).toEqual([]);
    expect(indices(new Float64Array(5),.005,.005)).toEqual([]);
  });
  it('rejects invalid rendering coordinates instead of silently blanking the ECG',()=>{
    expect(()=>indices(new Float64Array(5),0,.01,NaN)).toThrow();
  });
});
