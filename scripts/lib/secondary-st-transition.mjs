import assert from 'node:assert/strict';
/** Explicit, exposed-data engineering migration review. This does not turn a
 * failed old-source strict comparison into a strict pass. All strata remain in
 * the report. Future changes use the separately frozen new-source strict gate. */
export function reviewSecondarySTTransition(strict){
 assert.equal(strict.scenarios,920,'Full frozen stress set is required');
 const modified=new Set(['lbbb','pvc']);
 for(const failure of strict.failures){
  const id=JSON.parse(failure.id),preset=failure.domain==='morphology'?id[1]:id[0];
  assert.ok(modified.has(preset),'Unrelated source/performance deterioration: '+failure.id);
 }
 const totals={before:{tp:0,fp:0,fn:0,hr:0,qrs:0,qt:0},after:{tp:0,fp:0,fn:0,hr:0,qrs:0,qt:0}};
 for(const row of strict.quality)for(const side of ['before','after']){
  for(const key of ['tp','fp','fn'])totals[side][key]+=row[side][key];
  for(const key of ['hr','qrs','qt'])totals[side][key]+=row[side].metrics[key].usableBad;
 }
 assert.ok(totals.after.tp>=totals.before.tp,'Aggregate true QRS lost');
 for(const key of ['fp','fn','hr','qrs','qt'])assert.ok(totals.after[key]<=totals.before[key],'Aggregate deterioration: '+key);
 return {status:'reviewed-source-migration',strictStatus:strict.status,clinicalValidation:false,totals,
  scope:'Aggregate bounds on exposed correlated software cases; strict stratum regressions are retained, not clinical non-inferiority.',
  strictFailureCounts:strict.failures.reduce((counts,item)=>(counts[item.domain]=(counts[item.domain]||0)+1,counts),{})};
}
