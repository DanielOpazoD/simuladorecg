/** Explicit post-hoc development tradeoff. Preserve the strict stratum report.
 * This acceptance is not a new noise baseline and not clinical validation. */
import assert from 'node:assert/strict';
export function reviewTerminalConsensusTransition(strict) {
 assert.ok(['pass','fail'].includes(strict.status),'Invalid strict comparison');
 assert.ok(strict.failures.every(f=>f.domain==='quality'&&f.metric==='qt'),'Non-QT regression');
 const totals={before:{usableGood:0,usableBad:0,retainedGood:0,retainedBad:0},after:{usableGood:0,usableBad:0,retainedGood:0,retainedBad:0}};
 const losses=[],newRawFalseInUnavailableScope=[];
 for(const row of strict.quality){
  for(const metric of ['hr','qrs'])assert.deepEqual(row.after.metrics[metric],row.before.metrics[metric],'Changed '+metric+' evidence: '+row.id);
  for(const count of ['tp','fp','fn'])assert.equal(row.after[count],row.before[count],'Changed detection: '+row.id);
  const a=row.before.metrics.qt,b=row.after.metrics.qt,[preset,noise,snr,filter]=JSON.parse(row.id);
  for(const side of ['before','after'])for(const key of Object.keys(totals[side]))totals[side][key]+=row[side].metrics.qt[key];
  assert.ok(b.unreferenced<=a.unreferenced,'New unreferenced QT: '+row.id);
  if(noise==='clean'){
   assert.ok(b.usableGood>=a.usableGood&&b.retainedGood>=a.retainedGood&&b.usableBad<=a.usableBad,'Clean source regression: '+row.id);
  }
  if(b.usableBad>a.usableBad){
   assert.equal(filter,'aggressive','New falsely usable QT outside already-unavailable acquisition scope: '+row.id);
   newRawFalseInUnavailableScope.push({preset,noise,snr,filter,before:a.usableBad,after:b.usableBad,displayScope:'2 Hz acquisition always unavailable; raw estimator result retained'});
  }
  if(b.usableGood<a.usableGood||b.retainedGood<a.retainedGood)losses.push({id:row.id,before:a,after:b});
 }
 assert.ok(totals.after.usableGood>=totals.before.usableGood,'Aggregate loss of usable-correct QT');
 assert.ok(totals.after.retainedGood>=totals.before.retainedGood,'Aggregate loss of retained-correct QT');
 assert.ok(totals.after.usableBad<=totals.before.usableBad*.1,'Require at least 90% reduction in falsely usable QT');
 assert.ok(totals.after.retainedBad<=totals.before.retainedBad*.5,'Require at least 50% reduction in retained erroneous QT');
 return {role:'Explicit post-hoc exposed-noise engineering tradeoff; not strict non-regression or clinical validation',totals,losses,newRawFalseInUnavailableScope,
  requirements:'Unchanged source/morphology/detection/HR/QRS; every clean case preserved; no new falsely usable QT in an available acquisition scope; aggregate correct coverage preserved and erroneous outputs substantially reduced',
  historicalBaselineReplaced:false,clinicalValidation:false};
}
