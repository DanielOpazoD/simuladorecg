/** Exposed stress characterization of an intentional source change. The old WPW
 * repolarization is not a morphological target. Preserve every raw adverse case;
 * enforce reported-number safety in the product's unchanged acquisition domain. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateReport} from './lib/noise-regression.mjs';
const [beforeFile,afterFile,output]=process.argv.slice(2);assert.ok(output);
const before=JSON.parse(readFileSync(beforeFile)),after=JSON.parse(readFileSync(afterFile));
validateReport(before);validateReport(after);
assert.equal(before.sourceCommit,'d208370f883b9f1d3a22c34db62d97daacb279c6');
assert.deepEqual(after.protocol,before.protocol);assert.deepEqual(after.protocol.presets,['wpw']);
assert.equal(after.noiseSha256,before.noiseSha256);assert.equal(after.rows.length,184);
const hash=x=>createHash('sha256').update(x).digest('hex');
const provenance=JSON.parse(readFileSync(resolve(dirname(afterFile),'evaluation-provenance.json')));
for(const [file,sha]of Object.entries(provenance.evaluatedSources))assert.equal(hash(readFileSync(file)),sha,'Candidate report source changed: '+file);
const scopeFile=resolve(dirname(output),'acquisition-scope.mjs');mkdirSync(dirname(scopeFile),{recursive:true});
await build({entryPoints:[resolve('src/engine/acquisition-measurement.ts')],bundle:true,platform:'node',format:'esm',outfile:scopeFile});
const {applyAcquisitionScope}=await import(pathToFileURL(scopeFile));
// Only the existing worker's acquisition guard, with no model labels or truth.
const states=(r)=>applyAcquisitionScope({quality:'',evidence:Object.fromEntries(['hr','qrs','qt'].map(k=>[k,{status:k==='hr'?r.analysis.hr.status:r.analysis.metricStatus[k]}]))},r.filter).evidence;
const key=r=>JSON.stringify([r.noise,r.startSeconds,r.snrDb,r.filter]),prior=new Map(before.rows.map(r=>[key(r),r]));
const rows=[],failures=[];
for(const r of after.rows){
 const b=prior.get(key(r));assert.ok(b);const x=b.analysis,y=r.analysis,bs=states(b),as=states(r);
 const supported=r.filter==='off'||r.filter==='diagnostic';
 if(supported&&(y.tp<x.tp||y.fn>x.fn))failures.push({id:key(r),reason:'Lost ventricular activation in measurement acquisition'});
 if(as.hr.status==='usable'&&y.hr.exceedsReviewLimit&&!(bs.hr.status==='usable'&&x.hr.exceedsReviewLimit))failures.push({id:key(r),reason:'New confidently wrong reported heart rate'});
 // QRS summaries are medians. Global confidence never certifies every beat;
 // preserve all individual boundary errors below rather than relabeling them.
 const badQrs=(a,status)=>status==='usable'&&a.reported.qrs!==null&&Math.abs(a.reported.qrs-135)>after.protocol.reviewThresholds.qrsMs;
 if(badQrs(y,as.qrs.status)&&!badQrs(x,bs.qrs.status))failures.push({id:key(r),reason:'New confidently wrong reported QRS duration'});
 if(r.noise==='clean'){
  if(y.fn||y.fp||y.hr.exceedsReviewLimit)failures.push({id:key(r),reason:'Clean WPW rate/detection failed'});
 }
 rows.push({id:key(r),supportedMeasurementAcquisition:supported,before:x,after:y,displayedBefore:bs,displayedAfter:as,
  rawAdverse:{extraMissed:y.fn>x.fn,newFalseUsableHr:y.hr.status==='usable'&&y.hr.exceedsReviewLimit&&!(x.hr.status==='usable'&&x.hr.exceedsReviewLimit),
    usableBoundaryOutlierIncrease:y.metricStatus.qrs==='usable'&&y.retainedBeyondLimits.qrs.count>(x.metricStatus.qrs==='usable'?x.retainedBeyondLimits.qrs.count:0)}});
}
const summary=Object.fromEntries(['before','after'].map(side=>[side,{trueCandidates:rows.reduce((n,r)=>n+r[side].tp,0),falseCandidates:rows.reduce((n,r)=>n+r[side].fp,0),missed:rows.reduce((n,r)=>n+r[side].fn,0),rawFalseUsableHr:rows.filter(r=>r[side].hr.status==='usable'&&r[side].hr.exceedsReviewLimit).length}]));
const report={schemaVersion:1,status:failures.length?'fail':'pass',clinicalValidation:false,role:'Exposed source-change characterization and product-domain gate; not historical morphology non-regression or prospective validation',summary,
 acquisitionScopeSha256:hash(readFileSync('src/engine/acquisition-measurement.ts')),rawAdverse:rows.filter(r=>Object.values(r.rawAdverse).some(Boolean)),failures,rows,
 limitations:['Secondary ST/T intentionally changes WPW samples; the old source is not clinical truth.','Monitor measurements remain review and aggressive-filter measurements remain unavailable under the unchanged published worker policy.','Global interval confidence does not guarantee individual beat boundaries. Every raw error and promotion remains reported.','135 ms is the fixed synthetic source duration in this supplement, never supplied to the analyzer.']};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:rows.length,rawAdverse:report.rawAdverse.map(r=>({id:r.id,...r.rawAdverse}))}));
if(failures.length)process.exitCode=1;
