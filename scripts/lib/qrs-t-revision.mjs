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
  // Null-axis support is reviewed with the primitive, not a filename exemption.
  'src/engine/measurement-support.ts':Object.freeze({before:'1b6df1bf5c5386a9bdd237109b43a49879fd10c93a4b43eceeb7acdddcf7ba33',after:'27168ab1b6fdcfdee8045ff31a3cf12fe4545ec9919b792df1db16651aca8f54'}),
  'src/engine/analysis/impulse-confidence.ts':Object.freeze({before:'20a40b8da435c503ea4044919022e5015cae53b818ab283feb158bfeb83055ef',after:'c6b5c4a06cf5c65bacf325e8c77517613ee4427af2075b10575898e03dcee62d'}),
  // Sample-preserving projection refactor. Historical analyzers restore these
  // exact predecessors too; see docs/frontal-projection-contract.md for paired evidence.
  'src/engine/leads.ts':Object.freeze({before:'d67c47738647a8aa47f98f01de045ab7381a842007c7d5fa3562f570dc711c16',after:'ab4a73f2345e133cbbe80757d08c1c64f4c54894f1ca521b82eff7041d386706'}),
  'src/engine/lead-registry.ts':Object.freeze({before:'21b9ad7996fc2813156e51d87488f48fae52085ea6935091396e7226589367d3',after:'7f4fe698cd38931a47d41b99e005ca30f642b05553e4137869bda5f99a8990e3'}),
  'src/engine/measure.ts':Object.freeze({before:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',after:'c78e48df10d2c394e0b94e2772a84971edf292ef00793363e1c01a9ff94d7d0e'}),
  'src/engine/analysis/ventricular-candidates.ts':Object.freeze({before:'0c7d0abb1834fd9407ca9fdd85c735b7794bcaf933d911f13222039ab4c0bec4',after:'df93e6f7eec4f59464badb9191c9af2e0299e1678e2489bfd0f4fd306bd7140e'}),
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
  builder.onLoad({filter:/\/(measure|measurement-support|ventricular-candidates|alternating-confidence|impulse-confidence|leads|lead-registry)\.ts$/},args=>{
   const file=relative(root,args.path),entry=file===OPPOSED_CYCLE_REVISION.file?OPPOSED_CYCLE_REVISION:QRS_T_REVISION.files[file];assert.ok(entry);
   const bytes=execFileSync('git',['show',QRS_T_REVISION.baselineCommit+':'+file]);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.before,'Unreviewed numerical predecessor');
   return {contents:bytes.toString(),loader:'ts'};
  });
 }};
}
