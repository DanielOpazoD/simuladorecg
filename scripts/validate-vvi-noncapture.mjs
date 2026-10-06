/** Exposed stimulus-only worker regression, not a clinical pacemaker classifier. */
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=process.argv[2];assert.ok(out,'Usage: validate-vvi-noncapture.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'vvi-noncapture-'));
try{
 const file=path.join(temp,'model.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:file});
 const model=await import(pathToFileURL(file)),af=path.join(temp,'analyzer.mjs');
 const result=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';export {applyAcquisitionScope} from './src/engine/acquisition-measurement';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:af});
 assert.ok(!Object.keys(result.metafile.inputs).some(p=>/\/(signal|rhythm|model-audit)\.ts$/.test(p)));
 const A=await import(pathToFileURL(af)),rows=[];
 for(const hr of [20,60,120,250])for(const seed of [1,17,73])for(const noise of [0,.01,.05,.15,.5,1])for(const filter of ['off','diagnostic','monitor','aggressive']){
  const c={...model.fromPreset(model.presetById('vvi')),hr,seed,filter,pacingBehavior:'demand-no-capture',intrinsicRate:0};
  Object.assign(c.artifacts,{muscle:noise,baseline:noise,mains:noise});
  const s=model.synthesize(c,10),raw=A.analyzeSamples({fs:s.fs,leads:s.leads}),m=A.applyAcquisitionScope(raw,filter);
  assert.equal(s.events.beats.length,0);assert.ok(s.events.spikes.length>=3);
  rows.push({hr,seed,noise,filter,rawRate:raw.hr,rawStatus:raw.evidence.hr.status,workerStatus:m.evidence.hr.status});
 }
 const falseUsable=rows.filter(r=>r.workerStatus==='usable');
 await mkdir(path.dirname(path.resolve(out)),{recursive:true});await writeFile(out,JSON.stringify({schemaVersion:1,cases:rows.length,falseUsable,
  statuses:rows.reduce((counts,r)=>(counts[r.workerStatus]=(counts[r.workerStatus]||0)+1,counts),{}),rows,clinicalValidation:false,
  scope:'Total noncapture without intrinsic escape; exposed synthetic artifacts, not sensitivity/specificity or mixed-capture validation.'},null,2)+'\n');
 assert.equal(rows.length,288);assert.equal(falseUsable.length,0,'A stimulus-only trace must not yield a confirmed ventricular rate');
 console.log(JSON.stringify({cases:rows.length,falseUsable:0,clinicalValidation:false}));
}finally{await rm(temp,{recursive:true,force:true});}
