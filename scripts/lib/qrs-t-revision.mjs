import {OPPOSED_CYCLE_REVISION} from './opposed-cycle-revision.mjs';
import {relative} from 'node:path';
import {execFileSync} from 'node:child_process';
/** Exact numerical revision identity. Historical manifests are never rewritten.
 * Evidence is the paired QRS/T matrix, annotated calibration and strict noise gate;
 * a hash only identifies those bytes and is not evidence of clinical accuracy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const QRS_T_REVISION=Object.freeze({
 baselineCommit:'ca2aa852d2fe5c6affdfdc31db2b9160211944f9',
 evaluationBaselineCommit:'63f32b03921158337052e7068abcb6e72ec72f79',
 iteration:'direction-invariant-covariance-v3-terminal-reconciliation',
 files:Object.freeze({
  'src/engine/analysis/statistics.ts':Object.freeze({before:'c8c20531ca3eb5483529d426357360ac1381ac934a3c3ef3d5d3cd21023e5a4b',after:'bdc0b500a3a3883df095054ca9a8298b4c8ea7df7bb336fea01cf266d875e8a6'}),
  'src/engine/analysis/impulses.ts':Object.freeze({before:'362814239fb6dcae06025cb065c6f6dfef08bb5341cabaef01c58d8227222cb1',after:'4ed73f13c6b8dc7460c34b9dd37ad5c5561511ea0f6585d30c6b1585ea14ebe2'}),
  // Null-axis support is reviewed with the primitive, not a filename exemption.
  'src/engine/measurement-support.ts':Object.freeze({before:'1b6df1bf5c5386a9bdd237109b43a49879fd10c93a4b43eceeb7acdddcf7ba33',after:'d07ae50c5534e986d7b776a082e1677f816eaac74542bbe053144763599e162f'}),
  'src/engine/analysis/impulse-confidence.ts':Object.freeze({before:'20a40b8da435c503ea4044919022e5015cae53b818ab283feb158bfeb83055ef',after:'c6b5c4a06cf5c65bacf325e8c77517613ee4427af2075b10575898e03dcee62d'}),
  // Sample-preserving projection refactor. Historical analyzers restore these
  // exact predecessors too; see docs/frontal-projection-contract.md for paired evidence.
  'src/engine/leads.ts':Object.freeze({before:'d67c47738647a8aa47f98f01de045ab7381a842007c7d5fa3562f570dc711c16',after:'ab4a73f2345e133cbbe80757d08c1c64f4c54894f1ca521b82eff7041d386706'}),
  'src/engine/lead-registry.ts':Object.freeze({before:'21b9ad7996fc2813156e51d87488f48fae52085ea6935091396e7226589367d3',after:'7f4fe698cd38931a47d41b99e005ca30f642b05553e4137869bda5f99a8990e3'}),
  'src/engine/measure.ts':Object.freeze({before:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',after:'067d3312fb02857cf39d7bc0b328a937561a75a51d2d9e37d97365e16507f540'}),
  'src/engine/analysis/ventricular-candidates.ts':Object.freeze({before:'0c7d0abb1834fd9407ca9fdd85c735b7794bcaf933d911f13222039ab4c0bec4',after:'7e1bdccec01a09fcaa4abb73e6c063ca53fbe0128758edae6c6118347c49ed42'}),
 }),
});
export const TERMINAL_SOURCE_REVISION = Object.freeze({
 'src/engine/reconcile-t-end.ts':'1aeb40a505a34356bd8f5120650cbe13361af7430a4033ecd6a6a3cdf5493c98',
 'src/engine/t-end-area.ts':'4524022cc840480db2aaa40b3327db64b1341f656b92ec7aa31fdc3ddac49d06',
});
export function assertReviewedQrsTFile(file,source){
 const entry=QRS_T_REVISION.files[file];assert.ok(entry,'Unreviewed analyzer file');
 if(file==='src/engine/measure.ts')for(const [path,sha] of Object.entries(TERMINAL_SOURCE_REVISION))
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),sha,'Unreviewed terminal estimator: '+path);
 assert.equal(createHash('sha256').update(source).digest('hex'),entry.after,'Unreviewed QRS/T implementation: '+file);
}

/** Nonterminal morphology landmarks are retained. Explicit terminal reconciliation
 * must retain its exact predecessor and satisfy its separate numerical contract. This structural contract supplements, not replaces, annotated tests. */
