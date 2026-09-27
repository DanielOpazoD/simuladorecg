/** Offline non-regression gate. Never imported by the product or its analyzer.
 * The frozen baseline may be wrong. Passing means no unreviewed deterioration,
 * NOT clinical accuracy. Groups are regenerated from rows, never trusted totals.
 */
import assert from 'node:assert/strict';

export const LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export const METRICS = ['jMv','j60Mv','qrsPeakToPeakMv','tPeakMv','tAbsoluteAreaMvS'];
const STATES = ['usable','review','unavailable'];
const key = values => JSON.stringify(values);
const rowKey = r => key([r.preset,r.noise,r.startSeconds,r.snrDb,r.filter]);
const groupKey = r => key([r.preset,r.noise,r.snrDb,r.filter]);
const finite = (v, label) => assert.ok(typeof v==='number' && Number.isFinite(v),label);
const count = (v, label) => assert.ok(Number.isSafeInteger(v) && v>=0,label);
const sameKeys = (a,b,label) => assert.deepEqual([...a].sort(),[...b].sort(),label);

export function expectedRows(p) {
  return p.presets.flatMap(preset => p.filters.flatMap(filter => [
    {preset,filter,noise:'clean',startSeconds:null,snrDb:null},
    ...p.records.flatMap(noise => p.segmentStartsSeconds.flatMap(startSeconds =>
      p.snrDb.map(snrDb => ({preset,filter,noise,startSeconds,snrDb})))),
  ]));
}

function windows(morphology) {
  assert.ok(Array.isArray(morphology) && morphology.length>0,'No morphology cycles');
  const kinds=new Set();
  for(const beat of morphology) {
    assert.ok(typeof beat.kind==='string' && !kinds.has(beat.kind),'Duplicate/missing beat kind');
    kinds.add(beat.kind);
    for(const name of ['baseline','qrs','t']) {
      const w=beat.windows?.[name];
      assert.ok(Array.isArray(w) && w.length===2,'Missing window');
      w.forEach(x=>finite(x,'Invalid window')); assert.ok(w[0]<w[1],'Reversed window');
    }
    sameKeys(Object.keys(beat.byLead),LEADS,'Missing/extra morphology lead');
    for(const lead of LEADS) {
      const m=beat.byLead[lead];
      sameKeys(Object.keys(m.errors),METRICS,'Missing/extra morphology metric');
      METRICS.forEach(k=>finite(m.errors[k],'Nonfinite morphology error'));
      sameKeys(Object.keys(m.exceeded),['j','j60','qrs','tPeak','tArea'],'Missing review flags');
      Object.values(m.exceeded).forEach(v=>assert.equal(typeof v,'boolean'));
      assert.equal(m.requiresReview,Object.values(m.exceeded).some(Boolean),'Inconsistent review flag');
    }
  }
}

