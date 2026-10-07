/** Evaluation-only statistics. Missing endpoints stay in denominators. */
import assert from 'node:assert/strict';
import {errors} from './ludb-frozen-baseline.mjs';
export function summarizeReserved(records,criteria){
 const matched=records.flatMap(r=>r.rows),high=matched.filter(r=>r.stratum==='high-agreement');
 const review=matched.filter(r=>r.stratum==='review');
 const eligible=records.reduce((n,r)=>n+r.referenceEligible,0);
 const contributions=records.map(r=>r.rows.filter(x=>x.stratum==='high-agreement').map(x=>x.errorMs));
 const contributing=contributions.filter(r=>r.length);
 const highErrors=errors(high.map(r=>r.errorMs));
 const enough=contributing.length>=criteria.minimumHighAgreementRecords;
 const checks={mae:highErrors.maeMs!==null&&highErrors.maeMs<=criteria.maximumMaeMs,
  p95:highErrors.p95AbsMs!==null&&highErrors.p95AbsMs<=criteria.maximumP95AbsMs,
  maximum:highErrors.maxAbsMs!==null&&highErrors.maxAbsMs<=criteria.maximumAbsErrorMs};
 let seed=20261007;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const draws=[];
 if(contributing.length)for(let n=0;n<2000;n++){
  const values=[];for(let i=0;i<records.length;i++)values.push(...contributions[Math.floor(random()*records.length)]);
  if(values.length)draws.push(values.reduce((s,x)=>s+Math.abs(x),0)/values.length);
 }
 draws.sort((a,b)=>a-b);const percentile=q=>draws.length?draws[Math.max(0,Math.ceil(q*draws.length)-1)]:null;
 assert.ok(high.length<=matched.length&&matched.length<=eligible,'Invalid endpoint coverage');
 return {records:records.length,referenceEligible:eligible,matchedEndpoints:matched.length,
  all:errors(matched.map(r=>r.errorMs)),highAgreement:highErrors,review:errors(review.map(r=>r.errorMs)),
  highAgreementRecords:contributing.length,highAgreementCoverage:eligible?high.length/eligible:null,
  allProposalCoverage:eligible?matched.length/eligible:null,
  retainedAmongMatched:matched.length?high.length/matched.length:null,
  equalRecordHighAgreementMaeMs:contributing.length?contributing.reduce((s,r)=>s+r.reduce((a,x)=>a+Math.abs(x),0)/r.length,0)/contributing.length:null,
  extremeErrors50ms:{all:matched.filter(r=>Math.abs(r.errorMs)>=50).length,highAgreement:high.filter(r=>Math.abs(r.errorMs)>=50).length},
  bootstrapMae95:{unit:'record',seed:20261007,draws:2000,nonemptyDraws:draws.length,lowerMs:percentile(.025),upperMs:percentile(.975)},
  criteria,checks,outcome:!enough?'insufficient-records':Object.values(checks).every(Boolean)?'engineering-criteria-met':'engineering-criteria-not-met',
  clinicalValidation:false,automaticQtPromoted:false};
}
