import {predictAfClock,assertFrozenAfSampler} from './lib/af-clock-prediction.mjs';
import {assertReviewedAlternatingConfidence,assertReviewedImpulseConfidence} from './lib/sample-entry-contract.mjs';
import {predictQTInitialization,assertReviewedQTInitialization} from './lib/qt-initialization-revision.mjs';
/** v1.3 versus working tree, on matched synthetic samples. Not clinical validation. */
import { build } from 'esbuild';
import {assertReviewedMeasure,assertPeakOnlyChange} from './lib/t-peak-revision.mjs';
import assert from 'node:assert/strict';
import { compareSignalContract, assertPresetSet, assertRvAmplitudeChange } from './lib/fidelity-contracts.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const BASE = '38c0cd31b5836c96c82556d756e8150cfde99c64';
const AXIS_BASE = '5bafc2031e73048ff2f5d5e99f0b039d4ef1acca';
const root = process.cwd(), args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i+=2) {
 if (!['--baseline-dir','--output'].includes(args[i]) || !args[i+1]) throw new Error('Use --baseline-dir PATH and/or --output FILE');
 options[args[i]] = path.resolve(args[i+1]);
}
const temp = await mkdtemp(path.join(tmpdir(),'ecg-regional-'));
try {
 assertReviewedQTInitialization(await readFile('src/engine/repolarization.ts'));
 assertFrozenAfSampler(await readFile('src/engine/af-rr.ts'));
 const referencePreparation='Historical morphology with independently predicted QT initialization and representative AF clock; default equality is relative to this declared reference revision';
 let baseDir = options['--baseline-dir'];
 if (!baseDir) {
   baseDir = path.join(temp,'base'); await mkdir(baseDir);
   const archive = execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024});
   execFileSync('tar',['-xf','-','-C',baseDir],{input:archive});
 }
 async function load(dir, name) {
   const outfile = path.join(temp, name+'.mjs');
   await build({stdin:{contents:`export {synthesize} from './src/engine/signal'; export {measure} from './src/engine/measure'; export {fromPreset,presetById,PRESETS} from './src/presets/catalog'; export {qrsKernels} from './src/engine/morphology'; export {project,axisFromLeads} from './src/engine/leads';`,resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile,
     // Transform only the in-memory historical module; --baseline-dir remains read-only.
     plugins:dir===root?[]:[{name:'reviewed-qt-initialization',setup(builder){
       builder.onLoad({filter:/\/repolarization\.ts$/},async args=>({
         contents:predictQTInitialization(await readFile(args.path,'utf8')),loader:'ts'
       }));
       builder.onLoad({filter:/\/rhythm\.ts$/},async args=>({contents:predictAfClock(await readFile(args.path,'utf8')),loader:'ts'}));
     }}]});
   return import(pathToFileURL(outfile).href);
 }
 const axisBaseDir = path.join(temp,'axis-base'); await mkdir(axisBaseDir);
 const axisArchive = execFileSync('git',['archive',AXIS_BASE],{maxBuffer:100*1024*1024});
 execFileSync('tar',['-xf','-','-C',axisBaseDir],{input:axisArchive});
 const [before, axisBase, after] = await Promise.all([load(baseDir,'before'),load(axisBaseDir,'axis-base'),load(root,'after')]);
 const outfile = path.join(temp,'metrics.mjs');
 await build({entryPoints:[path.join(root,'tests/support/morphology-metrics.ts')],bundle:true,platform:'node',format:'esm',outfile});
 const {morphologyMetrics} = await import(pathToFileURL(outfile).href);
 const analysisFiles=async dir=>(await readdir(path.join(dir,'src/engine/analysis'))).filter(p=>p.endsWith('.ts')).sort();
 const currentAnalysis=await analysisFiles(root),baselineAnalysis=await analysisFiles(baseDir);
 assert.deepEqual(currentAnalysis,[...baselineAnalysis,'impulse-confidence.ts','alternating-confidence.ts'].sort(),'Detector file set changed');
 const confidenceBytes=await readFile(path.join(root,'src/engine/analysis/impulse-confidence.ts'));
 assertReviewedImpulseConfidence(confidenceBytes);
 const alternationBytes=await readFile(path.join(root,'src/engine/analysis/alternating-confidence.ts'));
 assertReviewedAlternatingConfidence(alternationBytes);
 const alternatingConfidence={role:'review-only-post-analysis',sha256:createHash('sha256').update(alternationBytes).digest('hex')};
 const impulseConfidence={role:'post-analysis-confidence-only',sha256:createHash('sha256').update(confidenceBytes).digest('hex')};
 // model-audit runs AFTER independent analysis. Its maintenance must not be
 // mistaken for a numerical detector change; still report its exact identity.
 const auditPath='src/engine/analysis/model-audit.ts';
 const auditBefore=await readFile(path.join(baseDir,auditPath));
 const auditAfter=await readFile(path.join(root,auditPath));
 const modelAudit={path:auditPath,role:'post-analysis-synthetic-audit',
   unchanged:auditBefore.equals(auditAfter),
   beforeSha256:createHash('sha256').update(auditBefore).digest('hex'),
   afterSha256:createHash('sha256').update(auditAfter).digest('hex')};
 const detectorFiles = ['src/engine/measure.ts', ...baselineAnalysis.filter(p=>p!=='model-audit.ts').map(p=>'src/engine/analysis/'+p)];
 const detector = await Promise.all(detectorFiles.map(async p => {
   const a=await readFile(path.join(baseDir,p)),b=await readFile(path.join(root,p));
   return {path:p,unchanged:a.equals(b),sha256:createHash('sha256').update(b).digest('hex')};
 }));
 for(const f of detector.filter(f=>!f.unchanged)) {
   if(f.path!=='src/engine/measure.ts')throw new Error('Detector freeze violated: '+f.path);
   assertReviewedMeasure(await readFile(path.join(baseDir,f.path)),await readFile(path.join(root,f.path)));
 }
 assertPresetSet(before.PRESETS,after.PRESETS);
 const rows=[];
 for(const id of ['inferior','inferior_lcx','anterior','lateral'])
 for(const phase of ['acute','hyperacute','evolving','chronic'])
 for(const filter of ['off','diagnostic']) {
   const c=after.fromPreset(after.presetById(id)); Object.assign(c,{phase,filter,hr:72,variability:0});
   const a=before.synthesize(c,10),b=after.synthesize(c,10),beat=b.events.beats.find(x=>x.time>3);
   const contract=compareSignalContract(a,b,{exact:phase==='acute'||phase==='chronic',label:`${id}/${phase}/${filter}`});
   assert.ok(beat,'missing interior beat');
   const qrs=beat.qrs,qt=beat.qt,tStart=qt-Math.min(.22,(qt-qrs)*.68);
   const windows={baseline:[beat.time-.04,beat.time-.02],qrs:[beat.time,beat.time+qrs],t:[beat.time+tStart,beat.time+qt]};
   const leads={};
   for(const lead of Object.keys(b.leads)) leads[lead]={before:morphologyMetrics(a.leads[lead],a.fs,windows),after:morphologyMetrics(b.leads[lead],b.fs,windows)};
   // The product detector sees only samples; model windows are not passed to it.
   const am=after.measure(a),bm=after.measure(b);
   assertPeakOnlyChange(before.measure(a),am);
   assertPeakOnlyChange(before.measure(b),bm);
   rows.push({id,phase,filter,case:c,windows,...contract,leads,
    detector:{before:{hr:am.hr,qrs:am.qrs,qt:am.qt},after:{hr:bm.hr,qrs:bm.qrs,qt:bm.qt}}});
 }
 // Explicitly reviewed v1.5 source changes. Never relax conservation for the other defaults.
 const changedSources = new Set(['pvc','bigeminy','trigeminy','couplet','idioventricular','aivr','vt','complete_v']);
 const integratedAxis=(mod,c)=>{
   const beat={time:0,rr:1,kind:'normal'}, ks=mod.qrsKernels(c,beat);
   const sum=ks.reduce((a,k)=>a.map((v,j)=>v+k.v[j]*k.sigma),[0,0,0]);
   const p=mod.project(sum); return mod.axisFromLeads(p.I,p.II);
 };
 const angleError=(a,b)=>Math.abs((((a-b)%360)+540)%360-180);
 const defaults=[];
 for(const p of after.PRESETS.filter(p=>p.strategy!=='pending')) {
   const c=after.fromPreset(p),a=before.synthesize(c,10),r=axisBase.synthesize(c,10),b=after.synthesize(c,10);
   assertPeakOnlyChange(before.measure(b),after.measure(b));
   const intendedSourceChange=changedSources.has(p.id), intendedRvGainChange=p.id==='rv_chronic',
     intendedFinalAxisChange=p.id==='rv_acute'||p.id==='rv_chronic',
     intendedSecondaryChange=b.events.beats.some(beat=>beat.kind!=='normal') ||
       c.conduction==='lbbb' || c.conduction.includes('rbbb'),
     reviewedMainChange=intendedFinalAxisChange||intendedSecondaryChange;
   const historicalContract=intendedRvGainChange ? assertRvAmplitudeChange(before.synthesize,a,r,c)
     : compareSignalContract(a,r,{exact:!intendedSourceChange,label:`historical/default/${p.id}`});
   const contract=compareSignalContract(r,b,{exact:!reviewedMainChange,label:`axis/default/${p.id}`});
   if(intendedFinalAxisChange) {
     assert.ok(contract.maxDifferenceMv>.001,`missing final-axis change ${p.id}`);
     const oldAxis=integratedAxis(axisBase,c),newAxis=integratedAxis(after,c);
     assert.ok(angleError(newAxis,c.axis)<1e-9,`final axis not aligned ${p.id}: ${newAxis}`);
     assert.ok(angleError(oldAxis,c.axis)>1e-3,`axis baseline unexpectedly already aligned ${p.id}`);
   }
   // The legacy source path must obey the same reviewed-main boundary.
   const legacyConfig={...c,ventricularSource:'rv_apical_pacing'};
   const legacyBefore=axisBase.synthesize(legacyConfig,10),legacy=after.synthesize(legacyConfig,10);
   const legacyContract=compareSignalContract(legacyBefore,legacy,{exact:!reviewedMainChange,label:`axis/legacy-source/${p.id}`});
   if(intendedSourceChange) assert.ok(historicalContract.maxDifferenceMv>.03,`missing source change ${p.id}`);
   if(intendedSecondaryChange&&!intendedFinalAxisChange)
     assert.ok(contract.maxDifferenceMv>1e-6,`missing coupled-secondary change ${p.id}`);
   defaults.push({id:p.id,intendedSourceChange,intendedRvGainChange,intendedFinalAxisChange,intendedSecondaryChange,
     reviewedMainExact:!reviewedMainChange,legacySourceExact:legacyContract.maxDifferenceMv===0,
     historicalMaxDifferenceMv:historicalContract.maxDifferenceMv,...contract});
 }
 const output=options['--output'] || path.join(root,'.sites-runtime','repolarization-comparison.json');
 await mkdir(path.dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify({schema:1,referencePreparation,base:BASE,runtime:process.version,measurementScope:'Whole signal in T window; ST can contribute. Not isolated cellular T, HATW score, or diagnostic accuracy.',windowSource:'generator events; not independent delineation',externalValidation:false,detector,tPeakEvidenceOnly:true,modelAudit,impulseConfidence,alternatingConfidence,defaultPresets:defaults,scenarios:rows},null,2));
 console.log(JSON.stringify({referencePreparation,output,scenarios:rows.length,unchangedDefaults:defaults.filter(x=>x.maxDifferenceMv===0).length,detectorFrozen:detector.every(x=>x.unchanged)}));
} finally { await rm(temp,{recursive:true,force:true}); }
