/** Exact numerical revision identity. Historical manifests are never rewritten.
 * Evidence is the paired QRS/T matrix, annotated calibration and strict noise gate;
 * a hash only identifies those bytes and is not evidence of clinical accuracy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const QRS_T_REVISION=Object.freeze({
 baselineCommit:'ca2aa852d2fe5c6affdfdc31db2b9160211944f9',
 files:Object.freeze({
  'src/engine/measure.ts':Object.freeze({before:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',after:'cae31c6ba97c65b35f7bc51838d24ab96c47cf05ce6be977bf02aab0b51d0635'}),
  'src/engine/analysis/ventricular-candidates.ts':Object.freeze({before:'0c7d0abb1834fd9407ca9fdd85c735b7794bcaf933d911f13222039ab4c0bec4',after:'532a1108430d005cd193e160bede946baf416e4bc21e8ce1187150b91d253f53'}),
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
