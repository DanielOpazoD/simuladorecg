/** Paired synthetic worker check. One current analyzer evaluates both generators.
 * Synthetic event truth is evaluator-only, never an analyzer input or clinical ground truth. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const BASE='73918de21bd698e414247512e76157d615a0e0bf',out=process.argv[2];
assert.ok(out,'Usage: validate-af-clock.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'af-clock-'));
try{
 const old=path.join(temp,'before');await mkdir(old);
 execFileSync('tar',['-xf','-','-C',old],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
 const load=async(dir,name)=>{const file=path.join(temp,name+'.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile:file});return import(pathToFileURL(file));};
 const before=await load(old,'old'),after=await load(process.cwd(),'new'),file=path.join(temp,'analyzer.mjs');
 const analysis=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';export {applyAcquisitionScope} from './src/engine/acquisition-measurement';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
 assert.ok(!Object.keys(analysis.metafile.inputs).some(p=>/\/(signal|rhythm|model-audit)\.ts$/.test(p)),'Generator truth leaked into analyzer');
 const A=await import(pathToFileURL(file)),rows=[];
 for(const hr of [35,60,90,120,160,200])for(const seed of [1,17,73])for(const filter of ['off','diagnostic','monitor','aggressive']){
  const evaluate=M=>{const c={...M.fromPreset(M.presetById('af')),hr,seed,filter},s=M.synthesize(c,10);
   const m=A.applyAcquisitionScope(A.analyzeSamples({fs:s.fs,leads:s.leads}),filter);
   return {referenceRate:s.truth.hr,rate:m.hr,status:m.evidence.hr.status,errorBpm:m.hr===null?null:Math.abs(m.hr-s.truth.hr)};
  };
  rows.push({hr,seed,filter,before:evaluate(before),after:evaluate(after)});
 }
 const bad=r=>r.status==='usable'&&r.errorBpm>5;
 const count=(side,fn)=>rows.filter(r=>fn(r[side])).length;
 const report={schemaVersion:1,baselineCommit:BASE,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  scenarios:rows.length,beforeFalseUsable:count('before',bad),afterFalseUsable:count('after',bad),
  beforeUsable:count('before',r=>r.status==='usable'),afterUsable:count('after',r=>r.status==='usable'),
  rows,clinicalValidation:false,scope:'Exposed synthetic 72-case worker regression; 5 bpm existing engineering review threshold, not diagnostic accuracy.'};
 await mkdir(path.dirname(path.resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,rows:undefined}));
 assert.equal(rows.length,72);assert.equal(report.afterFalseUsable,0,'New AF clock has falsely usable rates in exposed matrix');
 assert.ok(report.afterUsable>=report.beforeUsable,'Do not pass by withholding every rate');
}finally{await rm(temp,{recursive:true,force:true});}
