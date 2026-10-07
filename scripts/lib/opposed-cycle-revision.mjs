/** Exact quality-only revision. Identity is not clinical validation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OPPOSED_CYCLE_REVISION=Object.freeze({
 baselineCommit:'08d270f6bde000c5072c064cdd02df97147ccce1',
 file:'src/engine/analysis/alternating-confidence.ts',
 before:'5e28c22f46023905c977d2ce3f6b6a0f22bc4253b65d91e5e2303ba0b2697fbc',
 after:'04bda5d6055a539a10d64b88063c9fa22df21122d4575f5acfed189b32d24e23',
});
export function assertReviewedOpposedCycle(source){
 assert.equal(createHash('sha256').update(source).digest('hex'),OPPOSED_CYCLE_REVISION.after,'Unreviewed alternating-confidence change');
}
export function assertQualityOnlyRevision(before,after){
 const numeric=m=>Object.fromEntries(Object.entries(m).filter(([key])=>!['evidence','quality'].includes(key)));
 assert.deepEqual(numeric(after),numeric(before),'Confidence policy changed a numerical measurement');
 const rank={usable:0,review:1,unavailable:2};
 assert.deepEqual(Object.keys(after.evidence).sort(),Object.keys(before.evidence).sort(),'Changed evidence fields');
 for(const key of Object.keys(before.evidence)){
  const support=e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['status','reason'].includes(k)));
  assert.deepEqual(support(after.evidence[key]),support(before.evidence[key]),'Changed evidence support: '+key);
  assert.ok(rank[after.evidence[key].status]>=rank[before.evidence[key].status],'Confidence promotion: '+key);
  assert.equal(after.evidence[key].status==='unavailable',before.evidence[key].status==='unavailable','Review must not invent abstention: '+key);
 }
}