export function validateReport(report) {
  assert.equal(report.schemaVersion,2,'Report schema must identify its analyzer');
  assert.equal(report.analyzerEntry,'src/engine/sample-analysis.ts','Must test the actual worker pipeline');
  assert.equal(report.analyzerReceivesOnlySamples,true);
  assert.equal(report.modelAuditUsed,false,'Model truth must not change analyzer output');
  assert.match(report.noiseSha256,/^[0-9a-f]{64}$/,'Missing noise identity');
  const p=report.protocol, rows=new Map(), native=new Map();
  sameKeys(Object.keys(report.cleanSourceHashes),p.presets,'Missing clean-signal identity');
  Object.values(report.cleanSourceHashes).forEach(h=>assert.match(h,/^[0-9a-f]{64}$/));
  assert.match(report.noiseProtocolSha256,/^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(report.rows) && Array.isArray(report.native),'Missing scenarios');
  for(const row of report.rows) {
    const id=rowKey(row); assert.ok(!rows.has(id),'Duplicate scenario'); rows.set(id,row);
    if(row.noise==='clean') assert.equal(row.achievedDb,null);
    else { finite(row.achievedDb,'SNR absent'); assert.ok(Math.abs(row.achievedDb-row.snrDb)<1e-6,'Miscalibrated SNR'); }
    finite(row.rmseMv,'RMSE absent'); assert.ok(row.rmseMv>=0);
    windows(row.morphology);
    const a=row.analysis;
    for(const k of ['tp','fp','fn','outsideWindow','matchedWithDelineation']) count(a[k],`Invalid ${k}`);
    assert.ok(a.matchedWithDelineation<=a.tp,'Delineation exceeds matched detections');
    assert.equal(a.errors.length,a.matchedWithDelineation,'Delineation denominator mismatch');
    for(const e of a.errors) {
      for(const k of ['qrsMs','onsetMs','offsetMs']) finite(e[k],`Invalid ${k}`);
      if(e.qtMs!==null)finite(e.qtMs,'Invalid QT error');
    }
    for(const k of ['hr','qrs','qt']) {
      const status=k==='hr'?a.hr.status:a.metricStatus[k], value=a.reported[k];
      assert.ok(STATES.includes(status),'Unknown quality status');
      if(value!==null)finite(value,'Nonfinite estimate');
      if(value===null)assert.equal(status,'unavailable','Absent value must not claim usability');
    }
    if(a.hr.error!==null) finite(a.hr.error,'Nonfinite HR error');
    assert.equal(a.hr.retained,a.reported.hr!==null&&a.hr.status!=='unavailable','Retained HR mismatch');
    assert.equal(a.hr.exceedsReviewLimit,a.hr.error===null?null:Math.abs(a.hr.error)>p.reviewThresholds.hrBpm);
    if(!a.hr.retained)assert.equal(a.hr.error,null,'Absent HR counted as zero error');
  }
  sameKeys(rows.keys(),expectedRows(p).map(rowKey),'Changed, missing or extra scenarios');
  for(const row of report.native) {
    const id=key([row.preset,row.filter]); assert.ok(!native.has(id),'Duplicate native scenario');
    windows(row.morphology); native.set(id,row);
  }
  sameKeys(native.keys(),p.presets.flatMap(id=>p.filters.map(f=>key([id,f]))),'Missing native chain');
  return {rows,native};
}

function stats(values) {
  const a=values.map(Math.abs).sort((x,y)=>x-y), index=(a.length-1)*.95;
  return {n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,
    p95:a[Math.floor(index)]+(a[Math.ceil(index)]-a[Math.floor(index)])*(index%1),max:a.at(-1)};
}

function morphologyGroups(rows,native=false) {
  const out=new Map();
  for(const r of rows) for(const b of r.morphology) for(const l of LEADS) for(const m of METRICS) {
    const id=key([native?'native':'post-acquisition',r.preset,r.noise??null,r.snrDb??null,r.filter,b.kind,l,m]);
    const a=out.get(id)??[];a.push(b.byLead[l].errors[m]);out.set(id,a);
  }
  return new Map([...out].map(([id,a])=>[id,stats(a)]));
}

/** Per-beat QRS/QT errors inherit a GLOBAL status; not per-beat probabilities.
 * Review is still a retained estimate, not abstention. Only absent/unavailable
 * estimates are abstentions. Denominators stay in the report when that happens.
 */
export function qualityGroups(report) {
  const groups=new Map();
  for(const row of report.rows) {
    const id=groupKey(row), a=row.analysis;
    const group=groups.get(id)??{scenarios:0,tp:0,fp:0,fn:0,metrics:{}};
    group.scenarios++; for(const k of ['tp','fp','fn'])group[k]+=a[k];
    for(const metric of ['hr','qrs','qt']) {
      const status=metric==='hr'?a.hr.status:a.metricStatus[metric];
      const q=group.metrics[metric]??{reported:0,usable:0,review:0,abstentions:0,
        comparable:0,usableGood:0,usableBad:0,retainedGood:0,retainedBad:0,unreferenced:0};
      const retained=a.reported[metric]!==null&&status!=='unavailable';
      if(!retained)q.abstentions++;else {q.reported++;q[status]++;}
      const errors=metric==='hr'?(a.hr.error===null?[]:[a.hr.error]):a.errors.flatMap(e=>e[metric+'Ms']===null?[]:[e[metric+'Ms']]);
      q.comparable+=errors.length;
      if(retained&&!errors.length)q.unreferenced++;
      const tolerance=report.protocol.reviewThresholds[metric==='hr'?'hrBpm':metric+'Ms'];
      if(retained)for(const e of errors) {
        const good=Math.abs(e)<=tolerance; q[good?'retainedGood':'retainedBad']++;
        if(status==='usable')q[good?'usableGood':'usableBad']++;
      }
      group.metrics[metric]=q;
    }
    groups.set(id,group);
  }
  return groups;
}

