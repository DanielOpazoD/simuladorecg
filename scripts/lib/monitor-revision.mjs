/** Explicit reviewed filter migration; the original strict result remains in evidence.
 * This does NOT accept arbitrary noise degradation or change reference samples.
 */
import assert from 'node:assert/strict';
import { qualityGroups } from './noise-regression.mjs';
const summarize=a=>{const x=a.map(Math.abs).sort((a,b)=>a-b),i=(x.length-1)*.95;return{n:x.length,mean:x.reduce((a,b)=>a+b,0)/x.length,p95:x[Math.floor(i)]+(x[Math.ceil(i)]-x[Math.floor(i)])*(i%1),max:x.at(-1)};};
const metrics=['jMv','j60Mv','qrsPeakToPeakMv','tPeakMv','tAbsoluteAreaMvS'];
export function reviewMonitorRevision(before,after,strict,policy) {
  assert.equal(policy.mode,'monitor');
  const changes=strict.failures.filter(f=>JSON.parse(f.id)[0]==='native'||JSON.parse(f.id)[0]==='post-acquisition' ? JSON.parse(f.id)[4]!=='monitor' : JSON.parse(f.id).at(-1)!=='monitor');
  // Keys in quality/RMSE are [preset,noise,snr,filter].
  assert.equal(changes.length,0,'Unreviewed change outside monitor');
  const rows=r=>r.rows.filter(x=>x.filter==='monitor');
  const b=rows(before),a=rows(after);assert.equal(a.length,230);assert.equal(b.length,230);
  const morphology=Object.fromEntries(metrics.map(k=>[k,{
    before:summarize(b.flatMap(r=>r.morphology.flatMap(t=>Object.values(t.byLead).map(l=>l.errors[k])))),
    after:summarize(a.flatMap(r=>r.morphology.flatMap(t=>Object.values(t.byLead).map(l=>l.errors[k]))))
  }]));
  for(const [k,m] of Object.entries(morphology)) {
    assert.ok(m.after.mean<=m.before.mean+1e-8,`Mean ${k} worsened`);
    // These margins were frozen after exposed development, before temporal replication.
    for(const tail of ['p95','max'])assert.ok(m.after[tail]<=m.before[tail]*policy.maximumTailRatio+1e-8,`${k}/${tail} exceeds reviewed tradeoff`);
  }
  for(const k of ['j60Mv','tPeakMv','tAbsoluteAreaMvS'])assert.ok(morphology[k].after.mean<=morphology[k].before.mean*policy.primaryMeanRatio,`Primary preservation target ${k}`);
  const rmse={before:summarize(b.map(r=>r.rmseMv)),after:summarize(a.map(r=>r.rmseMv))};
  assert.ok(rmse.after.mean<=rmse.before.mean*policy.rmseMeanRatio,'Noise reduction target');
  const counts=r=>({tp:r.reduce((s,x)=>s+x.analysis.tp,0),fp:r.reduce((s,x)=>s+x.analysis.fp,0),fn:r.reduce((s,x)=>s+x.analysis.fn,0),
    hrUsableGood:r.filter(x=>x.analysis.hr.status==='usable'&&x.analysis.hr.exceedsReviewLimit===false).length,
    hrUsableBad:r.filter(x=>x.analysis.hr.status==='usable'&&x.analysis.hr.exceedsReviewLimit===true).length});
  const B=counts(b),A=counts(a);
  assert.ok(A.tp>=B.tp&&A.fp<=B.fp&&A.fn<=B.fn,'Detection non-inferiority');
  assert.ok(A.hrUsableGood>=B.hrUsableGood&&A.hrUsableBad<=B.hrUsableBad,'Retained HR quality worsened');
  const totals=r=>{const g=[...qualityGroups(r)].filter(([id])=>JSON.parse(id).at(-1)==='monitor').map(x=>x[1]);
    return Object.fromEntries(['hr','qrs','qt'].map(m=>[m,Object.fromEntries(['usableGood','usableBad','retainedGood','retainedBad'].map(k=>[k,g.reduce((s,x)=>s+x.metrics[m][k],0)]))]));};
  const quality={before:totals(before),after:totals(after)};
  for(const m of ['hr','qrs','qt']) {const x=quality.before[m],y=quality.after[m];
    assert.ok(y.usableGood>=x.usableGood&&y.usableBad<=x.usableBad&&y.retainedGood>=x.retainedGood,`Retained ${m} quality worsened`);}
  return {quality,status:'pass-reviewed-monitor-migration',mode:'monitor',morphology,rmse,detection:{before:B,after:A},
    strictStatus:strict.status,strictFailures:strict.failures,
    limitations:['Only monitor is migrated; historical off/diagnostic/aggressive retain strict guards.',
      'Exposed development, not holdout; tail budget is an explicit performance tradeoff.',
      'Largest signed T peak is discontinuous when biphasic lobes exchange dominance; both extrema are tested separately.',
      'No promise of causal acquisition, clinical accuracy or improvement in every scenario.']};
}
