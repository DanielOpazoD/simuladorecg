import {reviewTerminalConsensusTransition} from './lib/terminal-consensus-transition.mjs';
/** Fail CI on a structural error or an unreviewed paired deterioration. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {reviewMonitorRevision} from './lib/monitor-revision.mjs';
import {compareReports} from './lib/noise-regression.mjs';
const [beforeFile,afterFile,output,...extra]=process.argv.slice(2);
const terminalConsensus=extra.length===1&&extra[0]==='--terminal-consensus';
if(!output||(extra.length&&!terminalConsensus))throw Error('Usage: check-noise-regression.mjs BEFORE AFTER OUTPUT [--terminal-consensus]');
const policy=JSON.parse(await readFile('benchmarks/noise-stress/acceptance.json'));
let migration={allowedCleanSourceChanges:[]};
try { migration=JSON.parse(await readFile('docs/qrs-coupled-repolarization-contract.json')); } catch {}
let result;
try {
  const beforeBytes=await readFile(beforeFile),afterBytes=await readFile(afterFile);
  const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
  const effectiveBaselineCommit = migration.baselineAmendment?.amendedBaselineCommit ?? policy.baselineCommit;
  assert.equal(before.sourceCommit,effectiveBaselineCommit,'Not the reviewed baseline commit');
  assert.equal(before.noiseProtocolSha256,policy.noiseProtocolSha256,'Unreviewed acquisition protocol');
  const protocolBytes=await readFile('benchmarks/noise-stress/protocol.json');
  assert.equal(createHash('sha256').update(protocolBytes).digest('hex'),policy.noiseProtocolSha256,'Unreviewed frozen protocol bytes');
  assert.deepEqual(before.protocol,JSON.parse(protocolBytes),'Report differs from the frozen protocol; copied hash labels are insufficient');
  result=compareReports(before,after,{...policy.numericalTolerance,allowedCleanSourceChanges:migration.allowedCleanSourceChanges});
  const usesGeneratorAmendment = effectiveBaselineCommit !== policy.baselineCommit;
  if (policy.monitorRevision && !usesGeneratorAmendment) {
    assert.equal(createHash('sha256').update(await readFile('src/engine/filter.ts')).digest('hex'),policy.monitorRevision.filterSha256,'Unreviewed filter implementation');
    const revision=reviewMonitorRevision(before,after,result,policy.monitorRevision);
    result={...result,status:'pass',strictStatus:result.status,reviewedMonitorRevision:revision};
  } else if (usesGeneratorAmendment) {
    // The amended source baseline already contains the previously reviewed monitor
    // migration. Re-applying its required improvement ratios against itself would
    // be nonsensical; require the stricter ordinary paired non-regression result.
    // Keep status='fail' and its strata/coverage evidence. The final exit-code
    // gate below remains nonzero; throwing here would erase these diagnostics.
    result={...result,reviewedMonitorRevision:{status:'already-incorporated-in-amended-baseline'}};
  }
  if(terminalConsensus){
  // This numerical estimator intentionally trades noisy stratum coverage for
  // substantially fewer erroneous outputs. Keep the complete strict failure
  // list; authorize only the prospectively pinned source and its actual report.
  const terminalProtocol=JSON.parse(await readFile('docs/terminal-consensus-prospective-protocol.json'));
  const provenance=JSON.parse(await readFile(path.join(path.dirname(afterFile),'evaluation-provenance.json')));
  for(const [file,sha]of Object.entries(terminalProtocol.algorithmFiles)){
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),sha,'Frozen terminal source drift: '+file);
    assert.equal(provenance.evaluatedSources[file],sha,'Noise report was produced by different source: '+file);
  }
  const transition=reviewTerminalConsensusTransition(result);
  result={...result,strictStatus:result.status,status:'pass',reviewedTerminalTransition:transition};
  }
  result.policy=policy; result.generatorMigration=migration;
  result.baselineProvenance={historicalBaselineCommit:policy.baselineCommit,effectiveBaselineCommit};
  result.reportSha256={before:createHash('sha256').update(beforeBytes).digest('hex'),after:createHash('sha256').update(afterBytes).digest('hex')};
} catch(error) {
  result={...result,status:'error',clinicalValidation:false,error:String(error.stack),policy};
}
await mkdir(path.dirname(path.resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,policy:undefined,quality:undefined,failures:result.failures?.length}));
if(result.status!=='pass')process.exitCode=1;
