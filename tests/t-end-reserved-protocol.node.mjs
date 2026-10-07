import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const p=JSON.parse(readFileSync('docs/t-end-reserved-protocol.json'));
const historicalBytes=readFileSync('tests/reference/ludb-delineation/protocol.json'),h=JSON.parse(historicalBytes);
test('prospective cohort is the exact preselected disjoint reserve',()=>{
 assert.equal(hash(historicalBytes),p.historicalProtocolSha256);
 assert.deepEqual(p.cohort.records,h.holdout.records);assert.equal(p.cohort.records.length,40);
 const excluded=new Set([...h.previouslyObservedRecords,...h.calibration.records]);
 assert.ok(p.cohort.records.every(x=>!excluded.has(x)));
 const selected=Array.from({length:200},(_,i)=>i+1).filter(i=>!excluded.has(i)).sort((a,b)=>hash(p.cohort.seed+':'+a).localeCompare(hash(p.cohort.seed+':'+b))).slice(0,40).sort((a,b)=>a-b);
 assert.deepEqual(selected,p.cohort.records);assert.equal(h.holdoutEnabled,false);
});
test('evaluation preserves selected rule and retrospective error bounds',()=>{
 const old=JSON.parse(readFileSync('docs/t-end-confidence-protocol.json'));
 assert.deepEqual(p.highAgreement,old.highAgreement);
 const c=p.evaluation.transportCriteria;
 assert.equal(c.maximumMaeMs,old.acceptance.maximumCombinedMaeMs);
 assert.equal(c.maximumP95AbsMs,old.acceptance.maximumCombinedP95Ms);
 assert.equal(c.maximumAbsErrorMs,old.acceptance.maximumCombinedErrorMs);
 assert.equal(p.noTuningAfterExposure,true);assert.equal(p.clinicalValidation,false);assert.equal(p.automaticQtChanged,false);
});
test('all frozen reader, reference and numerical aid bytes are exact',()=>{
 for(const [file,sha] of Object.entries(p.files))assert.equal(hash(readFileSync(file)),sha,file);
});
