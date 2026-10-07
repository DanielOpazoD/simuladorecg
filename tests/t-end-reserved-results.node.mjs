import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {summarizeReserved} from '../scripts/lib/t-end-reserved-summary.mjs';
const bytes=readFileSync('docs/t-end-reserved-protocol.json'),p=JSON.parse(bytes),r=JSON.parse(readFileSync('docs/evidence/t-end-reserved-results.json'));
test('published adverse outcome is recomputable with every frozen record',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),r.protocolSha256);
 assert.deepEqual(r.records.map(x=>x.id),p.cohort.records);
 assert.deepEqual(summarizeReserved(r.records,p.evaluation.transportCriteria),r.summary);
 assert.equal(r.summary.outcome,'engineering-criteria-not-met');
 assert.equal(r.summary.checks.mae,true);assert.equal(r.summary.checks.p95,false);assert.equal(r.summary.checks.maximum,false);
 assert.equal(r.summary.referenceEligible,343);assert.equal(r.summary.highAgreement.n,41);
 assert.equal(r.summary.highAgreementRecords,21);assert.equal(r.summary.extremeErrors50ms.highAgreement,2);
 assert.ok(r.records.every(x=>x.automaticMeasurementsUnchanged));
 assert.equal(r.summary.automaticQtPromoted,false);assert.equal(r.summary.clinicalValidation,false);
});
test('first-use provenance precedes exposure and independently checks physical data',()=>{
 assert.ok(Date.parse(r.preregistrationPublishedUtc)<Date.parse(r.firstEvaluationCompletedUtc));
 assert.equal(r.readerCrosscheck.records,40);assert.equal(r.readerCrosscheck.physicalSamples,2400000);
 assert.equal(r.readerCrosscheck.annotationEvents,36005);assert.equal(r.readerCrosscheck.holdoutDownloaded,true);
 assert.match(r.fullReportSha256,/^[a-f0-9]{64}$/);assert.equal(r.productCommit,p.candidateCommit);
});
