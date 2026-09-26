/** Known-cohort evaluation of a review aid. Never substitutes for the automatic analyzer. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadLudb,fourLeadWaveReference} from '../tests/reference/ludb/load-ludb.mjs';
import {predictions,assessWindow,errors} from './lib/ludb-frozen-baseline.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const arg=k=>{const i=process.argv.indexOf(k);assert.ok(i>=0&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'),k);return resolve(process.argv[i+1]);};
const out=arg('--output');mkdirSync(out,{recursive:true});
const protocolBytes=readFileSync('docs/t-end-area-protocol.json'),protocol=JSON.parse(protocolBytes);
const originalBytes=readFileSync('tests/reference/ludb-expansion/protocol.json'),original=JSON.parse(originalBytes);
const calibrationBytes=readFileSync('tests/reference/ludb-delineation/protocol.json'),calibration=JSON.parse(calibrationBytes);
assert.equal(calibration.holdoutEnabled,false);
const baseline=JSON.parse(readFileSync('benchmarks/ludb-baseline/protocol.json'));
const analyzerFiles=Object.keys(baseline.analyzerFiles).sort();
for(const f of analyzerFiles) assert.deepEqual(readFileSync(f),execFileSync('git',['show',protocol.baselineCommit+':'+f]),'Automatic analyzer changed: '+f);
const bundle=resolve(out,'review-aid.mjs');
await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis.ts';export {suggestTEnds,T_END_AREA_POLICY} from './src/engine/analysis/t-end-area.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:bundle});
const {analyzeSamples,suggestTEnds,T_END_AREA_POLICY}=await import(pathToFileURL(bundle));
const sampleHash=s=>hash(Buffer.concat(Object.values(s.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength))));
const all={};
for(const [name,root,ids,split,protocolHash] of [
 ['original40',arg('--original'),original.records,'expansion',hash(originalBytes)],
 ['calibration40',arg('--calibration'),calibration.calibration.records,'delineation-calibration',hash(calibrationBytes)]]){
 const manifestBytes=readFileSync(resolve(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.protocolSha256,protocolHash);
 assert.deepEqual(manifest.records.map(x=>Number(x.record)).sort((a,b)=>a-b),ids);
 assert.ok(manifest.records.every(x=>x.split===split));assert.ok(ids.every(id=>!calibration.holdout.records.includes(id)));
 const records=[];let proposed=0;
 for(const id of ids){
  const {signal,metadata}=loadLudb(root,split,id),sourceHash=sampleHash(signal);
  const m=analyzeSamples({fs:signal.fs,leads:signal.leads}),before=structuredClone(m);
  const aid=suggestTEnds(signal,m);proposed+=aid.filter(Boolean).length;
  assert.deepEqual(m,before);assert.equal(sampleHash(signal),sourceHash);
  const reference=fourLeadWaveReference(metadata,'T'),peaks=predictions(m,'T');
  const byPeak=new Map(aid.filter(Boolean).map(a=>[a.peak,a]));
  // Keep EVERY peak and the SAME matching. Only the separately evaluated offset column differs.
  const proposedWaves=peaks.map(b=>({...b,onset:null,offset:byPeak.get(b.peak)?.time??null}));
  const legacy=assessWindow(reference,peaks,m.window,.15),candidate=assessWindow(reference,proposedWaves,m.window,.15);
  assert.deepEqual(legacy.detection,candidate.detection);
  const pairs=legacy.errors.map((a,i)=>({referencePeak:a.referencePeak,detectedPeak:a.detectedPeak,
    legacyErrorMs:a.offsetMs,candidateErrorMs:candidate.errors[i].offsetMs}));
  records.push({id,physicalSamplesSha256:sourceHash,automaticQt:m.qt,automaticQtStatus:m.evidence.qt.status,
    proposals:aid,legacy,candidate,pairs});
 }
 const rows=records.flatMap(r=>r.pairs),present=r=>r.candidateErrorMs!==null;
 const common=rows.filter(r=>present(r)&&r.legacyErrorMs!==null),newlyAvailable=rows.filter(r=>present(r)&&r.legacyErrorMs===null);
 const eligible=records.reduce((n,r)=>n+r.candidate.endpoint.offset.referenceEligible,0);
 const measured=rows.filter(present);
 const summary={records:records.length,proposals:proposed,matchedEndpoints:measured.length,referenceEligible:eligible,
  coverage:eligible?measured.length/eligible:null,errors:errors(measured.map(r=>r.candidateErrorMs)),
  legacyErrors:errors(rows.flatMap(r=>r.legacyErrorMs===null?[]:[r.legacyErrorMs])),
  samePopulation:{n:common.length,legacy:errors(common.map(r=>r.legacyErrorMs)),candidate:errors(common.map(r=>r.candidateErrorMs))},
  newlyAvailable:{n:newlyAvailable.length,errors:errors(newlyAvailable.map(r=>r.candidateErrorMs))},
  proposalsWithoutMatchedEndpoint:proposed-measured.length,
  missedByAidButLegacyAvailable:rows.filter(r=>r.candidateErrorMs===null&&r.legacyErrorMs!==null).length,
  automaticMeasurementsUnchanged:true};
 const report={schemaVersion:1,cohort:name,cohortRole:'Already observed development/regression data; not an untouched holdout',
  fixtureManifestSha256:hash(manifestBytes),summary,records};
 writeFileSync(resolve(out,name+'.json'),JSON.stringify(report,null,2)+'\n');all[name]=summary;
 // Engineering smoke gates selected on observed development data. NOT clinical performance targets.
 assert.ok(summary.matchedEndpoints>=protocol.engineeringAcceptance.minimumMatchedEndpoints,name+' coverage');
 assert.ok(summary.errors.maeMs<=protocol.engineeringAcceptance.maximumMaeMs,name+' MAE');
 assert.ok(summary.errors.p95AbsMs<=protocol.engineeringAcceptance.maximumP95Ms,name+' p95');
 assert.ok(summary.errors.maxAbsMs<=protocol.engineeringAcceptance.maximumErrorMs,name+' maximum');
}
const result={schemaVersion:1,productCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 baselineCommit:protocol.baselineCommit,protocolSha256:hash(protocolBytes),policy:T_END_AREA_POLICY,
 algorithmSha256:hash(readFileSync('src/engine/analysis/t-end-area.ts')),cohorts:all,
 automaticQtChanged:false,holdoutEvaluated:false,clinicalValidation:false,
 limitations:protocol.limitations};
writeFileSync(resolve(out,'summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
