import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fourLeadWaveReference} from './reference/ludb/load-ludb.mjs';
import {assessExternalDelineation,poolExternalDelineation,referenceIntervals} from '../scripts/lib/external-delineation-evaluation.mjs';

const p=JSON.parse(readFileSync('tests/reference/ludb-delineation/protocol.json'));
const h=s=>createHash('sha256').update(s).digest('hex');
const rank=(seed,excluded)=>Array.from({length:200},(_,i)=>i+1).filter(i=>!excluded.includes(i))
  .sort((a,b)=>h(seed+':'+a).localeCompare(h(seed+':'+b))).slice(0,40).sort((a,b)=>a-b);
const wave=(name,peak,onset=peak-10,offset=peak+10)=>({wave:name,onset,peak,offset});
function meta(){
  const annotations={};
  for(const lead of ['I','II','V1','V5']) annotations[lead]=[
    wave('P',90),wave('QRS',150,140,170),wave('T',250,220,290),
    wave('P',590),wave('QRS',650,640,670),wave('T',750,720,790),
  ];
  return {fs:500,annotations};
}
const signal={fs:500,leads:{I:new Float32Array(5000)}};
const measurement={beats:[
  {peak:.30,onset:.28,offset:.34,pPeak:.18,pOnset:.16,tPeak:.50,tEnd:.58,tTangentEnd:.56,qrs:60},
  {peak:1.30,onset:1.28,offset:1.34,pPeak:1.18,pOnset:1.16,tPeak:1.50,tEnd:1.58,tTangentEnd:1.56,qrs:60},
],pr:120,qrs:60,qt:300,evidence:{pr:{status:'usable',reason:'x'},qrs:{status:'review',reason:'x'},qt:{status:'unavailable',reason:'x'}},detectedPeaks:[.3,1.3],window:{start:0,end:2}};

describe('Prospective LUDB P/QRS/T delineation protocol',()=>{
  it('selects calibration and holdout deterministically before waveform inspection',()=>{
    expect(p.calibration.records).toEqual(rank(p.calibration.seed,p.previouslyObservedRecords));
    expect(p.holdout.records).toEqual(rank(p.holdout.seed,[...p.previouslyObservedRecords,...p.calibration.records]));
    expect(p.calibration.records.some(x=>p.holdout.records.includes(x))).toBe(false);
    expect(p.holdoutEnabled).toBe(false);expect(p.baselineCommit).toBe('519267d3b595a27ea8d35a5eae6296c780b58ec4');
  });
  it('builds P QRS and T references independently without generator truth',()=>{
    const m=meta();for(const w of ['P','QRS','T']){const r=fourLeadWaveReference(m,w);expect(r.events).toHaveLength(2);expect(r.excluded).toHaveLength(0);}
  });
  it('retains missing source endpoints instead of inventing them',()=>{
    const m=meta();m.annotations.V5[0].offset=null;const r=fourLeadWaveReference(m,'P');
    expect(r.events[0].offset).toBeNull();expect(r.events[0].boundaryCoverage.completeOffsets).toBe(false);
  });
  it('makes interval association explicit and descriptive',()=>{
    const refs=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(meta(),w)]));
    const x=referenceIntervals(refs,p.intervalAssociation);
    expect(x.values.pr[0]).toBeCloseTo(120,9);expect(x.values.pr[1]).toBeCloseTo(120,9);expect(x.values.qrs[0]).toBeCloseTo(60,9);expect(x.values.qrs[1]).toBeCloseTo(60,9);expect(x.values.qt[0]).toBeCloseTo(300,9);expect(x.values.qt[1]).toBeCloseTo(300,9);
  });
  it('evaluates only samples and exposes absent P-offset and T-onset coverage',()=>{
    const input={...signal,get truth(){throw Error('forbidden truth');},get events(){throw Error('forbidden events');}};
    const refs=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(meta(),w)]));
    const r=assessExternalDelineation(input,refs,s=>{expect(Object.keys(s)).toEqual(['fs','leads']);return measurement;},p);
    expect(r.waves.P.endpoint.offset.n).toBe(0);expect(r.waves.T.endpoint.onset.n).toBe(0);
    expect(r.waves.QRS.endpoint.onset.n).toBe(2);
    expect(r.waves.T.tangent.endpoint.offset.n).toBe(2);
  });
  it('separates abstention state from numeric error in pooled summaries',()=>{
    const refs=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(meta(),w)]));
    const a=assessExternalDelineation(signal,refs,()=>measurement,p);
    const b=assessExternalDelineation(signal,refs,()=>({...measurement,pr:null,evidence:{...measurement.evidence,pr:{status:'unavailable',reason:'x'}}}),p);
    const pooled=poolExternalDelineation([a,b]);
    expect(pooled.intervals.pr).toMatchObject({referenceEligibleRecords:2,numericWithReference:1,abstentionsWithReference:1});
    expect(pooled.intervals.pr.statuses).toMatchObject({usable:1,unavailable:1});
  });
});
