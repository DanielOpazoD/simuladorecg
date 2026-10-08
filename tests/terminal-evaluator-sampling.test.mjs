import{it,expect}from'vitest';
import{predictions,assessWindow}from'../scripts/lib/terminal-consensus-evaluation.mjs';
const measurement=offset=>({detectedPeaks:[1],beats:[{peak:1,onset:.9,offset,tPeak:1.3,tEnd:1.4}]});
it('retains a one-sample QRS discrepancy without moving the raw boundary or peak',()=>{
 const m=measurement(.998),copy=structuredClone(m),p=predictions(m,'QRS',1/500);
 expect(p).toEqual([{peak:1,onset:.9,offset:.998}]);expect(m).toEqual(copy);
 const r=assessWindow({events:[{peak:1,onset:.9,offset:1.01}],excluded:[]},p,{start:0,end:2},.15,1/500);
 expect(r.errors[0].offsetMs).toBeCloseTo(-12,8);expect(r.detection.tp).toBe(1);
});
it('still rejects a discrepancy larger than one sample',()=>expect(()=>predictions(measurement(.996),'QRS',1/500)).toThrow('Boundary ordering'));
it('keeps reference ordering strict',()=>expect(()=>assessWindow({events:[{peak:1,onset:.9,offset:.998}],excluded:[]},[],{start:0,end:2},.15,1/500)).toThrow('Boundary ordering'));
it('never grants P or T the QRS-only sampling allowance',()=>{const m=measurement(1.01);m.beats[0].tEnd=1.298;expect(()=>predictions(m,'T',1/500)).toThrow('Boundary ordering');});
it('is strict without an explicitly supplied sampling allowance',()=>expect(()=>predictions(measurement(.998),'QRS')).toThrow('Boundary ordering'));
