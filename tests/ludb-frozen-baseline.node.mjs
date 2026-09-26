import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { errors, predictions, assessWindow, intervalReferences, assessRecord, poolRecords } from '../scripts/lib/ludb-frozen-baseline.mjs';
const event=(peak,onset=peak-.05,offset=peak+.05)=>({peak,onset,offset});
const ref=(events=[],excluded=[])=>({events,excluded});
const association={pMaximumBeforeQrsSeconds:.45,pMinimumBeforeQrsSeconds:.02,
  tMaximumAfterQrsSeconds:.8,tMinimumAfterQrsSeconds:.04,tMustEndBeforeNextQrsSeconds:.02};
const protocol={eventMatchToleranceSeconds:.15,intervalAssociation:association};
const references={P:ref([event(.8,.75,.85)]),QRS:ref([event(1,.95,1.05)]),T:ref([event(1.3,1.15,1.5)])};
const measurement=()=>({window:{start:0,end:2},detectedPeaks:[1],beats:[{peak:1,onset:.95,offset:1.05,
  pPeak:.8,pOnset:.75,tPeak:1.3,tEnd:1.5,pr:200,qrs:100,qt:550}],pr:200,qrs:100,qt:550,
  evidence:Object.fromEntries(['pr','qrs','qt'].map(k=>[k,{status:'review',reason:'test'}]))});
const signal={fs:100,leads:{I:new Float32Array(200)},truth:{forbidden:true},events:{forbidden:true}};

test('ordinary even median and nearest-rank p95 are explicit',()=>{
  const s=errors([1,-3,5,-7]);assert.equal(s.medianAbsMs,4);assert.equal(s.p95AbsMs,7);assert.equal(s.biasMs,-1);
});
test('empty errors are null, never zero',()=>assert.deepEqual(errors([]),{
  n:0,biasMs:null,maeMs:null,medianAbsMs:null,p95AbsMs:null,maxAbsMs:null}));
test('nonfinite errors fail closed',()=>assert.throws(()=>errors([1,NaN])));
test('raw QRS detection survives absent delineation',()=>{
  const x=predictions({detectedPeaks:[1],beats:[]},'QRS');
  const a=assessWindow(references.QRS,x,{start:0,end:2});
  assert.equal(a.detection.tp,1);assert.equal(a.endpoint.onset.n,0);assert.equal(a.endpoint.peak.n,1);
});
test('missing P offset and T onset stay missing',()=>{
  assert.equal(predictions(measurement(),'P')[0].offset,null);
  assert.equal(predictions(measurement(),'T')[0].onset,null);
});
test('duplicate peaks cannot create duplicated matched observations',()=>assert.throws(()=>
  predictions({detectedPeaks:[1,1],beats:[]},'QRS')));
test('invalid boundaries are not silently discarded',()=>assert.throws(()=>
  assessWindow(ref([event(1)]),[event(1,NaN)],{start:0,end:2})));
test('out-of-window events are reported separately, not false positives',()=>{
  const x=assessWindow(ref([event(1)]),[event(.2),event(1),event(1.8)],{start:0,end:2});
  assert.equal(x.detection.fp,0);assert.deepEqual(x.outsideWindowPeaks,[.2,1.8]);
});
test('missing aggregate annotation does not imply proven absence',()=>{
  const x=assessWindow(ref(),[event(1)],{start:0,end:2});
  assert.equal(x.detection.fp,0);assert.equal(x.detection.ppv,null);assert.deepEqual(x.unscoredNoReferencePeaks,[1]);
});
test('incomplete reference groups do not create artificial false positives',()=>{
  const x=assessWindow(ref([event(1),event(2)],[{anchorPeak:1.5}]),[event(1),event(1.5),event(2)],{start:0,end:3});
  assert.equal(x.detection.tp,2);assert.equal(x.detection.fp,0);
  assert.deepEqual(x.unscoredIncompleteReferencePeaks,[1.5]);
});
test('an actual false positive inside the annotated window remains counted',()=>{
  const x=assessWindow(ref([event(1),event(2)]),[event(1),event(1.5),event(2)],{start:0,end:3});
  assert.equal(x.detection.fp,1);
});
test('one-to-one event matching does not reuse a detected peak',()=>{
  const x=assessWindow(ref([event(1),event(1.2)]),[event(1.1)],{start:0,end:2});
  assert.equal(x.detection.tp,1);assert.equal(x.detection.fn,1);
});
test('T offset, not merely its peak, must precede the next QRS',()=>{
  const r={...references,QRS:ref([event(1,.95,1.05),event(1.6,1.55,1.65)]),T:ref([event(1.3,1.15,1.58)])};
  const row=intervalReferences(r,association).rows[0];assert.equal(row.qt,null);assert.equal(row.tReason,'overlap');
});
test('ambiguous P waves do not manufacture an AV association',()=>{
  const r={...references,P:ref([event(.7),event(.8)])};
  const row=intervalReferences(r,association).rows[0];assert.equal(row.pr,null);assert.equal(row.pReason,'ambiguous');
});
test('overlapping P and QRS make reference PR unavailable',()=>{
  const r={...references,P:ref([event(.9,.8,.99)])};
  assert.equal(intervalReferences(r,association).rows[0].pr,null);
});
test('only physical samples and fs are passed to analysis',()=>{
  assessRecord(signal,references,input=>{assert.deepEqual(Object.keys(input).sort(),['fs','leads']);return measurement();},protocol);
});
test('review retains a number; statuses and coverage use distinct denominators',()=>{
  const r=assessRecord(signal,references,measurement,protocol),s=poolRecords([r]);
  assert.equal(s.intervals.qt.statusPercent.review,100);assert.equal(s.intervals.qt.abstentionsWithReference,0);
  assert.equal(s.intervals.qt.numericWithReference,1);assert.equal(s.waves.P.endpoint.offset.coverageOfEligible,0);
});
test('unavailable cannot retain a value unnoticed',()=>{
  const m=measurement();m.evidence.qt.status='unavailable';
  assert.throws(()=>assessRecord(signal,references,()=>m,protocol));
});
test('missing paired intervals cannot count as zero error',()=>{
  const m=measurement();m.qt=null;m.evidence.qt.status='unavailable';m.beats[0].qt=null;
  const s=poolRecords([assessRecord(signal,references,()=>m,protocol)]);
  assert.equal(s.pairedIntervals.qt.n,0);assert.equal(s.pairedIntervals.qt.maeMs,null);assert.equal(s.pairedIntervals.qt.coverageOfEligible,0);
});
test('clinical causes are not inferred from error flags',()=>{
  const r=assessRecord(signal,references,measurement,protocol);assert.equal(r.triage.clinicalCause,'not_adjudicated');
});
test('known cohort stays separate from calibration and reserved holdout',()=>{
  const original=JSON.parse(readFileSync(new URL('./reference/ludb-expansion/protocol.json',import.meta.url)));
  const newer=JSON.parse(readFileSync(new URL('./reference/ludb-delineation/protocol.json',import.meta.url)));
  assert.equal(original.records.length,40);assert.equal(new Set(original.records).size,40);
  assert(original.records.every(x=>!newer.calibration.records.includes(x)&&!newer.holdout.records.includes(x)));
  assert.equal(newer.holdoutEnabled,false);
});