export function assertQrsTRefinement(before,after){
 assert.ok(after.detectedPeaks.every(p=>before.detectedPeaks.includes(p)),'Refinement introduced/moved a candidate');
 for(const beat of after.beats){
  const original=before.beats.find(b=>b.peak===beat.peak);assert.ok(original,'Refinement invented a delineation');
  const index=after.detectedPeaks.indexOf(beat.peak);assert.ok(index>0);
  assert.ok(Math.abs(beat.rr-(beat.peak-after.detectedPeaks[index-1]))<1e-10,'Beat RR differs from retained ventricular train');
  const restored={...beat,rr:original.rr};
  if (beat.terminalRevision) {
   const r=beat.terminalRevision;
   assert.equal(r.method,'area-return-reconciliation-v1');
   assert.equal(r.previousEnd,original.tEnd);assert.equal(r.previousQt,original.qt);
   assert.equal(r.previousTangentEnd,original.tTangentEnd);
   assert.equal(r.areaEnd,beat.tEnd);assert.ok(Number.isFinite(beat.tEnd)&&beat.tEnd>beat.tPeak);
   assert.ok(r.leadCount>=3&&r.spreadMs<=24.000001);
   assert.ok(Math.abs(beat.qt-(beat.tEnd-beat.onset)*1000)<1e-8);
   assert.equal(beat.tTangentEnd,null);
   if(original.tEnd!==null)assert.ok(original.tEnd-beat.tEnd>.04,'Cannot extend an existing endpoint');
   restored.tEnd=r.previousEnd;restored.qt=r.previousQt;restored.tTangentEnd=r.previousTangentEnd;
   delete restored.terminalRevision;
  }
  assert.deepEqual(restored,original,'Refinement moved an unreviewed morphology boundary');
 }
 if(after.hr!==null&&after.detectedPeaks.length>=2){
  const p=after.detectedPeaks,expected=60*(p.length-1)/(p.at(-1)-p[0]);
  assert.ok(Math.abs(after.hr-expected)<1e-8,'Rate does not follow retained sample candidates');
 }
}

/** Before/after errors belong to their respective numerical estimates. */
export const summarizeRateRevision=arr=>({scenarios:arr.length,beforeUsable:arr.filter(r=>r.before==='usable').length,
    afterUsable:arr.filter(r=>r.after==='usable').length,
    usableBeyondBefore:arr.filter(r=>r.before==='usable'&&r.beforeBeyondReview).length,
    usableBeyondAfter:arr.filter(r=>r.after==='usable'&&r.beyondReview).length,
    newlyReviewed:arr.filter(r=>r.before==='usable'&&r.after==='review').length,
    accurateNewReviews:arr.filter(r=>r.before==='usable'&&r.after==='review'&&r.beyondReview===false).length,
    rawBeyond:arr.filter(r=>r.beyondReview).length,unavailable:arr.filter(r=>r.hr===null).length});

/** Restore exact numerical and confidence predecessor bytes for historical assertions.
 * Actual revised quality is evaluated separately on unchanged samples. */
export function preQrsTNumericsPlugin(root){
 return {name:'exact-pre-qrs-t-numerics',setup(builder){
  builder.onLoad({filter:/\/(measure|statistics|impulses|measurement-support|ventricular-candidates|alternating-confidence|impulse-confidence|leads|lead-registry)\.ts$/},args=>{
   const file=relative(root,args.path),entry=file===OPPOSED_CYCLE_REVISION.file?OPPOSED_CYCLE_REVISION:QRS_T_REVISION.files[file];assert.ok(entry);
   const bytes=execFileSync('git',['show',QRS_T_REVISION.baselineCommit+':'+file]);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.before,'Unreviewed numerical predecessor');
   return {contents:bytes.toString(),loader:'ts'};
  });
 }};
}
