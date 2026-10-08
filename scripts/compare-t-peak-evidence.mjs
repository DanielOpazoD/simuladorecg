import {COMPLETE_COMPLEX_REVISION,preCompleteComplexPlugin,assertCompleteComplexMeasurements} from './lib/complete-complex-revision.mjs';
import {QRS_T_REVISION,assertReviewedQrsTFile,assertQrsTRefinement,preQrsTNumericsPlugin} from './lib/qrs-t-revision.mjs';
import {restoreHistoricalRateScreen,assertReviewedSampleEntry,assertReviewedAlternatingConfidence,assertReviewedImpulseConfidence,assertReviewedSampleDependencies} from './lib/sample-entry-contract.mjs';
/** Paired evidence-only revision: fixed, already observed LUDB cohorts; no holdout. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadLudb,fourLeadWaveReference} from '../tests/reference/ludb/load-ludb.mjs';
import {assessRecord,poolRecords} from './lib/ludb-frozen-baseline.mjs';
import {T_PEAK_REVISION,assertReviewedMeasure,assertPeakOnlyChange} from './lib/t-peak-revision.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function arg(k){const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error(k+' requires a value');return resolve(process.argv[i+1]);}
const base=arg('--baseline'),out=arg('--output'),candidate=process.cwd();mkdirSync(out,{recursive:true});
const git=(root,...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}).trim();
assert.equal(git(base,'rev-parse','HEAD'),T_PEAK_REVISION.baselineCommit);
assert.equal(git(candidate,'status','--porcelain','--untracked-files=no'),'','Dirty candidate source');
const p=JSON.parse(readFileSync('benchmarks/ludb-baseline/protocol.json'));
const originalBytes=readFileSync(p.cohortProtocol),original=JSON.parse(originalBytes);
const reservedBytes=readFileSync('tests/reference/ludb-delineation/protocol.json'),reserved=JSON.parse(reservedBytes);
assert.equal(hash(originalBytes),p.cohortProtocolSha256);assert.equal(reserved.holdoutEnabled,false);
const analyzedFiles=Object.keys(p.analyzerFiles).sort();
for(const file of analyzedFiles){
 const a=readFileSync(resolve(base,file)),b=readFileSync(file);
 assert.equal(hash(a),p.analyzerFiles[file],file+' baseline changed');
 if(file==='src/engine/measure.ts')assertReviewedMeasure(a,b);
 else if(QRS_T_REVISION.files[file]){assert.equal(hash(a),QRS_T_REVISION.files[file].before);assertReviewedQrsTFile(file,b);}
 else if(file==='src/engine/sample-analysis.ts')assertReviewedSampleEntry(b,a);
 else assert.deepEqual(b,a,file+' changed');
}
// The evaluator is the version integrated with PR28, never an algorithm-specific reference.
const evaluationFiles=['scripts/lib/ludb-frozen-baseline.mjs','scripts/lib/external-delineation-evaluation.mjs',
 'scripts/lib/external-qrs-evaluation.mjs','tests/reference/ludb/load-ludb.mjs','benchmarks/ludb-baseline/protocol.json'];
for(const f of evaluationFiles)assert.deepEqual(readFileSync(f),execFileSync('git',['show','2f8247a859badf3f66c307258904ac7c099c38fb:'+f]));
assertReviewedImpulseConfidence(readFileSync('src/engine/analysis/impulse-confidence.ts'));
assertReviewedAlternatingConfidence(readFileSync('src/engine/analysis/alternating-confidence.ts'));
const analyzers=[];
for(const [i,root] of [base,candidate].entries()){
 const bundle=resolve(out,'analyzer-'+i+'.mjs');
 const r=await build({absWorkingDir:root,entryPoints:[p.analysisEntry],bundle:true,platform:'node',format:'esm',metafile:true,outfile:bundle,plugins:i===1?[{name:'restore-frozen-rate-screen',setup(b){b.onLoad({filter:/\/sample-analysis\.ts$/},args=>({contents:restoreHistoricalRateScreen(readFileSync(args.path,'utf8')),loader:'ts'}));}},preQrsTNumericsPlugin(candidate)]:[]});
 assertReviewedSampleDependencies(Object.keys(r.metafile.inputs),analyzedFiles,i===1);
 analyzers.push((await import(pathToFileURL(bundle))).analyzeSamples);
}
const actualBundle=resolve(out,'actual-revised-analyzer.mjs');
await build({entryPoints:[p.analysisEntry],bundle:true,platform:'node',format:'esm',outfile:actualBundle});
const actualAnalyzer=(await import(pathToFileURL(actualBundle))).analyzeSamples;
const releasedBundle=resolve(out,'pre-complete-complex.mjs');
await build({entryPoints:[resolve(candidate,'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',outfile:releasedBundle,plugins:[preCompleteComplexPlugin(candidate)]});
const releasedAnalyzer=(await import(pathToFileURL(releasedBundle))).analyzeSamples;
const completeComplexEvidence=[];

const revisedCohorts={};
const sampleHash=s=>hash(Buffer.concat(Object.keys(s.leads).sort().map(k=>Buffer.from(s.leads[k].buffer,s.leads[k].byteOffset,s.leads[k].byteLength))));
const cohorts={};
for(const [name,fixture,ids,split,protocolHash] of [
 ['original40',arg('--original'),original.records,'expansion',hash(originalBytes)],
 ['calibration40',arg('--calibration'),reserved.calibration.records,'delineation-calibration',hash(reservedBytes)]]){
 const manifestBytes=readFileSync(resolve(fixture,'manifest.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.protocolSha256,protocolHash);
 assert.deepEqual(manifest.records.map(r=>Number(r.record)).sort((a,b)=>a-b),ids);
 assert.ok(manifest.records.every(r=>r.split===split));
 assert.ok(ids.every(id=>!reserved.holdout.records.includes(id)));
 if(name==='calibration40')assert.equal(manifest.reservedHoldoutDownloaded,false);
 let added=0;const arms=[[],[]],revised=[];
 for(const id of ids){
  const {signal,metadata}=loadLudb(fixture,split,id),samples=sampleHash(signal);
  const references=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
  const measurements=[];
  for(let i=0;i<2;i++){
   const m=analyzers[i]({fs:signal.fs,leads:signal.leads});measurements.push(m);
   assert.equal(sampleHash(signal),samples,'Input samples mutated: '+id);
   arms[i].push({id,physicalSamplesSha256:samples,measurement:m,...assessRecord(signal,references,()=>m,p)});
  }
  added+=assertPeakOnlyChange(measurements[0],measurements[1]);
  const actual=actualAnalyzer({fs:signal.fs,leads:signal.leads});
  assertQrsTRefinement(measurements[1],releasedAnalyzer({fs:signal.fs,leads:signal.leads}),{terminalReplacement:true});
  const evaluated=assessRecord(signal,references,()=>actual,p);
  revised.push({id,physicalSamplesSha256:samples,measurement:actual,...evaluated});
 }
 const summaries=arms.map(poolRecords);
 const revisedSummary=poolRecords(revised);
 assert.ok(revisedSummary.waves.QRS.fn<=summaries[1].waves.QRS.fn,'New missed annotated QRS');
 assert.ok(revisedSummary.waves.QRS.fp<=summaries[1].waves.QRS.fp,'New false annotated QRS');
 revisedCohorts[name]={before:summaries[1],after:revisedSummary};
 writeFileSync(resolve(out,name+'-numerical-revision.json'),JSON.stringify({records:revised,summary:revisedSummary},null,2)+'\n');
 // Paired peak assignment may affect wave denominators; numeric outputs themselves must remain exact.
 assert.deepEqual(summaries[0].intervals,summaries[1].intervals,'Interval results changed');
 for(const w of ['P','QRS'])assert.deepEqual(summaries[0].waves[w],summaries[1].waves[w]);
 cohorts[name]={records:ids.length,addedTPeakCandidates:added,fixtureManifestSha256:hash(manifestBytes),
  sameNumericMeasurementsAndQuality:true,baseline:summaries[0],candidate:summaries[1]};
 for(let i=0;i<2;i++)writeFileSync(resolve(out,name+'-'+(i?'candidate':'baseline')+'.json'),JSON.stringify({records:arms[i],summary:summaries[i]},null,2)+'\n');
}
// Same physical generator output for both analyzers: no truth enters either analyzer.
const presetBundle=resolve(out,'presets.mjs');
await build({stdin:{contents:"export {synthesize} from './src/engine/signal.ts'; export {fromPreset,PRESETS} from './src/presets/catalog.ts';",resolveDir:candidate},bundle:true,platform:'node',format:'esm',outfile:presetBundle});
const {synthesize,fromPreset,PRESETS}=await import(pathToFileURL(presetBundle));
let scenarios=0,presetAdded=0;
for(const preset of PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive']){
 const c=fromPreset(preset);c.filter=filter;const signal=synthesize(c,10),before=sampleHash(signal);
 const historical=analyzers.map(f=>f({fs:signal.fs,leads:signal.leads}));
 presetAdded+=assertPeakOnlyChange(...historical);
 const released=releasedAnalyzer({fs:signal.fs,leads:signal.leads});
 assertQrsTRefinement(historical[1],released,{terminalReplacement:true});
 completeComplexEvidence.push(assertCompleteComplexMeasurements(released,actualAnalyzer({fs:signal.fs,leads:signal.leads}),signal.events.beats));
 assert.equal(sampleHash(signal),before);scenarios++;
}
const report={schemaVersion:2,completeComplexRevision:COMPLETE_COMPLEX_REVISION,completeComplexEvidence,baselineCommit:T_PEAK_REVISION.baselineCommit,candidateCommit:git(candidate,'rev-parse','HEAD'),
 historicalEvidenceOnlyAmendment:T_PEAK_REVISION,numericalRevision:QRS_T_REVISION,revisedCohorts,analyzerFiles:Object.fromEntries(analyzedFiles.map(f=>[f,hash(readFileSync(f))])),
 evaluationFiles:Object.fromEntries(evaluationFiles.map(f=>[f,hash(readFileSync(f))])),cohorts,
 presets:{count:PRESETS.filter(p=>p.strategy!=='pending').length,scenarios,addedTPeakCandidates:presetAdded,sameNumericMeasurementsAndQuality:true},
 holdoutEvaluated:false,clinicalValidation:false,scope:'Historical evidence-only assertions use exact pre-QRS/T primitives; revisedCohorts describe the actual current analyzer. Additional peaks are candidates, not accepted T endpoints or QT. False positives and tail errors remain visible. Both cohorts are already observed development/regression data.'};
writeFileSync(resolve(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