export function compareReports(before,after,{voltageMv=1e-6,areaMvS=1e-8}={}) {
  finite(voltageMv,'Invalid tolerance');finite(areaMvS,'Invalid tolerance');
  assert.ok(voltageMv>=0&&areaMvS>=0,'Negative tolerance');
  const B=validateReport(before),A=validateReport(after);
  assert.deepEqual(before.protocol,after.protocol,'Protocol changed during comparison');
  assert.equal(before.noiseSha256,after.noiseSha256,'Different noise sources');
  assert.equal(before.noiseProtocolSha256,after.noiseProtocolSha256,'Different protocol bytes');
  assert.deepEqual(before.cleanSourceHashes,after.cleanSourceHashes,'Clean source changed: cannot redefine truth to pass');
  const failures=[];let checkedMorphology=0;
  for(const collection of ['rows','native']) {
    for(const [id,b] of B[collection]) {
      const a=A[collection].get(id);
      assert.deepEqual(b.morphology.map(x=>({kind:x.kind,windows:x.windows})),a.morphology.map(x=>({kind:x.kind,windows:x.windows})),'Changed reference windows');
      if(collection==='rows')assert.equal(b.analysis.tp+b.analysis.fn,a.analysis.tp+a.analysis.fn,'Changed reference event denominator');
    }
    const bg=morphologyGroups(B[collection].values(),collection==='native');
    const ag=morphologyGroups(A[collection].values(),collection==='native');
    sameKeys(bg.keys(),ag.keys(),'Changed morphology strata');
    for(const [id,b] of bg) {
      const a=ag.get(id),epsilon=JSON.parse(id).at(-1)==='tAbsoluteAreaMvS'?areaMvS:voltageMv;
      assert.equal(a.n,b.n,'Changed morphology denominator');
      for(const metric of ['mean','p95','max']) {
        checkedMorphology++;
        if(a[metric]>b[metric]+epsilon)failures.push({domain:'morphology',id,metric,before:b[metric],after:a[metric],epsilon});
      }
    }
  }
  const qb=qualityGroups(before),qa=qualityGroups(after);
  for(const [id,b] of qb) {
    const a=qa.get(id);
    const r0=stats(before.rows.filter(r=>groupKey(r)===id).map(r=>r.rmseMv));
    const r1=stats(after.rows.filter(r=>groupKey(r)===id).map(r=>r.rmseMv));
    for(const metric of ['mean','p95','max'])if(r1[metric]>r0[metric]+voltageMv)
      failures.push({domain:'rmse',id,metric,before:r0[metric],after:r1[metric]});
    if(a.tp<b.tp||a.fp>b.fp||a.fn>b.fn)failures.push({domain:'detection',id,before:b,after:a});
    for(const metric of ['hr','qrs','qt']) {
      const x=b.metrics[metric],y=a.metrics[metric];
      if(y.usableBad>x.usableBad||y.usableGood<x.usableGood||y.retainedGood<x.retainedGood||y.unreferenced>x.unreferenced)
        failures.push({domain:'quality',id,metric,before:x,after:y});
    }
  }
  const violations=r=>r.rows.filter(x=>x.morphology.some(b=>LEADS.some(l=>b.byLead[l].requiresReview))).length;
  return {schemaVersion:1,status:failures.length?'fail':'pass',clinicalValidation:false,
    baselineCommit:before.sourceCommit,candidateCommit:after.sourceCommit,
    scenarios:after.rows.length,nativeComparisons:after.native.length,checkedMorphology,
    qualityStrata:qa.size,noiseSha256:after.noiseSha256,
    preexistingMorphologyReviewScenarios:violations(before),candidateMorphologyReviewScenarios:violations(after),
    quality:[...qa].map(([id,a])=>({id,before:qb.get(id),after:a})),failures,
    limitations:['Exposed deterministic regression, not independent clinical validation.',
      'Paired numerical tolerances are NOT diagnostic thresholds.',
      'Review retains a number; it is not abstention.',
      'QRS/QT boundary counts use global evidence status; no beatwise confidence is claimed.',
      'The frozen baseline can be inaccurate; preexisting failures remain visible.',
      'Intentional performance tradeoffs require a separate reviewed contract, not baseline regeneration.']};
}
