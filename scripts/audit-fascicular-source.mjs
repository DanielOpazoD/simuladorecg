/** Reports sample-level source features; a successful script is NOT a passed fidelity audit. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.argv[2];assert.ok(output&&process.argv.length===3,'Usage: audit-fascicular-source.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'fascicular-source-audit-'));
try{
 const file=path.join(temp,'source.mjs');
 await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';export {sourcePolarity,hasInitialAndDominantPolarity} from './tests/support/fascicular-source-metrics';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:file});
 const api=await import(pathToFileURL(file)),cases=[];
 for(const id of ['lafb','lpfb']){
  const preset=api.presetById(id);assert.ok(preset,'Missing declared preset');assert.equal(preset.id,id);
  const c={...api.fromPreset(preset),filter:'off',pAmp:0,tAmp:0,st:0,variability:0};
  c.artifacts={...c.artifacts,baseline:0,muscle:0,mains:0,loose:0};
  const signal=api.synthesize(c,6),beat=signal.events.beats.find(b=>b.time>3);assert.ok(beat?.qrs);
  const requirements=id==='lafb'?[['aVL','qR'],['II','rS'],['III','rS'],['aVF','rS']]:[['I','rS'],['aVL','rS'],['III','qR'],['aVF','qR']];
  const probes=[.005,.01,.02].map(relativeThreshold=>({relativeThreshold,
   leads:requirements.map(([lead,pattern])=>{
    const observed=api.sourcePolarity(signal.leads[lead],signal.fs,beat.time,beat.time+beat.qrs,relativeThreshold);
    return {lead,requiredInitialAndDominantPolarity:pattern,observed,meetsDirectionalFeature:api.hasInitialAndDominantPolarity(observed,pattern),
     ...(id==='lafb'&&lead==='aVL'?{meetsRPeakTimeFeature:observed.positivePeakMs!==null&&observed.positivePeakMs>=45}:{})};
   })}));
  const bytes=Buffer.concat(Object.values(signal.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)));
  cases.push({id,programmedQrsMs:c.qrs,programmedAxisDegrees:c.axis,fs:signal.fs,seed:c.seed,
   sourceWindowSeconds:[beat.time,beat.time+beat.qrs],samplesSha256:createHash('sha256').update(bytes).digest('hex'),probes});
 }
 const gaps=cases.flatMap(c=>c.probes.flatMap(p=>p.leads.filter(l=>!l.meetsDirectionalFeature||l.meetsRPeakTimeFeature===false).map(l=>({preset:c.id,relativeThreshold:p.relativeThreshold,lead:l.lead,required:l.requiredInitialAndDominantPolarity,observedInitialPolarity:l.observed.initialPolarity}))));
 const report={schemaVersion:1,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clinicalValidation:false,
  status:gaps.length?'observed-source-feature-gaps':'selected-source-features-observed',
  reference:'https://www.sts.org/sites/default/files/Endorsed%20Guidelines/2018%20ACC-AHA-HRS%20Bradycardia%20Full%20Text.pdf',referenceLocation:'Table3,pdf page10',
  scope:'Two isolated deterministic default sources, filter/noise/P/T/ST off. Programmed support is not a measured clinical QRS boundary. Relative probe levels are engineering sensitivity checks, not diagnostic thresholds. Initial/dominant polarity is not complete morphology or diagnostic specificity.',cases,gaps};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,clinicalValidation:false,cases:cases.length,gaps}));
}finally{await rm(temp,{recursive:true,force:true});}
