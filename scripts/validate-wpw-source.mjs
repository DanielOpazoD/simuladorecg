/** Paired source verification against the published predecessor. Full non-WPW
 * traces stay exact; WPW is compared with an independent historical-source patch. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {predictWpwRepolarization} from './lib/wpw-repolarization-prediction.mjs';
import {assertTraceContract} from '../tests/support/repolarization-contract.mjs';
const output=process.argv[2];assert.ok(output);
const baseline='d208370f883b9f1d3a22c34db62d97daacb279c6',temp=await mkdtemp(path.join(tmpdir(),'wpw-source-'));
try{
 const beforeRoot=path.join(temp,'before'),predictionRoot=path.join(temp,'prediction');await mkdir(beforeRoot);
 execFileSync('tar',['-xf','-','-C',beforeRoot],{input:execFileSync('git',['archive',baseline],{maxBuffer:100*1024*1024})});
 await cp(beforeRoot,predictionRoot,{recursive:true});await predictWpwRepolarization(predictionRoot);
 async function load(root,label){const file=path.join(temp,label+'.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {PRESETS,fromPreset,presetById} from './src/presets/catalog';export {qrsKernels,qrsKernelValue,wpwDeltaVector} from './src/engine/morphology';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:file});return import(pathToFileURL(file));}
 const before=await load(beforeRoot,'old'),predicted=await load(predictionRoot,'predicted'),after=await load(process.cwd(),'current'),rows=[];
 for(const p of before.PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive']){
  const c={...before.fromPreset(p),filter},wpw=c.conduction==='wpw';
  rows.push({id:`${p.id}/${filter}`,kind:wpw?'independent-WPW-prediction':'exact-non-WPW',...assertTraceContract((wpw?predicted:before).synthesize(c,10),after.synthesize(c,10),p.id,wpw?1e-12:0)});
 }
 let primitiveSamples=0;
 for(const qrs of [60,90,135,233.7])for(const axis of [-120,0,55,120])for(const filter of ['off','diagnostic','monitor','aggressive']){
  const c={...before.fromPreset(before.presetById('wpw')),qrs,axis,filter,qtc:600,hr:60,variability:0};
  rows.push({id:`WPW/${qrs}/${axis}/${filter}`,kind:'independent-WPW-prediction',...assertTraceContract(predicted.synthesize(c,10),after.synthesize(c,10),'WPW matrix',1e-12)});
  for(const kind of ['normal','pvc','ventricular','paced']){
   const b={time:1,kind,rr:1};const original=before.qrsKernels(c,b),current=after.qrsKernels(c,b);assert.deepEqual(current,original);
   for(let i=0;i<=1000;i++){
    assert.deepEqual(after.wpwDeltaVector(c,i/1000),before.wpwDeltaVector(c,i/1000));
    for(let j=0;j<original.length;j++)assert.equal(after.qrsKernelValue(current[j],i/1000),before.qrsKernelValue(original[j],i/1000));
    primitiveSamples++;
   }
  }
 }
 const report={schemaVersion:1,baselineCommit:baseline,clinicalValidation:false,scenarios:rows.length,exactNonWpw:rows.filter(r=>r.kind==='exact-non-WPW').length,independentWpw:rows.filter(r=>r.kind==='independent-WPW-prediction').length,unchangedActivationPrimitiveSamples:primitiveSamples,rows};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));
}finally{await rm(temp,{recursive:true,force:true});}
