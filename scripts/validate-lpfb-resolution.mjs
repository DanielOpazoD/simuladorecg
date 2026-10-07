import {predictSecondaryST} from './lib/secondary-st-prediction.mjs';
import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';
import {qrsMidpointSeconds} from './lib/qrs-event-reference.mjs';
/** Frozen paired source regression. Clinical morphology is tested independently
 * in lpfb-resolution.test.ts; detector receives samples only. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const output=process.argv[2];assert.ok(output,'Output required');
const baseline='8189c897cc824080b9eea8d27a8d80b3ae13fc55';
const temp=await mkdtemp(path.join(tmpdir(),'lpfb-paired-'));
try{
 const root=path.join(temp,'before');await mkdir(root);
 execFileSync('tar',['-xf','-','-C',root],{input:execFileSync('git',['archive',baseline],{maxBuffer:100*1024*1024})});
 async function load(root,name){const file=path.join(temp,name+'.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById,PRESETS} from './src/presets/catalog';export {analyzeSamples} from './src/engine/sample-analysis';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:file});return import(pathToFileURL(file));}
 await predictSecondaryST(root);
 const before=await load(root,'old'),after=await load(process.cwd(),'new');const rows=[];
 for(const p of after.PRESETS.filter(p=>p.strategy!=='pending'&&p.id!=='lpfb'))for(const filter of ['off','diagnostic','monitor','aggressive']){
  const c={...after.fromPreset(p),filter},a=before.synthesize(c,10),b=after.synthesize(c,10);
  assert.deepEqual(a,b,`Unrelated preset ${p.id}/${filter} changed`);
  rows.push({preset:p.id,filter,exact:true});
 }
 const sourceRows=[];
 for(const conduction of ['lpfb','rbbb_lpfb'])for(const hr of [50,72,100,120])for(const filter of ['off','diagnostic','monitor','aggressive'])for(const noise of [0,.025,.075]){
  const c={...after.fromPreset(after.presetById('lpfb')),conduction,qrs:conduction==='lpfb'?100:150,hr,filter,variability:0};
  c.artifacts={...c.artifacts,baseline:noise,muscle:noise,mains:noise};
  const a=before.synthesize(c,10),b=after.synthesize(c,10);
  assert.deepEqual(a.events,b.events,'Calendar and repolarization clocks changed');assert.deepEqual(a.truth,b.truth,'Programmed truth changed');
  const ma=before.analyzeSamples({fs:a.fs,leads:a.leads}),mb=after.analyzeSamples({fs:b.fs,leads:b.leads});
  const bad=m=>m.evidence.hr.status==='usable'&&(m.hr===null||Math.abs(m.hr-hr)>5);
  const newFalseUsable=bad(mb)&&!bad(ma),resolvedFalseUsable=bad(ma)&&!bad(mb);
  assert.ok(!newFalseUsable,`New falsely usable rate ${conduction}/${hr}/${filter}/${noise}`);
  const reference=b.events.beats.map(qrsMidpointSeconds).filter(t=>t>=.2&&t<9.8);
  const match=m=>matchQrsEvents(reference,m.detectedPeaks.filter(t=>t>=.2&&t<9.8),.15);
  const oldMatch=match(ma),newMatch=match(mb);
  assert.ok(newMatch.fn<=oldMatch.fn,`Missed true QRS ${conduction}/${hr}/${filter}/${noise}`);


  sourceRows.push({conduction,hr,filter,noise,newFalseUsable,resolvedFalseUsable,before:{hr:ma.hr,peaks:ma.detectedPeaks.length,...oldMatch},after:{hr:mb.hr,peaks:mb.detectedPeaks.length,...newMatch}});
 }
 const detectionSummary={newFalseUsable:sourceRows.filter(r=>r.newFalseUsable).length,resolvedFalseUsable:sourceRows.filter(r=>r.resolvedFalseUsable).length,fpBefore:sourceRows.reduce((a,r)=>a+r.before.fp,0),fpAfter:sourceRows.reduce((a,r)=>a+r.after.fp,0),fnBefore:sourceRows.reduce((a,r)=>a+r.before.fn,0),fnAfter:sourceRows.reduce((a,r)=>a+r.after.fn,0)};
 const report={baseline,detectionSummary,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),unchanged:rows.length,evaluatedSourceCases:sourceRows.length,clinicalValidation:false,rows,sourceRows};await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({unchanged:rows.length,evaluatedSourceCases:sourceRows.length,detectionSummary}));
}finally{await rm(temp,{recursive:true,force:true});}
