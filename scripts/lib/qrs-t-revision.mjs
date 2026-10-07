import {OPPOSED_CYCLE_REVISION} from './opposed-cycle-revision.mjs';
import {relative} from 'node:path';
import {execFileSync} from 'node:child_process';
/** Exact numerical revision identity. Historical manifests are never rewritten.
 * Evidence is the paired QRS/T matrix, annotated calibration and strict noise gate;
 * a hash only identifies those bytes and is not evidence of clinical accuracy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const QRS_T_REVISION=Object.freeze({
 baselineCommit:'ca2aa852d2fe5c6affdfdc31db2b9160211944f9',
 evaluationBaselineCommit:'63f32b03921158337052e7068abcb6e72ec72f79',
 iteration:'direction-invariant-covariance-v3',
 files:Object.freeze({
  // Sample-preserving projection refactor. Historical analyzers restore these
  // exact predecessors too; see docs/frontal-projection-contract.md for paired evidence.
  'src/engine/leads.ts':Object.freeze({before:'d67c47738647a8aa47f98f01de045ab7381a842007c7d5fa3562f570dc711c16',after:'ab4a73f2345e133cbbe80757d08c1c64f4c54894f1ca521b82eff7041d386706'}),
  'src/engine/lead-registry.ts':Object.freeze({before:'21b9ad7996fc2813156e51d87488f48fae52085ea6935091396e7226589367d3',after:'7f4fe698cd38931a47d41b99e005ca30f642b05553e4137869bda5f99a8990e3'}),
  'src/engine/measure.ts':Object.freeze({before:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',after:'d3233069ad569ce84dc4b6e17d3c706e05d336ff84fdc8d23ea0aefe8277f52f'}),
  'src/engine/analysis/ventricular-candidates.ts':Object.freeze({before:'0c7d0abb1834fd9407ca9fdd85c735b7794bcaf933d911f13222039ab4c0bec4',after:'9766068adbe3e0ce8b30f9f766c3708a8de8b3a3668215104c07a8f9cb4fb040'}),
 }),
});
export function assertReviewedQrsTFile(file,source){
 const entry=QRS_T_REVISION.files[file];assert.ok(entry,'Unreviewed analyzer file');
 assert.equal(createHash('sha256').update(source).digest('hex'),entry.after,'Unreviewed QRS/T implementation: '+file);
}

/** Morphology landmarks are retained; only the ventricular train and summaries
 * can change. This structural contract supplements, not replaces, annotated tests. */
export function assertQrsTRefinement(before,after){
 assert.ok(after.detectedPeaks.every(p=>before.detectedPeaks.includes(p)),'Refinement introduced/moved a candidate');
 for(const beat of after.beats){
  const original=before.beats.find(b=>b.peak===beat.peak);assert.ok(original,'Refinement invented a delineation');
  const index=after.detectedPeaks.indexOf(beat.peak);assert.ok(index>0);
  assert.ok(Math.abs(beat.rr-(beat.peak-after.detectedPeaks[index-1]))<1e-10,'Beat RR differs from retained ventricular train');
  assert.deepEqual({...beat,rr:original.rr},original,'Refinement moved a morphology boundary');
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
  builder.onLoad({filter:/\/(measure|ventricular-candidates|alternating-confidence|leads|lead-registry)\.ts$/},args=>{
   const file=relative(root,args.path),entry=file===OPPOSED_CYCLE_REVISION.file?OPPOSED_CYCLE_REVISION:QRS_T_REVISION.files[file];assert.ok(entry);
   const bytes=execFileSync('git',['show',QRS_T_REVISION.baselineCommit+':'+file]);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.before,'Unreviewed numerical predecessor');
   return {contents:bytes.toString(),loader:'ts'};
  });
 }};
}
