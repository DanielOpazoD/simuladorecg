/** Decide whether the old equality-only experiment applies; do not reinterpret a newer analyzer. */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {analyzerIdentity} from './lib/frozen-analyzer-identity.mjs';
const [frozenRoot,currentRoot,output,...extra]=process.argv.slice(2);
if(!output||extra.length)throw Error('Usage: check-ludb-frozen-baseline-identity.mjs FROZEN_ROOT CURRENT_ROOT OUTPUT');
const protocol=JSON.parse(readFileSync('benchmarks/ludb-baseline/protocol.json'));
const commit=root=>execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const baselineCommit=commit(frozenRoot),currentCommit=commit(currentRoot);
if(baselineCommit!==protocol.baselineCommit)throw Error('Wrong frozen checkout');
const result={...analyzerIdentity(protocol,frozenRoot,currentRoot),baselineCommit,currentCommit};
mkdirSync(path.dirname(path.resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`identical=${result.identicalAnalyzerFiles}\n`);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
 result.identicalAnalyzerFiles?'Current analyzer bytes match the historical manifest; equality evaluation follows.\n':
 'Historical reference only: current analyzer differs. No current-versus-historical measurement equality or clinical validation is claimed. See current-analyzer-identity.json and the active analyzer evaluation workflows.\n');
console.log(JSON.stringify(result));
