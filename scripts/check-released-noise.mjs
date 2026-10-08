/** Current product is compared with the already published PR150 product, while
 * historical ST/QT migrations are reproduced separately from immutable sources. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {compareReports} from './lib/noise-regression.mjs';
import {reviewRepeatedTerminalTransition} from './lib/repeated-terminal-transition.mjs';
const [beforeFile,afterFile,output]=process.argv.slice(2);assert.ok(output);
const hash=x=>createHash('sha256').update(x).digest('hex');
const a=readFileSync(beforeFile),b=readFileSync(afterFile),before=JSON.parse(a),after=JSON.parse(b);
const policy=JSON.parse(readFileSync('benchmarks/noise-stress/acceptance.json'));
assert.equal(before.sourceCommit,'d208370f883b9f1d3a22c34db62d97daacb279c6','Wrong published predecessor');
assert.equal(before.noiseProtocolSha256,policy.noiseProtocolSha256);
assert.equal(hash(readFileSync('benchmarks/noise-stress/protocol.json')),policy.noiseProtocolSha256);
assert.deepEqual(before.protocol,JSON.parse(readFileSync('benchmarks/noise-stress/protocol.json')));
const provenance=JSON.parse(readFileSync(resolve(dirname(afterFile),'evaluation-provenance.json')));
for(const [file,sha] of Object.entries(provenance.evaluatedSources))assert.equal(hash(readFileSync(file)),sha,'Report source differs: '+file);
const strict=compareReports(before,after,policy.numericalTolerance);
mkdirSync(dirname(resolve(output)),{recursive:true});
let report={...strict,reportSha256:{before:hash(a),after:hash(b)}};
try{
 const review=reviewRepeatedTerminalTransition(before,after,strict);
 report={...report,strictStatus:strict.status,status:'pass',reviewedConfidenceConsequence:review};
}catch(error){report={...report,status:'fail',error:String(error.stack)};process.exitCode=1;}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,quality:undefined,failures:report.failures.length}));
