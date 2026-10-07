import {prepareConfidenceCounterfactual} from './lib/confidence-counterfactual.mjs';
import {qrsMidpointSeconds} from './lib/qrs-event-reference.mjs';
import {OPPOSED_CYCLE_REVISION,assertReviewedOpposedCycle,assertQualityOnlyRevision} from './lib/opposed-cycle-revision.mjs';
/** Paired sample-only numerical revision: known regressions plus transfer/ectopy.
 * Synthetic event references are confined to this evaluator, never the detector. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';
import {QRS_T_REVISION,assertReviewedQrsTFile} from './lib/qrs-t-revision.mjs';
const baselineCommit=QRS_T_REVISION.evaluationBaselineCommit;
const output=process.argv[2];assert.ok(output,'Usage: validate-qrs-t-discrimination.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'qrs-t-pair-'));
try{
 const baseline=path.join(temp,'baseline');await mkdir(baseline);
 execFileSync('tar',['-xf','-','-C',baseline],{input:execFileSync('git',['archive',baselineCommit],{maxBuffer:100*1024*1024})});
 for(const file of Object.keys(QRS_T_REVISION.files))assertReviewedQrsTFile(file,await readFile(file));
 const sourceHashes={};
 async function analyzer(root,label){
  const outfile=path.join(temp,label+'.mjs');const r=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';",resolveDir:root},bundle:true,platform:'node',format:'esm',metafile:true,outfile});
  assert.ok(!Object.keys(r.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Analyzer must not import model truth');
  sourceHashes[label]=Object.fromEntries(await Promise.all(Object.keys(r.metafile.inputs).filter(f=>f!=='<stdin>').map(async f=>[path.relative(root,path.resolve(f)),createHash('sha256').update(await readFile(f)).digest('hex')])));
  return (await import(pathToFileURL(outfile))).analyzeSamples;
 }
 const qualityBaseline=path.join(temp,'quality-baseline');
 const qualityCounterfactual=await prepareConfidenceCounterfactual(process.cwd(),qualityBaseline);
 assertReviewedOpposedCycle(await readFile(OPPOSED_CYCLE_REVISION.file));
 const before=await analyzer(baseline,'before'),qualityBefore=await analyzer(qualityBaseline,'qualityBefore'),after=await analyzer(process.cwd(),'after');
 const file=path.join(temp,'model.mjs');const modelBuild=await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById,PRESETS} from './src/presets/catalog';export {ModelScopeError} from './src/engine/constraints';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
 const modelSourceHashes=Object.fromEntries(await Promise.all(Object.keys(modelBuild.metafile.inputs).filter(f=>f!=='<stdin>').map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
 const model=await import(pathToFileURL(file)),rows=[];
 function evaluate(label,id,changes){
  const c={...model.fromPreset(model.presetById(id)),variability:0,...changes};
  const noise=changes.noise;delete c.noise;
  c.artifacts={...c.artifacts,...(noise===undefined?{}:{baseline:noise,muscle:noise,mains:noise})};
  let s;try{s=model.synthesize(c,10);}catch(error){if(!(error instanceof model.ModelScopeError))throw error;rows.push({label,id,changes,unsupported:String(error)});return;}
  const reference=s.events.beats.filter(b=>qrsMidpointSeconds(b)>=.2&&qrsMidpointSeconds(b)<9.8);
  const referenceHR=reference.length>=2?60*(reference.length-1)/(reference.at(-1).time-reference[0].time):null;
  const sampleHash=()=>createHash('sha256').update(Buffer.concat(Object.values(s.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)))).digest('hex');
  const frozen=sampleHash();
  const run=m=>{const match=matchQrsEvents(reference.map(b=>qrsMidpointSeconds(b)),m.detectedPeaks.filter(t=>t>=.2&&t<9.8),.15);return {hr:m.hr,status:m.evidence.hr.status,tp:match.tp,fp:match.fp,fn:match.fn,candidates:m.detectedPeaks.length,reportedQrs:m.qrs};};
  const sampleInput={fs:s.fs,leads:s.leads};
  const prior=qualityBefore(sampleInput),next=after(sampleInput);assertQualityOnlyRevision(prior,next);
  rows.push({label,id,changes,referenceHR,before:run(before(sampleInput)),qualityBefore:run(prior),after:run(next)});assert.equal(sampleHash(),frozen,'Analyzer mutated the ECG');
 }
 for(const hr of [73,120])for(const pr of [90,100.3,101.7])for(const filter of ['off','diagnostic'])
  evaluate('exposed','wpw',{hr,pr,filter,electrolyte:'lowvoltage',noise:.05,seed:17});
 for(const id of ['wpw','sinus','lbbb','rbbb','vvi','vt'])for(const hr of [55,95,145])for(const noise of [0,.025,.075])for(const seed of [11,41])for(const filter of ['off','diagnostic'])for(const electrolyte of ['none','lowvoltage'])
  evaluate('transfer',id,{hr,noise,seed,filter,electrolyte});
 for(const id of ['pvc','bigeminy','trigeminy','couplet'])for(const hr of [60,95,130])for(const coupling of [.35,.58,.8])for(const filter of ['off','diagnostic'])for(const noise of [0,.05])
  evaluate('ectopy',id,{hr,coupling,filter,noise,seed:29});
 for(const id of ['sinus','lbbb','rbbb','vt','vvi'])for(const hr of [180,220,240,260])for(const qrs of [80,140,200,240])for(const noise of [0,.025])for(const qtc of [350,430])for(const filter of ['off','diagnostic'])evaluate('high-rate',id,{hr,qrs,noise,qtc,filter,seed:53});
 for(const hr of [40,60,72,100,120])for(const qrs of [100,140,200,240])for(const qtc of [350,430,520])for(const filter of ['off','diagnostic','monitor','aggressive'])evaluate('regional-rbbb','rbbb',{hr,qrs,qtc,filter,noise:0,seed:17,activationModel:'regional-rbbb-v1'});
 for(const preset of model.PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive'])evaluate('catalog-default',preset.id,{filter,variability:model.fromPreset(preset).variability});
 const valid=rows.filter(r=>!r.unsupported),bad=(m,r)=>m.status==='usable'&&r.referenceHR!==null&&(m.hr===null||Math.abs(m.hr-r.referenceHR)>5);
 const newlyFalse=valid.filter(r=>bad(r.after,r)&&!bad(r.before,r)),lost=valid.filter(r=>r.after.fn>r.before.fn);
 const known=valid.filter(r=>r.label==='exposed'),failedKnown=known.filter(r=>r.after.status!=='usable'||r.after.hr===null||Math.abs(r.after.hr-r.referenceHR)>1||r.after.fp>0);
 const summary={cases:rows.length,accepted:valid.length,unsupported:rows.length-valid.length,exposedCorrect:known.length-failedKnown.length,exposedTotal:known.length,newlyFalseUsable:newlyFalse.length,newMissedQrsCases:lost.length,falseUsableBefore:valid.filter(r=>bad(r.before,r)).length,falseUsableAfter:valid.filter(r=>bad(r.after,r)).length,usableBefore:valid.filter(r=>r.before.status==='usable').length,usableAfter:valid.filter(r=>r.after.status==='usable').length};
 const qualityRevision={...OPPOSED_CYCLE_REVISION,...qualityCounterfactual,numericallyIdentical:valid.length,usableBefore:valid.filter(r=>r.qualityBefore.status==='usable').length,usableAfter:summary.usableAfter,
  falseUsableBefore:valid.filter(r=>bad(r.qualityBefore,r)).length,falseUsableAfter:summary.falseUsableAfter,
  accurateNewReviews:valid.filter(r=>r.qualityBefore.status==='usable'&&r.after.status==='review'&&!bad(r.qualityBefore,r)).length};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify({baselineCommit,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes,modelSourceHashes,candidateTreeDirty:execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()!=='',qualityRevision,clinicalValidation:false,scope:'Exposed deterministic synthetic evaluation, not independent patient validation. Five bpm is an engineering error screen.',summary,rows,newlyFalse,lost,failedKnown},null,2)+'\n');
 console.log(JSON.stringify({summary,qualityRevision}));assert.equal(rows.length,1712);assert.equal(known.length,12,'All known examples must actually execute');assert.equal(failedKnown.length,0);assert.equal(newlyFalse.length,0,'New confidently incorrect rate');assert.equal(lost.length,0,'New missed ventricular activations');
}finally{await rm(temp,{recursive:true,force:true});}
