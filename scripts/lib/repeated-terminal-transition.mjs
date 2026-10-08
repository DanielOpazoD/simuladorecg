/** Reviewed consequence of removing false terminal candidates: unchanged QRS
 * numbers may require review when spurious beats no longer inflate the confidence
 * population. Never relax the product's confidence limit or hide strict failure. */
import assert from 'node:assert/strict';
const group=r=>JSON.stringify([r.preset,r.noise,r.snrDb,r.filter]);
const row=r=>JSON.stringify([r.preset,r.noise,r.startSeconds,r.snrDb,r.filter]);
export function reviewRepeatedTerminalTransition(before,after,strict){
 const old=new Map(before.rows.map(r=>[row(r),r])),reviewed=[];
 for(const failure of strict.failures){
  assert.equal(failure.domain,'quality','Unreviewed non-quality regression');
  assert.equal(failure.metric,'qrs','Only QRS confidence may be demoted');
  const b=failure.before,a=failure.after;
  assert.equal(a.retainedGood,b.retainedGood,'Lost correct retained QRS');
  assert.equal(a.retainedBad,b.retainedBad,'Changed numerical QRS errors');
  assert.equal(a.comparable,b.comparable,'Changed reference population');
  assert.equal(a.unreferenced,b.unreferenced,'Changed unreferenced outputs');
  assert.equal(a.abstentions,b.abstentions,'New abstention');
  assert.equal(a.reported,b.reported,'Lost QRS number');
  assert.ok(a.usableBad<=b.usableBad,'Increased erroneous usable QRS');
  let demotions=0;
  for(const r of after.rows.filter(r=>group(r)===failure.id)){
   const previous=old.get(row(r));assert.ok(previous,'Unpaired scenario');
   const x=previous.analysis,y=r.analysis;
   assert.equal(y.tp,x.tp,'Lost true QRS');assert.equal(y.fn,x.fn,'New missed QRS');
   assert.ok(y.fp<=x.fp,'New false QRS');
   assert.equal(y.reported.qrs,x.reported.qrs,'Changed QRS summary');
   const boundaries=a=>a.errors.map(({kind,qrsMs,onsetMs,offsetMs})=>({kind,qrsMs,onsetMs,offsetMs}));
   assert.deepEqual(boundaries(y),boundaries(x),'Changed matched QRS boundaries');
   if(x.metricStatus.qrs!==y.metricStatus.qrs){
    assert.equal(x.metricStatus.qrs,'usable');assert.equal(y.metricStatus.qrs,'review');
    assert.ok(y.fp<x.fp,'No false terminal candidates removed');
    assert.ok(y.reported.qrs!==null,'Demotion discarded QRS number');
    assert.ok(Math.abs(y.hr.error)<=Math.abs(x.hr.error),'Worsened rate');
    demotions++;reviewed.push({scenario:row(r),falseCandidatesBefore:x.fp,falseCandidatesAfter:y.fp,qrsMs:y.reported.qrs,unchangedMatchedBoundaries:y.errors.length,change:'usable to review; numerical evidence preserved'});
   }
  }
  assert.ok(demotions>0,'Unexplained strict failure');
 }
 return {status:'accepted-confidence-consequence',clinicalValidation:false,strictStatus:strict.status,reviewed};
}
