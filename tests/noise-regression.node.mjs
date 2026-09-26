import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {LEADS,METRICS,expectedRows,compareReports,validateReport,qualityGroups} from '../scripts/lib/noise-regression.mjs';
const clone=structuredClone;
const hash='a'.repeat(64);
const p={presets:['sinus'],filters:['off','diagnostic'],records:['em'],segmentStartsSeconds:[60,180,300],snrDb:[0],reviewThresholds:{hrBpm:5,qrsMs:20,qtMs:30}};
function morphology() {
  return [{kind:'normal',windows:{baseline:[5,5.02],qrs:[5.1,5.2],t:[5.3,5.6]},
    byLead:Object.fromEntries(LEADS.map(l=>[l,{errors:Object.fromEntries(METRICS.map(m=>[m,0])),
      exceeded:{j:false,j60:false,qrs:false,tPeak:false,tArea:false},requiresReview:false}]))}];
}
function fixture() {
  return {schemaVersion:2,protocol:clone(p),noiseProtocolSha256:hash,noiseSha256:hash,
    sourceCommit:'example',cleanSourceHashes:{sinus:hash},analyzerEntry:'src/engine/sample-analysis.ts',
    analyzerReceivesOnlySamples:true,modelAuditUsed:false,
    rows:expectedRows(p).map(r=>({...r,achievedDb:r.snrDb,rmseMv:r.noise==='clean'?0:.1,morphology:morphology(),
      analysis:{tp:2,fp:0,fn:0,outsideWindow:0,matchedWithDelineation:2,
        errors:[0,1].map(()=>({kind:'normal',qrsMs:0,qtMs:0,onsetMs:0,offsetMs:0})),
        hr:{status:'usable',retained:true,error:0,exceedsReviewLimit:false},
        metricStatus:{qrs:'usable',qt:'usable'},reported:{hr:60,qrs:90,qt:380}}})),
    native:p.filters.map(filter=>({preset:'sinus',filter,morphology:morphology()}))};
}
function checkMutation(mutator,pattern) {
  const b=fixture(),a=clone(b);mutator(a);
  assert.throws(()=>compareReports(b,a),pattern);
}
function failure(mutator,domain) {
  const b=fixture(),a=clone(b);mutator(a);
  const r=compareReports(b,a);assert.equal(r.status,'fail');assert.ok(r.failures.some(f=>f.domain===domain));
}
describe('Calibrated-noise acceptance protects observed information',()=>{
  it('complete paired results pass; clinical validity remains false',()=>{
    const r=compareReports(fixture(),fixture());assert.equal(r.status,'pass');assert.equal(r.scenarios,8);
    assert.equal(r.nativeComparisons,2);assert.equal(r.clinicalValidation,false);
  });
  it('row order does not change pairing or gates',()=>{
    const b=fixture(),a=clone(b);a.rows.reverse();a.native.reverse();assert.equal(compareReports(b,a).status,'pass');
  });
  it('does not trust supplied summary groups',()=>{
    const r=fixture();r.groups=[{everything:'perfect'}];validateReport(r);
    r.rows[0].analysis.reported.hr=null;assert.throws(()=>validateReport(r),/Absent/);
  });
  it('rejects one omitted scenario',()=>checkMutation(a=>a.rows.pop(),/scenarios/));
  it('rejects duplication even if total count is unchanged',()=>checkMutation(a=>a.rows[1]=clone(a.rows[0]),/Duplicate/));
  it('rejects a substituted noise window',()=>checkMutation(a=>a.rows[1].startSeconds=99,/scenarios/));
  it('rejects omitted native comparison',()=>checkMutation(a=>a.native.pop(),/native/));
  it('rejects a missing lead',()=>checkMutation(a=>delete a.rows[0].morphology[0].byLead.V6,/lead/));
  it('rejects a missing metric',()=>checkMutation(a=>delete a.rows[0].morphology[0].byLead.I.errors.tPeakMv,/metric/));
  it('rejects NaN instead of counting as zero',()=>checkMutation(a=>a.rows[0].morphology[0].byLead.I.errors.jMv=NaN,/Nonfinite/));
  it('rejects missing estimates marked usable',()=>checkMutation(a=>a.rows[0].analysis.reported.qt=null,/Absent/));
  it('rejects a nonfinite reported estimate',()=>checkMutation(a=>a.rows[0].analysis.reported.qt=Infinity,/Nonfinite/));
  it('rejects invalid status',()=>checkMutation(a=>a.rows[0].analysis.hr.status='confidence=1',/status/));
  it('rejects primitive-only testing when the worker has another entry',()=>checkMutation(a=>a.analyzerEntry='src/engine/measure.ts',/actual worker/));
  it('rejects model audit leakage',()=>checkMutation(a=>a.modelAuditUsed=true,/truth/));
  it('rejects reference window shifts',()=>checkMutation(a=>a.rows[0].morphology[0].windows.t[1]+=.01,/reference windows/));
  it('rejects redefining the clean source',()=>checkMutation(a=>a.cleanSourceHashes.sinus='b'.repeat(64),/Clean source/));
  it('rejects different noise bytes',()=>checkMutation(a=>a.noiseSha256='b'.repeat(64),/noise sources/));
  it('rejects silent change of review margins',()=>checkMutation(a=>a.protocol.reviewThresholds.hrBpm=100,/Protocol/));
  it('rejects wrong SNR',()=>checkMutation(a=>a.rows[1].achievedDb=6,/SNR/));
  it('rejects omitted matched boundaries with unchanged denominator',()=>checkMutation(a=>a.rows[0].analysis.errors.pop(),/denominator/));
  it('rejects altered reference event counts',()=>checkMutation(a=>a.rows[0].analysis.fn++,/reference event denominator/));
  it('negative numerical tolerance is invalid',()=>assert.throws(()=>compareReports(fixture(),fixture(),{voltageMv:-1}),/Negative/));
  for(const m of METRICS)for(const sign of [-1,1])it(`catches ${m}, sign ${sign}, in V5 without compensation from RMSE`,()=>{
    failure(a=>{a.rows[1].rmseMv=0;a.rows[1].morphology[0].byLead.V5.errors[m]=sign*.03;},'morphology');
  });
  it('native and post-acquisition chains are protected separately',()=>failure(a=>a.native[1].morphology[0].byLead.III.errors.j60Mv=.1,'morphology'));
  it('a worse maximum cannot hide in an improved mean',()=>{
    const b=fixture(),a=clone(b),ids=[1,2,3];
    ids.forEach(i=>b.rows[i].morphology[0].byLead.I.errors.jMv=.02);
    a.rows[3].morphology[0].byLead.I.errors.jMv=.03;
    assert.ok(compareReports(b,a).failures.some(f=>f.metric==='max'));
  });
  it('higher residual noise does not pass when selected landmarks are unchanged',()=>failure(a=>a.rows[1].rmseMv=.3,'rmse'));
  it('extra false detections cannot hide behind valid morphology',()=>failure(a=>a.rows[0].analysis.fp++,'detection'));
  it('making all rates unavailable does not count as improved quality',()=>{
    failure(a=>{for(const r of a.rows){r.analysis.reported.hr=null;r.analysis.hr={status:'unavailable',retained:false,error:null,exceedsReviewLimit:null};}},'quality');
  });
  it('making correct usable rates review does not count as abstention',()=>{
    const b=fixture(),a=clone(b);a.rows.forEach(r=>r.analysis.hr.status='review');
    assert.equal(compareReports(b,a).status,'fail');
    const q=[...qualityGroups(a).values()][0].metrics.hr;
    assert.ok(q.review>0);assert.equal(q.abstentions,0);assert.equal(q.reported,q.review);
  });
  it('all QRS estimates unavailable cannot erase evidence of lost coverage',()=>failure(a=>{
    for(const r of a.rows){r.analysis.reported.qrs=null;r.analysis.metricStatus.qrs='unavailable';}
  },'quality'));
  it('an incorrect retained estimate promoted from review is a regression',()=>{
    const b=fixture();b.rows[0].analysis.hr={status:'review',retained:true,error:10,exceedsReviewLimit:true};
    const a=clone(b);a.rows[0].analysis.hr.status='usable';assert.equal(compareReports(b,a).status,'fail');
  });
  it('warning on an incorrect rate is allowed while the number remains visible',()=>{
    const b=fixture();b.rows[0].analysis.hr.error=10;b.rows[0].analysis.hr.exceedsReviewLimit=true;
    const a=clone(b);a.rows[0].analysis.hr.status='review';assert.equal(compareReports(b,a).status,'pass');
  });
  it('a pre-existing inaccurate baseline may pass only as regression, not accuracy',()=>{
    const a=fixture();a.rows[0].analysis.hr.error=10;a.rows[0].analysis.hr.exceedsReviewLimit=true;
    const r=compareReports(a,a);assert.equal(r.status,'pass');assert.equal(r.quality[0].after.metrics.hr.usableBad,1);
  });
});
