import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {errorSummary,assessExternalQrs,poolExternalQrs} from '../scripts/lib/external-qrs-evaluation.mjs';
const p=JSON.parse(readFileSync('tests/reference/ludb-expansion/protocol.json'));
const h=s=>createHash('sha256').update(s).digest('hex');
const ref={beats:[{peak:1,qrsOnset:.95,qrsOffset:1.05},{peak:2,qrsOnset:null,qrsOffset:2.06}],excluded:[]};
const sig={fs:500,leads:{I:new Float32Array(5000)}};
const m={detectedPeaks:[.1,1.01,2.02,2.1],beats:[{peak:1.01,onset:.96,offset:1.06,qrs:100}]};
describe('Independent cohort protocol and denominators',()=>{
  it('preselects exactly 40 unseen IDs by hash, not by waveform',()=>{
    const ranked=Array.from({length:200},(_,i)=>i+1).filter(i=>!p.excludedKnownRecords.includes(i)).sort((a,b)=>h(p.seed+':'+a).localeCompare(h(p.seed+':'+b)));
    expect(p.records).toEqual(ranked.slice(0,40).sort((a,b)=>a-b));expect(new Set(p.records).size).toBe(40);
  });
  it('anchors the historical analyzer without retargeting its frozen hashes',()=>{expect(p.baselineCommit).toBe('d4e4c7d742a2067ddc4bb26f869a1d865ee56b99');expect(p.analyzerFiles['src/engine/measure.ts']).toBe('42549edaa0502121aeca3e736ef6d18622c425b79b7e5a1ce31f9545c8e5a60e');expect(Object.keys(p.analyzerFiles).sort()).toEqual(['src/engine/analysis/evidence.ts','src/engine/analysis/impulses.ts','src/engine/analysis/statistics.ts','src/engine/analysis/ventricular-candidates.ts','src/engine/lead-registry.ts','src/engine/leads.ts','src/engine/measure.ts'].sort());});
  it('distinguishes matched peaks, absent delineation, missing annotations and FP',()=>{
    const r=assessExternalQrs(sig,ref,()=>m);expect(r.detection).toMatchObject({tp:2,fp:1,fn:0});expect(r.outsideAnnotationWindow).toBe(1);
    expect(r.unavailableDelineations).toBe(1);expect(r.onset.n).toBe(1);expect(r.referenceBounds).toEqual({onset:1,offset:2,width:1});
  });
  it('never accesses generator metadata',()=>{const input={...sig,get events(){throw Error('forbidden');},get truth(){throw Error('forbidden');}};
    assessExternalQrs(input,ref,s=>{expect(Object.keys(s)).toEqual(['fs','leads']);return m;});});
  it('reports micro coverage and macro record statistics separately',()=>{
    const a=assessExternalQrs(sig,ref,()=>m),b=assessExternalQrs(sig,ref,()=>({detectedPeaks:[],beats:[]}));const r=poolExternalQrs([a,b]);
    expect(r).toMatchObject({records:2,tp:2,fp:1,fn:2});expect(r.endpoints.onset).toMatchObject({n:1,referenceEligible:2,coverageOfEligible:.5,coverageOfAllReferenceEvents:.25,recordsWithValues:1});
  });
  it('null is not a zero error and NaN is not silently discarded',()=>{expect(errorSummary([]).maeMs).toBeNull();expect(()=>errorSummary([NaN])).toThrow();expect(errorSummary([-10,10]).biasMs).toBe(0);expect(errorSummary([-10,10]).maeMs).toBe(10);});
  it('never gives two predictions credit for a single reference',()=>{const r=assessExternalQrs(sig,{beats:[ref.beats[0]],excluded:[]},()=>({detectedPeaks:[1,1.01],beats:[]}));expect(r.detection).toMatchObject({tp:1,fp:1,fn:0});});
});
