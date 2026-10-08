import {scoreWindowedQrs} from './lib/windowed-qrs-score.mjs';
/** Paired source change under the same current sample-only worker pipeline.
 * Synthetic event references remain confined to this evaluator. */
import {build} from 'esbuild';import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';
const output=process.argv[2];assert.ok(output,'Output required');
const base='3c10eacd5fa4382d232c368777bd9d5f3b7f3475';
const temporary=await mkdtemp(path.join(tmpdir(),'secondary-st-paired-'));
try{
 const root=path.join(temporary,'before');await mkdir(root);
 execFileSync('tar',['-xf','-','-C',root],{input:execFileSync('git',['archive',base],{maxBuffer:1e8})});
 async function load(root,name){const file=path.join(temporary,name+'.mjs');await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';export {analyzeSamples} from './src/engine/sample-analysis';export {applyAcquisitionScope} from './src/engine/acquisition-measurement';export {ModelScopeError} from './src/engine/constraints';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:file});return import(pathToFileURL(file));}
 const before=await load(root,'old'),current=await load(process.cwd(),'current'),rows=[];
 for(const id of ['lbbb','rbbb','irbbb','vvi','pvc','vt','idioventricular','hyperk','torsades'])
 for(const hr of [50,72,100,120,160])for(const noise of [0,.025,.075])for(const filter of ['off','diagnostic','monitor','aggressive']){
  const c={...current.fromPreset(current.presetById(id)),hr,filter,variability:0};
  Object.assign(c.artifacts,{baseline:noise,muscle:noise,mains:noise,loose:0});
  const generate=M=>{try{return {signal:M.synthesize(c,10)}}catch(e){if(!(e instanceof M.ModelScopeError))throw e;return{unsupported:String(e)}}};
  const a=generate(before),b=generate(current),context={id,hr,filter,noise};
  assert.equal(a.unsupported,b.unsupported,'Representability changed');
  if(a.unsupported){rows.push({...context,unsupported:a.unsupported});continue;}
  assert.deepEqual(a.signal.events,b.signal.events,'Programmed clocks changed');
  if(id==='hyperk'||id==='torsades')assert.deepEqual(a.signal.leads,b.signal.leads,'Unrelated/unsupported ST source changed');
  const reference=b.signal.events.beats.filter(x=>x.time+x.qrs/2>=.2&&x.time+x.qrs/2<9.8);
  const anchors=reference.map(x=>x.time+x.qrs/2);
  const referenceRate=reference.length>1?60*(reference.length-1)/(reference.at(-1).time-reference[0].time):null;
  const run=s=>{const m=current.applyAcquisitionScope(current.analyzeSamples({fs:s.fs,leads:s.leads}),filter);
   const match=scoreWindowedQrs(reference,m.detectedPeaks);
   return{hr:m.hr,status:m.evidence.hr.status,tp:match.tp,fp:match.fp,fn:match.fn,qrs:m.qrs,qt:m.qt,rawWindow:match.rawWindow,boundaryWitnesses:match.boundaryWitnesses};};
  rows.push({...context,referenceRate,before:run(a.signal),after:run(b.signal)});
 }
 const valid=rows.filter(x=>!x.unsupported),bad=(m,r)=>m.status==='usable'&&r.referenceRate!==null&&(m.hr===null||Math.abs(m.hr-r.referenceRate)>5);
 const introduced=valid.filter(r=>bad(r.after,r)&&!bad(r.before,r));
 const diagnostic=valid.filter(r=>r.filter==='off'||r.filter==='diagnostic');
 const missed=diagnostic.filter(r=>r.after.fn>r.before.fn),extra=diagnostic.filter(r=>r.after.fp>r.before.fp);
 const report={boundaryAccounting:'Reference midpoints remain in [0.2,9.8); outside-window fiducials may match only inside an included QRS support (-10/+30 ms) and within the unchanged 150 ms bound. Raw truncated scores and every edge witness remain visible.',legacyRawNewMissCases:diagnostic.filter(r=>r.after.rawWindow.fn>r.before.rawWindow.fn).length,base,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clinicalValidation:false,
  summary:{scenarios:rows.length,accepted:valid.length,unsupported:rows.length-valid.length,newFalselyUsableHR:introduced.length,newDiagnosticMissCases:missed.length,newDiagnosticFalseCases:extra.length},
  scope:'Fixed exposed 540-case source sensitivity check. Same current analyzer on both sources. Detection regression required in off/diagnostic; monitor/aggressive raw results retained, with real acquisition-scope availability applied.',introduced,missed,extra,rows};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
 assert.equal(rows.length,540);assert.equal(introduced.length,0);assert.equal(missed.length,0);assert.equal(extra.length,0);
}finally{await rm(temporary,{recursive:true,force:true});}
