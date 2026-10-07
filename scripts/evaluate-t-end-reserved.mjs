/** Frozen prospective evaluation. Adverse outcomes are data, not retuning triggers. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {loadLudb,fourLeadWaveReference} from '../tests/reference/ludb/load-ludb.mjs';
import {predictions,assessWindow,errors,assessRecord,poolRecords} from './lib/ludb-frozen-baseline.mjs';
import {summarizeReserved} from './lib/t-end-reserved-summary.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const arg=k=>{const i=process.argv.indexOf(k);assert.ok(i>=0&&process.argv[i+1],k);return resolve(process.argv[i+1])};
const root=arg('--fixtures'),out=arg('--output');mkdirSync(out,{recursive:true});
const bytes=readFileSync('docs/t-end-reserved-protocol.json'),protocol=JSON.parse(bytes);
assert.equal(hash(readFileSync('tests/reference/ludb-delineation/protocol.json')),protocol.historicalProtocolSha256);
for(const [file,sha] of Object.entries(protocol.files))assert.equal(hash(readFileSync(file)),sha,'Frozen evaluation source drift: '+file);
assert.equal(execFileSync('git',['diff',protocol.candidateCommit,'--','src'],{encoding:'utf8'}),'','Frozen product source drift');
const manifestBytes=readFileSync(resolve(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.protocolSha256,hash(bytes));
assert.deepEqual(manifest.records.map(r=>+r.record).sort((a,b)=>a-b),protocol.cohort.records);
assert.ok(manifest.records.every(r=>r.split==='reserved-tend-v1'));
assert.ok(protocol.cohort.records.every(id=>!protocol.excludedRecords.includes(id)));
const bundle=resolve(out,'candidate.mjs');
const built=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';export {suggestTEnds} from './src/engine/t-end-area';export {classifyTEndReviewCandidate,T_END_CONFIDENCE_POLICY} from './src/engine/t-end-confidence';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:bundle});
assert.ok(!Object.keys(built.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Forbidden model input');
const {analyzeSamples,suggestTEnds,classifyTEndReviewCandidate,T_END_CONFIDENCE_POLICY:policy}=await import(pathToFileURL(bundle));
assert.equal(policy.highMaximumSpreadMs,protocol.highAgreement.maximumSpreadMs);
assert.equal(policy.highMaximumAreaAmplitudeRatio,protocol.highAgreement.maximumAreaAmplitudeRatio);
const records=[];const sampleHash=s=>hash(Buffer.concat(Object.values(s.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength))));
for(const id of protocol.cohort.records){
 const {signal,metadata}=loadLudb(root,'reserved-tend-v1',id),physicalSamplesSha256=sampleHash(signal);
 const input={fs:signal.fs,leads:signal.leads},m=analyzeSamples(input),before=structuredClone(m),aid=suggestTEnds(input,m);
 assert.deepEqual(m,before);assert.equal(sampleHash(signal),physicalSamplesSha256);
 const references=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
 const automatic=assessRecord(input,references,()=>m,{eventMatchToleranceSeconds:protocol.eventMatchToleranceSeconds,intervalAssociation:protocol.intervalAssociation});
 const reference=references.T,peaks=predictions(m,'T'),byPeak=new Map(aid.filter(Boolean).map(a=>[a.peak,a]));
 const proposed=peaks.map(p=>({...p,onset:null,offset:byPeak.get(p.peak)?.time??null}));
 const legacy=assessWindow(reference,peaks,m.window,protocol.eventMatchToleranceSeconds),candidate=assessWindow(reference,proposed,m.window,protocol.eventMatchToleranceSeconds);
 assert.deepEqual(candidate.detection,legacy.detection);
 const rows=candidate.errors.flatMap(pair=>{
  if(pair.offsetMs===null)return [];
  const proposal=byPeak.get(pair.detectedPeak);assert.ok(proposal,'Matched offset without proposal');
  return [{referencePeak:pair.referencePeak,detectedPeak:pair.detectedPeak,errorMs:pair.offsetMs,...classifyTEndReviewCandidate(proposal)}];
 });
 const qtReviewRows=[];
 for(const pair of automatic.waves.QRS.detection.pairs){
  const r=automatic.referenceIntervals.rows.find(r=>r.qrsPeak===pair.reference),b=m.beats.find(b=>b.peak===pair.detected);
  const proposal=b?byPeak.get(b.tPeak):null;
  if(!r||r.qt===null||!b||!proposal||r.tPeak===null||b.tPeak===null||Math.abs(r.tPeak-b.tPeak)>protocol.eventMatchToleranceSeconds)continue;
  const value=(proposal.time-b.onset)*1000;
  qtReviewRows.push({referenceQrsPeak:r.qrsPeak,detectedQrsPeak:b.peak,proposedQtMs:value,referenceQtMs:r.qt,errorMs:value-r.qt,...classifyTEndReviewCandidate(proposal)});
 }

 records.push({id,physicalSamplesSha256,referenceEligible:candidate.endpoint.offset.referenceEligible,
  rows,proposals:aid,proposalsWithoutMatchedEndpoint:aid.filter(Boolean).length-rows.length,
  automaticQt:m.qt,automaticQtStatus:m.evidence.qt.status,automaticMeasurementsUnchanged:true,
  candidate,legacy,automaticDelineation:automatic,qtReviewRows,recordErrors:errors(rows.map(r=>r.errorMs))});
}
const report={schemaVersion:1,cohortRole:'First prospective use of previously reserved LUDB records; exposed after this evaluation, not independent external validation',
 productCommit:protocol.candidateCommit,evaluatorCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 protocolSha256:hash(bytes),fixtureManifestSha256:hash(manifestBytes),
 sourceHashes:Object.fromEntries(Object.keys(built.metafile.inputs).filter(f=>f!=='<stdin>').map(f=>[f,hash(readFileSync(f))])),
 summary:summarizeReserved(records,protocol.evaluation.transportCriteria),
 automaticDelineationSummary:poolRecords(records.map(r=>r.automaticDelineation)),
 hypotheticalReviewQt:{role:'Evaluation only: detected QRS onset plus proposed T end; never written to product measurements',
 all:errors(records.flatMap(r=>r.qtReviewRows.map(x=>x.errorMs))),
 highAgreement:errors(records.flatMap(r=>r.qtReviewRows.filter(x=>x.stratum==='high-agreement').map(x=>x.errorMs))),
 referenceEligible:records.reduce((n,r)=>n+r.automaticDelineation.pairedIntervals.qt.referenceEligible,0)},
 records,limitations:protocol.limitations};
writeFileSync(resolve(out,'reserved-tend-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
