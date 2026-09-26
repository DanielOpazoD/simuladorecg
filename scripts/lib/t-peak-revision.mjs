/** Reviewed evidence-only amendment. Never imported by the product. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const T_PEAK_REVISION = Object.freeze({
  baselineCommit:'519267d3b595a27ea8d35a5eae6296c780b58ec4',
  beforeSha256:'42549edaa0502121aeca3e736ef6d18622c425b79b7e5a1ce31f9545c8e5a60e',
  afterSha256:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',
});
const hash=b=>createHash('sha256').update(b).digest('hex');
export function assertReviewedMeasure(before,after) {
  assert.equal(hash(before),T_PEAK_REVISION.beforeSha256,'Unreviewed primitive baseline');
  assert.equal(hash(after),T_PEAK_REVISION.afterSha256,'Unreviewed T-peak implementation');
}
/** Only a previously absent T peak can appear. No endpoint, QT, beat or existing peak changes. */
export function assertPeakOnlyBeats(before,after) {
  assert.equal(after.length,before.length,'Changed QRS population');
  const projected=structuredClone(after);let added=0;
  for(let i=0;i<before.length;i++) {
    const b=before[i],a=projected[i];
    if(b.tPeak===null && a.tPeak!==null) {
      assert.ok(Number.isFinite(a.tPeak)&&a.tPeak>a.offset,'Invalid T candidate');
      assert.equal(a.tEnd,null,'Candidate must not fabricate T end');
      assert.equal(a.tTangentEnd,null,'Candidate must not fabricate tangent');
      assert.equal(a.qt,null,'Candidate must not fabricate QT');
      a.tPeak=null;added++;
    }
  }
  assert.deepEqual(projected,before,'Changed non-candidate beat output');
  return added;
}
export function assertPeakOnlyChange(before,after) {
  const added=assertPeakOnlyBeats(before.beats,after.beats),projected=structuredClone(after);
  projected.beats=before.beats;
  assert.deepEqual(projected,before,'Changed measurement, state, support or rejection');
  return added;
}
