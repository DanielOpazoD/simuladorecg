import {test} from 'node:test';import assert from 'node:assert/strict';
import {summarizeReserved} from '../scripts/lib/t-end-reserved-summary.mjs';
const criteria={minimumHighAgreementRecords:10,maximumMaeMs:10,maximumP95AbsMs:30,maximumAbsErrorMs:50};
const row=(errorMs,stratum='high-agreement')=>({errorMs,stratum});
test('empty results cannot pass and retain missing reference denominator',()=>{
 const r=summarizeReserved([{referenceEligible:8,rows:[]}],criteria);
 assert.equal(r.outcome,'insufficient-records');assert.equal(r.highAgreement.maeMs,null);assert.equal(r.highAgreementCoverage,0);assert.equal(r.bootstrapMae95.lowerMs,null);
});
test('many correlated beats cannot replace record coverage',()=>{
 const r=summarizeReserved([{referenceEligible:100,rows:Array.from({length:100},()=>row(1))}],criteria);
 assert.equal(r.outcome,'insufficient-records');assert.equal(r.highAgreementRecords,1);
});
test('preserves lower agreement, failures and missing endpoints',()=>{
 const records=Array.from({length:10},()=>({referenceEligible:4,rows:[row(4),row(80,'review')]}));records[0].rows[0]=row(60);
 const r=summarizeReserved(records,criteria);assert.equal(r.outcome,'engineering-criteria-not-met');assert.equal(r.highAgreement.maxAbsMs,60);
 assert.equal(r.highAgreementCoverage,.25);assert.equal(r.allProposalCoverage,.5);assert.equal(r.review.n,10);assert.equal(r.extremeErrors50ms.all,11);
 assert.deepEqual(r.bootstrapMae95,summarizeReserved(records,criteria).bootstrapMae95);
});
test('equal-record average does not overweight many-beat recordings',()=>{
 const r=summarizeReserved([{referenceEligible:1,rows:[row(20)]},{referenceEligible:9,rows:Array.from({length:9},()=>row(0))}],criteria);
 assert.equal(r.highAgreement.maeMs,2);assert.equal(r.equalRecordHighAgreementMaeMs,10);
});
test('finite metrics and consistent denominators are mandatory',()=>{
 assert.throws(()=>summarizeReserved([{referenceEligible:1,rows:[row(NaN)]}],criteria));
 assert.throws(()=>summarizeReserved([{referenceEligible:0,rows:[row(1)]}],criteria));
});
