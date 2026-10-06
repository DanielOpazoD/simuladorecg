/** Paired exposed WPW sample-only worker check; not clinical validation. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const base='10ebc667020a002b765f594203c27f9803b72172',output=process.argv[2];
assert.ok(output,'Usage: validate-wpw-support.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'wpw-support-'));
try{
 const baseline=path.join(temp,'baseline');await mkdir(baseline);
 execFileSync('tar',['-xf','-','-C',baseline],{input:execFileSync('git',['archive',base],{maxBuffer:100*1024*1024})});
 async function model(dir,name){const outfile=path.join(temp,name+'.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});return import(pathToFileURL(outfile));}
 const before=await model(baseline,'before'),after=await model(process.cwd(),'after');
 const af=path.join(temp,'analyzer.mjs');const built=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';export {applyAcquisitionScope} from './src/engine/acquisition-measurement';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:af});
 assert.ok(!Object.keys(built.metafile.inputs).some(p=>/\/(signal|rhythm|model-audit)\.ts$/.test(p)));
 const analyzer=await import(pathToFileURL(af)),rows=[];
 for(const hr of [40,73,120,180])for(const pr of [90,100.3,101.7])for(const filter of ['off','diagnostic','monitor','aggressive'])for(const noise of [0,.05])for(const electrolyte of ['none','lowvoltage']){
  const c={...after.fromPreset(after.presetById('wpw')),hr,pr,filter,electrolyte,variability:0,seed:17};
  Object.assign(c.artifacts,{baseline:noise,muscle:noise,mains:noise});
  const generated=M=>{try{return {signal:M.synthesize(c,10)};}catch(error){return {error:String(error)};}};
  const a=generated(before),b=generated(after),context={hr,pr,filter,noise,electrolyte};
  if(a.error||b.error){assert.equal(a.error,b.error,'Representability changed');rows.push({...context,unsupported:a.error});continue;}
  assert.deepEqual(a.signal.events,b.signal.events,'Event times must not move to the sampling grid');
  const analyze=s=>{const raw=analyzer.analyzeSamples({fs:s.fs,leads:s.leads}),worker=analyzer.applyAcquisitionScope(raw,filter);return {hr:raw.hr,rawStatus:raw.evidence.hr.status,status:worker.evidence.hr.status};};
  rows.push({...context,before:analyze(a.signal),after:analyze(b.signal)});
 }
 const valid=rows.filter(r=>!r.unsupported),bad=(m,hr)=>m.status==='usable'&&(m.hr===null||Math.abs(m.hr-hr)>5);
 const newlyFalse=valid.filter(r=>bad(r.after,r.hr)&&!bad(r.before,r.hr));
 const summary={cases:rows.length,accepted:valid.length,unsupported:rows.length-valid.length,newlyFalseUsable:newlyFalse.length,
  falseUsableBefore:valid.filter(r=>bad(r.before,r.hr)).length,falseUsableAfter:valid.filter(r=>bad(r.after,r.hr)).length,
  usableBefore:valid.filter(r=>r.before.status==='usable').length,usableAfter:valid.filter(r=>r.after.status==='usable').length};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify({baselineCommit:base,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clinicalValidation:false,summary,rows,newlyFalse},null,2)+'\n');
 console.log(JSON.stringify(summary));assert.equal(rows.length,192);assert.equal(newlyFalse.length,0,'New falsely usable rate after WPW support change');
}finally{await rm(temp,{recursive:true,force:true});}
