/** Fixed stress protocol; evaluation sees references, analyzer receives fs/leads only. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';
import {errorSummary} from './lib/external-qrs-evaluation.mjs';
const args=parseArgs({allowPositionals:true,options:{
  'source-root':{type:'string',default:process.cwd()},
  'analyzer':{type:'string',default:'primitive'},
  'noise-dir':{type:'string'},
}});
const evaluatorRoot=process.cwd(),root=path.resolve(args.values['source-root']);
const output=args.positionals[0],noiseDir=args.values['noise-dir']??output;
if(!output||args.positionals.length!==1||!['primitive','worker'].includes(args.values.analyzer))
  throw new Error('Usage: benchmark-noise-stress.mjs OUTPUT [--noise-dir INPUT] [--source-root DIR] [--analyzer primitive|worker]');
const analyzerEntry=args.values.analyzer==='worker'?'src/engine/sample-analysis.ts':'src/engine/measure.ts';
const protocolBytes=await readFile('benchmarks/noise-stress/protocol.json');
const p=JSON.parse(protocolBytes), hash=x=>createHash('sha256').update(x).digest('hex');
const source=JSON.parse(await readFile(path.join(noiseDir,'noise-segments.json')));
const provenance=JSON.parse(await readFile(path.join(noiseDir,'noise-provenance.json')));
assert.equal(provenance.protocolSha256,hash(protocolBytes),'Prepared data belongs to a different protocol');
const expected=p.records.flatMap(r=>p.segmentStartsSeconds.map(t=>`${r}:${t}`));
assert.deepEqual(source.segments.map(s=>`${s.record}:${s.startSeconds}`),expected,'No omissions/replacement of snippets');
const temp=await mkdtemp(path.join(tmpdir(),'noise-stress-'));
const write=(name,obj)=>writeFile(path.join(output,name),JSON.stringify(obj,null,2)+'\n');
try{
  // The evaluator is identical for baseline and candidate; only product imports vary.
  const product=f=>JSON.stringify(path.join(root,f));
  const helpers=JSON.stringify(path.join(evaluatorRoot,'scripts/lib/noise-stress.ts'));
  const models=await build({stdin:{contents:`export {synthesize} from ${product('src/engine/signal.ts')}; export {fromPreset,presetById} from ${product('src/presets/catalog.ts')}; export {tWaveSupport} from ${product('src/engine/constraints.ts')}; export {highpass,biquad} from ${product('src/engine/filter.ts')}; export * from ${helpers};`,resolveDir:evaluatorRoot},bundle:true,platform:'node',format:'esm',metafile:true,outfile:path.join(temp,'model.mjs')});
  const analyzer=await build({entryPoints:[path.join(root,analyzerEntry)],bundle:true,platform:'node',format:'esm',metafile:true,outfile:path.join(temp,'analyzer.mjs')});
  assert.ok(!Object.keys(models.metafile.inputs).some(x=>x.endsWith('/measure.ts')||x.endsWith('/model-audit.ts')));
  assert.ok(!Object.keys(analyzer.metafile.inputs).some(x=>/\/(signal|rhythm|reference|model-audit)\.ts$/.test(x)),'Reference leakage into analyzer');
  const M=await import(pathToFileURL(path.join(temp,'model.mjs')).href);
  const api=await import(pathToFileURL(path.join(temp,'analyzer.mjs')).href);
  const measure=args.values.analyzer==='worker'?api.analyzeSamples:api.measure;
  const inputs=Object.keys({...models.metafile.inputs,...analyzer.metafile.inputs}).filter(x=>x!=='<stdin>');
  const evaluatedSources=Object.fromEntries(await Promise.all(inputs.map(async x=>[x,hash(await readFile(x))])));
  const modelSignals={},refs={},morphologyWindows={};
  for(const id of p.presets){
    const c=M.fromPreset(M.presetById(id));c.filter='off';c.notch=0;c.variability=0;
    Object.assign(c.artifacts,{baseline:0,muscle:0,mains:0,loose:0,reversed:false});
    const s=M.synthesize(c,p.segmentDurationSeconds);modelSignals[id]={c,s};
    // 150ms event matching uses the QRS midpoint, not an asserted clinical R peak.
    refs[id]=s.events.beats.map(b=>({...b,time:b.time-p.cropSeconds[0],anchor:b.time-p.cropSeconds[0]+b.qrs/2})).filter(b=>b.anchor>=.2&&b.anchor<9.8);
    const chosen=new Map();
    for(const b of s.events.beats)if(b.time>=5&&b.time+b.qt<12&&!chosen.has(b.kind))chosen.set(b.kind,b);
    assert.ok(chosen.size>0,'No complete fixed-window cycle');
    morphologyWindows[id]=[...chosen.values()].map(b=>({kind:b.kind,baseline:[b.time-.035,b.time-.020],qrs:[b.time,b.time+b.qrs],t:[b.time+M.tWaveSupport(c,b.qrs,b.qt).start,b.time+b.qt]}));
  }
  function analysis(signal,reference){
    const m=measure({fs:signal.fs,leads:signal.leads}); // no events, truth or case
    const peaks=m.detectedPeaks.filter(t=>t>=.2&&t<9.8);
    const detected=matchQrsEvents(reference.map(b=>b.anchor),peaks,p.eventToleranceSeconds);
    const errors=[];
    for(const pair of detected.pairs){
      const r=reference.find(b=>b.anchor===pair.reference),b=m.beats.find(b=>b.peak===pair.detected);
      if(!b)continue;
      errors.push({kind:r.kind,qrsMs:b.qrs-r.qrs*1000,
        qtMs:b.qt===null?null:b.qt-r.qt*1000,onsetMs:(b.onset-r.time)*1000,offsetMs:(b.offset-r.time-r.qrs)*1000});
    }
    const nominalHR=reference.length>=2?60*(reference.length-1)/(reference.at(-1).time-reference[0].time):null;
    const summaries=Object.fromEntries(['qrs','qt','onset','offset'].map(k=>[k,errorSummary(errors.flatMap(e=>e[k+'Ms']===null?[]:[e[k+'Ms']]))]));
    return {tp:detected.tp,fp:detected.fp,fn:detected.fn,outsideWindow:m.detectedPeaks.length-peaks.length,
      matchedWithDelineation:errors.length,errors,summaries,
      hr:M.retainedEstimate(m.hr,m.evidence.hr.status,nominalHR,p.reviewThresholds.hrBpm),
      metricStatus:Object.fromEntries(['qrs','qt'].map(k=>[k,m.evidence[k].status])),
      reported:{hr:m.hr,qrs:m.qrs,qt:m.qt},
      // Status is global: does NOT imply a per-beat probability of correctness.
      retainedBeyondLimits:Object.fromEntries(['qrs','qt'].map(k=>[k,{status:m.evidence[k].status,
        comparable:errors.filter(e=>e[k+'Ms']!==null).length,
        count:m[k]===null||m.evidence[k].status==='unavailable'?0:errors.filter(e=>e[k+'Ms']!==null&&Math.abs(e[k+'Ms'])>p.reviewThresholds[k+'Ms']).length}]))};
  }
  function morphology(id,clean,actual){
    return morphologyWindows[id].map(w=>({kind:w.kind,windows:w,byLead:M.compareMorphology(clean,actual,w,p.reviewThresholds)}));
  }
  const rows=[],native=[],cleanSourceHashes={};
  for(const id of p.presets){const {c,s}=modelSignals[id];
    for(const mode of p.filters){
      const actual=M.synthesize({...c,filter:mode},p.segmentDurationSeconds);
      assert.deepEqual(actual.events,s.events,'Filter altered event reference');
      native.push({preset:id,filter:mode,chain:'Native synthesize: 1000Hz filter, antialias, 500Hz output',morphology:morphology(id,s,actual)});
    }
    const cleanHash=hash(Buffer.concat(M.ALL_NOISE_LEADS.map(l=>Buffer.from(s.leads[l].buffer))));
    cleanSourceHashes[id]=cleanHash;
    for(const segment of [null,...source.segments])for(const snrDb of segment?p.snrDb:[null]){
      const channels=segment?.channels??[new Float64Array(s.leads.I.length),new Float64Array(s.leads.I.length)];
      assert.ok(!segment||segment.fs===s.fs,'Noise/output sampling mismatch');
      const mixed=M.injectNoise(s,channels,p.mapping,snrDb,p.cropSeconds);
      for(const mode of p.filters){const filtered=M.filterSamples(mixed.signal,mode,{highpass:M.highpass,biquad:M.biquad});M.assertIdentities(filtered);
        rows.push({preset:id,noise:segment?.record??'clean',startSeconds:segment?.startSeconds??null,snrDb,filter:mode,
          achievedDb:mixed.achievedDb,perLeadDb:mixed.perLeadDb,scaleMvPerCount:mixed.scaleMvPerCount,
          rmseMv:M.waveformRmse(s,filtered,p.cropSeconds),morphology:morphology(id,s,filtered),
          analysis:analysis(M.cropSamples(filtered,p.cropSeconds),refs[id])});
      }
    }
    assert.equal(hash(Buffer.concat(M.ALL_NOISE_LEADS.map(l=>Buffer.from(s.leads[l].buffer)))),cleanHash,'Clean source mutated');
  }
  const groups=[];
  for(const noise of ['clean',...p.records])for(const snrDb of noise==='clean'?[null]:p.snrDb)for(const mode of p.filters){
    const a=rows.filter(r=>r.noise===noise&&r.snrDb===snrDb&&r.filter===mode),sum=fn=>a.reduce((s,r)=>s+fn(r),0);
    groups.push({noise,snrDb,filter:mode,scenarios:a.length,tp:sum(r=>r.analysis.tp),fp:sum(r=>r.analysis.fp),fn:sum(r=>r.analysis.fn),
      // These are repeated synthetic cases/windows, NOT independent patients.
      morphologyReviewScenarios:sum(r=>r.morphology.some(b=>Object.values(b.byLead).some(x=>x.requiresReview))?1:0),
      statuses:Object.fromEntries(['hr','qrs','qt'].map(k=>[k,Object.fromEntries(['usable','review','unavailable'].map(status=>[status,sum(r=>(k==='hr'?r.analysis.hr.status:r.analysis.metricStatus[k])===status?1:0)]))])),
      retainedErrors:Object.fromEntries(['qrs','qt'].map(k=>[k,sum(r=>r.analysis.retainedBeyondLimits[k].count)]))});
  }
  await write('noise-results.json',{schemaVersion:2,analyzerEntry,cleanSourceHashes,noiseProtocolSha256:hash(protocolBytes),
    sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),
    noiseSha256:hash(await readFile(path.join(noiseDir,'noise-segments.json'))),
    protocol:p,rows,groups,native,
    interpretation:'Engineering stress outcomes, not clinical validation. Global analyzer status is not per-beat reliability. No tuning after viewing this protocol.',
    analyzerReceivesOnlySamples:true,modelAuditUsed:false});
  await write('evaluation-provenance.json',{commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),analyzerEntry,evaluatedSources,
    preparedNoiseSha256:hash(await readFile(path.join(noiseDir,'noise-segments.json'))),protocolSha256:hash(protocolBytes),
    clinicalValidation:false,generatorChanged:false,analyzerTuned:false});
  console.log(JSON.stringify({scenarios:rows.length,nativeComparisons:native.length,groups:groups.length,analyzerTuned:false}));
}catch(e){await write('evaluation-failure.json',{error:String(e.stack)});throw e;}
finally{await rm(temp,{recursive:true,force:true});}
