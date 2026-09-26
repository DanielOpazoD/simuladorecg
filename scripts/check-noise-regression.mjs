/** Fail CI on a structural error or an unreviewed paired deterioration. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {reviewMonitorRevision} from './lib/monitor-revision.mjs';
import {compareReports} from './lib/noise-regression.mjs';
const [beforeFile,afterFile,output,...extra]=process.argv.slice(2);
if(!output||extra.length)throw Error('Usage: check-noise-regression.mjs BEFORE AFTER OUTPUT');
const policy=JSON.parse(await readFile('benchmarks/noise-stress/acceptance.json'));
let result;
try {
  const beforeBytes=await readFile(beforeFile),afterBytes=await readFile(afterFile);
  const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
  assert.equal(before.sourceCommit,policy.baselineCommit,'Not the reviewed baseline commit');
  assert.equal(before.noiseProtocolSha256,policy.noiseProtocolSha256,'Unreviewed acquisition protocol');
  result=compareReports(before,after,policy.numericalTolerance);
  if (policy.monitorRevision) {
    assert.equal(createHash('sha256').update(await readFile('src/engine/filter.ts')).digest('hex'),policy.monitorRevision.filterSha256,'Unreviewed filter implementation');
    const revision=reviewMonitorRevision(before,after,result,policy.monitorRevision);
    result={...result,status:'pass',strictStatus:result.status,reviewedMonitorRevision:revision};
  }
  result.policy=policy;
  result.reportSha256={before:createHash('sha256').update(beforeBytes).digest('hex'),after:createHash('sha256').update(afterBytes).digest('hex')};
} catch(error) {
  result={status:'error',clinicalValidation:false,error:String(error.stack),policy};
}
await mkdir(path.dirname(path.resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,policy:undefined,quality:undefined,failures:result.failures?.length}));
if(result.status!=='pass')process.exitCode=1;
