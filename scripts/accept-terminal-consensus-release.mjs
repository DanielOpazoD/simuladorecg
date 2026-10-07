/** Release decision is separate from, and never rewrites, the failed frozen test. */
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{pathToFileURL}from'node:url';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function reviewApprovedTerminalRelease(report,decision){
 assert.equal(decision.approved,true,'Explicit maintainer decision required');
 assert.equal(decision.repository,'DanielOpazoD/simuladorecg');assert.equal(decision.pullRequest,150);
 assert.deepEqual(report.outcome,{paired:false,coverage:true,qt:true,usable:true,terminal:true},'Exception covers only the observed paired criterion');
 assert.equal(hash(JSON.stringify(report.summary)),decision.approvedSummarySha256,'Different outcome from the approved evidence');
 assert.equal(hash(JSON.stringify(report.comparison)),decision.approvedComparisonSha256,'Different paired tradeoff from the approved evidence');
 return{status:'accepted-with-documented-exception',frozenAcceptance:'failed',exception:'paired',clinicalValidation:false,
  decisionDate:decision.decisionDate,scope:decision.scope,approvedSummarySha256:decision.approvedSummarySha256,approvedComparisonSha256:decision.approvedComparisonSha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const[reportFile,output,...extra]=process.argv.slice(2);assert.ok(output&&!extra.length,'Provide report and decision-output paths');
 const report=JSON.parse(readFileSync(reportFile)),decision=JSON.parse(readFileSync('docs/terminal-consensus-release-decision.json'));
 const protocolBytes=readFileSync('docs/terminal-consensus-prospective-protocol.json'),protocol=JSON.parse(protocolBytes);
 assert.equal(hash(protocolBytes),decision.protocolSha256,'Changed frozen protocol');
 assert.equal(hash(readFileSync('docs/terminal-consensus-evaluator-addendum.json')),decision.evaluatorAddendumSha256,'Changed evaluator repair');
 for(const[file,sha]of Object.entries(protocol.algorithmFiles)){
  assert.equal(hash(readFileSync(file)),sha,'Changed algorithm: '+file);
  assert.equal(report.sources.after[file],sha,'Report came from a different algorithm: '+file);
 }
 assert.equal(report.baselineCommit,protocol.baselineCommit,'Changed comparison baseline');
 assert.deepEqual(report.records.map(r=>r.id).sort((a,b)=>a-b),protocol.cohort.records,'Changed reserved population');
 const result=reviewApprovedTerminalRelease(report,decision);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
