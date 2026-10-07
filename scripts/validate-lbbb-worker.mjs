import {qrsMidpointSeconds} from './lib/qrs-event-reference.mjs';
/** Model reference stays in evaluator; worker receives samples only. */
import {build} from 'esbuild';import assert from 'node:assert/strict';
import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const output=process.argv[2];assert.ok(output,'Usage: validate-lbbb-worker.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'lbbb-worker-'));
try{
 const file=path.join(temp,'api.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';export {ModelScopeError} from './src/engine/constraints';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:file});
 const model=await import(pathToFileURL(file));const analyzerFile=path.join(temp,'analyzer.mjs');
 const bundle=await build({stdin:{contents:"export {analyzeSamples} from './src/engine/sample-analysis';export {applyAcquisitionScope} from './src/engine/acquisition-measurement';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',metafile:true,outfile:analyzerFile});
 assert.ok(!Object.keys(bundle.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Model truth imported by analyzer');
 const api=await import(pathToFileURL(analyzerFile)),rows=[];
 const cases=[];
 for(const hr of [40,60,72,100,120])for(const qrs of [130,160,200,240])for(const qtc of [350,430,520])for(const filter of ['off','diagnostic','monitor','aggressive'])cases.push({hr,qrs,qtc,filter,cohort:'exposed240'});
 for(const hr of [40,120])for(const qrs of [130,240])for(const qtc of [350,520])for(const filter of ['off','diagnostic'])cases.push({hr,qrs,qtc,filter,cohort:'noisy-boundary-transfer',noise:.05,seed:53});
 for(const config of cases){
  const {hr,qrs,qtc,filter,cohort,noise,seed}=config;
  const c={...model.fromPreset(model.presetById('lbbb')),hr,qrs,qtc,filter};
  if(noise!==undefined){c.artifacts={...c.artifacts,baseline:noise,muscle:noise,mains:noise};c.seed=seed;}
  const pair={};
  for(const activationModel of ['template','regional-lbbb-v1']){
   const s=model.synthesize({...c,activationModel},10);
   const m=api.applyAcquisitionScope(api.analyzeSamples({fs:s.fs,leads:s.leads}),filter);
   const reference=s.events.beats.map(qrsMidpointSeconds).filter(t=>t>=.2&&t<=9.8);
   const matched=matchQrsEvents(reference,m.detectedPeaks.filter(t=>t>=.2&&t<=9.8),.15);
   assert.ok(reference.length>=3&&Number.isInteger(matched.tp)&&Number.isInteger(matched.fn)&&Number.isInteger(matched.fp));
   assert.equal(matched.tp+matched.fn,reference.length);
   pair[activationModel]={tp:matched.tp,fn:matched.fn,fp:matched.fp,hr:m.hr,status:m.evidence.hr.status,candidates:m.detectedPeaks.length,reason:m.evidence.hr.reason,
    falselyUsable:m.evidence.hr.status==='usable'&&Math.abs(m.hr-hr)>5};
  }
  rows.push({...config,...pair,newlyMissedQrs:pair['regional-lbbb-v1'].fn>pair.template.fn,newlyFalseUsable:pair['regional-lbbb-v1'].falselyUsable&&!pair.template.falselyUsable});
 }
 assert.equal(rows.length,256);assert.equal(rows.filter(r=>r.cohort==='exposed240').length,240);const failures=rows.filter(r=>r.newlyFalseUsable);
 const report={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  analyzerSourceHashes:Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).filter(f=>f!=='<stdin>').map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),
  scenarios:rows.length,preexistingFalseUsable:rows.filter(r=>r.template.falselyUsable).length,newFalseUsable:failures.length,newMissedQrsCases:rows.filter(r=>r.newlyMissedQrs).length,usableBefore:rows.filter(r=>r.template.status==='usable').length,usableAfter:rows.filter(r=>r['regional-lbbb-v1'].status==='usable').length,rows,
  clinicalValidation:false,limitation:'Previously exposed 240-case development sweep plus 16 noisy boundary transfer cases; ±5 bpm is the unchanged engineering screen, not a clinical acceptance limit. All historical failures remain visible.'};
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:rows.length,preexisting:report.preexistingFalseUsable,newFalseUsable:failures,newMissedQrsCases:report.newMissedQrsCases,usableBefore:report.usableBefore,usableAfter:report.usableAfter}));
 assert.equal(report.newMissedQrsCases,0,'Additional missed QRS in the exposed paired domain');
 assert.equal(failures.length,0,'New falsely usable rate in the full exposed LBBB domain');
}finally{await rm(temp,{recursive:true,force:true})}
