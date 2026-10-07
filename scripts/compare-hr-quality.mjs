import {qrsMidpointSeconds} from './lib/qrs-event-reference.mjs';
import {QRS_T_REVISION,assertReviewedQrsTFile,assertQrsTRefinement,summarizeRateRevision,preQrsTNumericsPlugin} from './lib/qrs-t-revision.mjs';
import {assertReviewedAlternatingConfidence,assertReviewedImpulseConfidence,assertReviewedSampleEntry} from './lib/sample-entry-contract.mjs';
/** Paired quality assessment. Evaluator has references; analyzeSamples does not. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {assertReviewedMeasure,assertPeakOnlyBeats} from './lib/t-peak-revision.mjs';
const [base, noiseDir, output] = process.argv.slice(2);
if (!base || !noiseDir || !output) throw new Error('Usage: node scripts/compare-hr-quality.mjs BASELINE_DIR NOISE_DIR OUTPUT');
const hash = b => createHash('sha256').update(b).digest('hex');
const policy = JSON.parse(await readFile('benchmarks/hr-quality/protocol.json'));
const source = JSON.parse(await readFile(path.join(noiseDir, 'noise-segments.json')));
const p = JSON.parse(await readFile(path.join(base, 'benchmarks/noise-stress/protocol.json')));
const starts = [...new Set(source.segments.map(s => s.startSeconds))];
const role = JSON.stringify(starts) === JSON.stringify(policy.developmentStartsSeconds) ? 'exposed-development' : 'fixed-temporal-replication';
assert.deepEqual(starts, role === 'exposed-development' ? policy.developmentStartsSeconds : policy.replicationStartsSeconds);
assert.deepEqual(source.segments.map(s => `${s.record}:${s.startSeconds}`), p.records.flatMap(r => starts.map(t => `${r}:${t}`)));
const temp = await mkdtemp(path.join(tmpdir(), 'hr-quality-'));
try {
  await build({stdin:{contents:`export {synthesize} from './src/engine/signal'; export {measure} from './src/engine/measure'; export {PRESETS,fromPreset,presetById} from './src/presets/catalog'; export * from './scripts/lib/noise-stress';`,resolveDir:path.resolve(base)}, bundle:true, platform:'node', format:'esm', outfile:path.join(temp,'before.mjs')});
  const next = await build({entryPoints:['src/engine/sample-analysis.ts'], bundle:true, platform:'node', format:'esm', metafile:true, outfile:path.join(temp,'after.mjs')});
  assert.ok(!Object.keys(next.metafile.inputs).some(p => /\/(signal|rhythm|reference|model-audit)\.ts$/.test(p)), 'Synthetic reference leaked into sample analysis');
  const B = await import(pathToFileURL(path.join(temp,'before.mjs')));
  const C = await import(pathToFileURL(path.join(temp,'after.mjs')));
  // Preserve every historical quality-only assertion on exact pre-revision
  // primitives; evaluate actual revised numerical results separately below.
  await build({entryPoints:['src/engine/sample-analysis.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'pre-revision.mjs'),
    plugins:[preQrsTNumericsPlugin(process.cwd())]});
  const A = await import(pathToFileURL(path.join(temp,'pre-revision.mjs')));
  assert.deepEqual(A.HR_QUALITY_POLICY, policy.qualityPolicy, 'Policy changed after replication protocol');
  assertReviewedSampleEntry(await readFile('src/engine/sample-analysis.ts'));
  for (const file of Object.keys(next.metafile.inputs).filter(f => !f.endsWith('/sample-analysis.ts') && !f.endsWith('/measurement-support.ts'))) {
    if(file==='src/engine/analysis/alternating-confidence.ts') assertReviewedAlternatingConfidence(await readFile(file));
    else if(file==='src/engine/analysis/impulse-confidence.ts') assertReviewedImpulseConfidence(await readFile(file));
    else if(file==='src/engine/analysis/ventricular-candidates.ts') assertReviewedQrsTFile(file,await readFile(file));
    else if(file==='src/engine/measure.ts') assertReviewedMeasure(await readFile(path.join(base,file)),await readFile(file));
    else assert.equal(hash(await readFile(file)),hash(await readFile(path.join(base,file))),`Unreviewed primitive change: ${file}`);
  }
  const rows=[],historicalRows=[];let identical=0,addedTPeaks=0;
  const compareHistorical=(samples,reference,context)=>{
    const before=B.measure(samples), after=A.analyzeSamples(samples);
    // Candidate-support revision: only absent T peaks may be exposed; all interval candidates stay exact; a summary may be explicitly retired,
    // never replaced by another number. Historical HR screen remains frozen.
    for(const key of ['hr','instantHr','rr','detectedPeaks','window'])
      assert.deepEqual(after[key],before[key],`Primitive output changed: ${key}`);
    addedTPeaks+=assertPeakOnlyBeats(before.beats,after.beats);
    for(const key of ['pr','qrs','qt','axis']) {
      if(after[key]!==null)assert.equal(after[key],before[key],`Corrected ${key} without delineation evidence`);
      else if(before[key]!==null){assert.equal(after.evidence[key].status,'unavailable');assert.equal(after.rejected[key],before[key]);}
      const rank={usable:0,review:1,unavailable:2};assert.ok(rank[after.evidence[key].status]>=rank[before.evidence[key].status]);
    }
    for(const key of ['pAxis','tAxis'])if(after[key]!==null)assert.equal(after[key],before[key]);
    for(const key of Object.keys(before.qtc))if(after.qtc[key]!==null)assert.equal(after.qtc[key],before.qtc[key]);
    identical++;
    if(before.evidence.hr.status!=='usable') assert.deepEqual(before.evidence.hr,after.evidence.hr);
    const error=before.hr===null||reference===null?null:before.hr-reference;
    const quality=before.hr===null?null:A.heartRateDetectionQuality(samples,before.detectedPeaks);
    return {measurement:after,row:{...context,referenceBpm:reference,hr:before.hr,errorBpm:error,
      beyondReview:error===null?null:Math.abs(error)>policy.heartRateErrorReviewBpm,
      before:before.evidence.hr.status,after:after.evidence.hr.status,quality,
      intervalChanges:Object.fromEntries(['pr','qrs','qt','axis'].filter(k=>before[k]!==after[k]||before.evidence[k].status!==after.evidence[k].status).map(k=>[k,{before:before[k],after:after[k],statusBefore:before.evidence[k].status,statusAfter:after.evidence[k].status}]))}};
  };
  const compare=(samples,reference,context)=>{
    const {row,measurement:prior}=compareHistorical(samples,reference,context);historicalRows.push(row);
    const next=C.analyzeSamples(samples);assertQrsTRefinement(prior,next);
    const error=(value)=>value===null||reference===null?null:value-reference;
    const beforeError=error(prior.hr),afterError=error(next.hr);
    return {...context,referenceBpm:reference,beforeHr:prior.hr,hr:next.hr,beforeErrorBpm:beforeError,errorBpm:afterError,
      beforeBeyondReview:beforeError===null?null:Math.abs(beforeError)>policy.heartRateErrorReviewBpm,
      beyondReview:afterError===null?null:Math.abs(afterError)>policy.heartRateErrorReviewBpm,
      before:prior.evidence.hr.status,after:next.evidence.hr.status,
      beforeCandidates:prior.detectedPeaks.length,afterCandidates:next.detectedPeaks.length};
  };
  const cleanDefaults=[];
  for(const preset of B.PRESETS.filter(p=>p.strategy!=='pending')) {
    const signal=B.synthesize(B.fromPreset(preset),10);
    cleanDefaults.push(compare({fs:signal.fs,leads:signal.leads},null,{preset:preset.id}));
  }
  for(const id of p.presets) {
    const c=B.fromPreset(B.presetById(id));Object.assign(c,{filter:'off',notch:0,variability:0});
    Object.assign(c.artifacts,{baseline:0,muscle:0,mains:0,loose:0,reversed:false});
    const signal=B.synthesize(c,p.segmentDurationSeconds);
    const events=signal.events.beats.filter(b=>qrsMidpointSeconds({time:b.time-p.cropSeconds[0],qrs:b.qrs})>=.2&&qrsMidpointSeconds({time:b.time-p.cropSeconds[0],qrs:b.qrs})<9.8);
    const reference=events.length>1?60*(events.length-1)/(events.at(-1).time-events[0].time):null;
    for(const segment of [null,...source.segments]) for(const snrDb of segment?p.snrDb:[null]) {
      const channels=segment?.channels??[new Float64Array(signal.leads.I.length),new Float64Array(signal.leads.I.length)];
      const mixed=B.injectNoise(signal,channels,p.mapping,snrDb,p.cropSeconds);
      for(const filter of p.filters) {
        const samples=B.cropSamples(B.filterSamples(mixed.signal,filter),p.cropSeconds);
        rows.push(compare(samples,reference,{preset:id,noise:segment?.record??'clean',startSeconds:segment?.startSeconds??null,snrDb,filter}));
      }
    }
  }
  const summarize=summarizeRateRevision;
  const groups=[];
  for(const noise of ['clean',...p.records]) for(const snrDb of noise==='clean'?[null]:p.snrDb) for(const filter of p.filters)
    groups.push({noise,snrDb,filter,...summarize(rows.filter(r=>r.noise===noise&&r.snrDb===snrDb&&r.filter===filter))});
  const newlyFalse=rows.filter(r=>r.after==='usable'&&r.beyondReview&&!(r.before==='usable'&&r.beforeBeyondReview));
  const report={schemaVersion:2,role,clinicalValidation:false,policy,numericalRevision:QRS_T_REVISION,newlyFalseUsable:newlyFalse,
    historicalQualityContract:{scope:'Exact pre-QRS/T numerical primitives; all historical equality assertions preserved',unchangedNonTpeakPrimitiveOutputs:identical,addedTPeakCandidates:addedTPeaks,rows:historicalRows},
    overall:summarize(rows),groups,cleanDefaults,rows,limitations:policy.limitations,
    provenance:{commit:execFileSync('git',['rev-parse','HEAD']).toString().trim(),baselineCommit:policy.baselineCommit,
      noiseSha256:hash(await readFile(path.join(noiseDir,'noise-segments.json'))),
      evaluatedSources:Object.fromEntries(await Promise.all(Object.keys(next.metafile.inputs).map(async f=>[f,hash(await readFile(f))]))),
      analyzerReceivesOnlySamples:true,modelAuditUsed:false}};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({role,...report.overall,newlyFalseUsable:newlyFalse.length,cleanDefaultChanges:cleanDefaults.filter(r=>r.before!==r.after).map(r=>r.preset)}));
  assert.equal(newlyFalse.length,0,'Numerical revision introduced a confidently incorrect rate');
} finally { await rm(temp,{recursive:true,force:true}); }
