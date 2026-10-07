import {assertTeachingCatalogSource,assertTeachingCatalogRevision} from './lib/teaching-scope-revision.mjs';
import {QRS_T_REVISION,assertReviewedQrsTFile} from './lib/qrs-t-revision.mjs';
import {predictWpwSupport} from './lib/wpw-support-prediction.mjs';
import {assertNoncaptureTeachingScope} from './lib/noncapture-teaching-contract.mjs';
import {predictAfClock,assertFrozenAfSampler} from './lib/af-clock-prediction.mjs';
import {predictTorsadesFrame} from './lib/torsades-frame-prediction.mjs';
import {assertReviewedAcquisitionScope} from './lib/acquisition-scope-contract.mjs';
import {assertReviewedEventCalendar} from './lib/event-calendar-revision.mjs';
import {predictQTInitialization,assertReviewedQTInitialization} from './lib/qt-initialization-revision.mjs';
import {assertReviewedSampleEntry,assertReviewedAlternatingConfidence,assertReviewedImpulseConfidence} from './lib/sample-entry-contract.mjs';
/** Frozen-source comparison. --coherence applies only the independently declared A02/A03 delta. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assertTraceContract,PHYSICAL_LEADS} from '../tests/support/repolarization-contract.mjs';
import {predictSource} from '../tests/support/repolarization-prediction.mjs';
const BASE='b744caca103f0aeefcdb7ddfd98fd5fea9f08588', output=process.argv[2];
const coherence=process.argv[3]==='--coherence';
assert.ok(output && (process.argv.length===3 || (process.argv.length===4&&coherence)),
  'Usage: validate-repolarization-scope.mjs OUTPUT [--coherence]');
const temp=await mkdtemp(path.join(tmpdir(),'repolarization-scope-'));
try {
  assertReviewedQTInitialization(await readFile('src/engine/repolarization.ts'));
  assertFrozenAfSampler(await readFile('src/engine/af-rr.ts'));
  const base=path.join(temp,'baseline');await mkdir(base);
  execFileSync('tar',['-xf','-','-C',base],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
  const changedFiles=execFileSync('git',['diff','--name-only',BASE,'HEAD','--','src/engine','src/presets'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const reviewedSourceContracts=['src/engine/ventricular-trajectory.ts','src/engine/af-rr.ts'];
  assertTeachingCatalogSource(await readFile('src/presets/catalog.ts','utf8'),await readFile(path.join(base,'src/presets/catalog.ts'),'utf8'));
  reviewedSourceContracts.push('src/presets/catalog.ts');
  const teachingFile='src/presets/teaching-limits.ts';
  assertNoncaptureTeachingScope(await readFile(teachingFile,'utf8'),await readFile(path.join(base,teachingFile),'utf8'));
  reviewedSourceContracts.push(teachingFile);
  // A separate numerical revision, checked against an independent frozen-source
  // prediction below. This is not an exemption from sample comparison.
  const qtHistoryRevision = 'src/engine/repolarization.ts';
  if(changedFiles.includes('src/engine/sample-analysis.ts')) {
    assertReviewedSampleEntry(await readFile('src/engine/sample-analysis.ts'));
    reviewedSourceContracts.push('src/engine/sample-analysis.ts');
  }
  assertReviewedImpulseConfidence(await readFile('src/engine/analysis/impulse-confidence.ts'));
  reviewedSourceContracts.push('src/engine/analysis/impulse-confidence.ts');
  assertReviewedAlternatingConfidence(await readFile('src/engine/analysis/alternating-confidence.ts'));
  reviewedSourceContracts.push('src/engine/analysis/alternating-confidence.ts');
  for(const file of Object.keys(QRS_T_REVISION.files)){assertReviewedQrsTFile(file,await readFile(file));reviewedSourceContracts.push(file);}
  // Reviewed calendar integrity: all valid historical samples still compared below.
  for(const file of ['src/engine/rhythm.ts','src/engine/event-calendar.ts','src/engine/flutter-conduction.ts','src/engine/vvi-demand.ts']) {
    assertReviewedEventCalendar(file,await readFile(file));
    reviewedSourceContracts.push(file);
  }

  // Known acquisition provenance changes reported reliability, never sample analysis.
  for(const file of ['src/engine/worker.ts','src/engine/acquisition-measurement.ts','src/engine/analysis/model-audit.ts']) {
    assertReviewedAcquisitionScope(file,await readFile(file));
    reviewedSourceContracts.push(file);
  }

  // Opt-in regional model: every historical trace below still has to be exact.
  // The experimental branch has its own mandatory, paired source/sample gate.
  const optInRegionalFiles=['src/engine/types.ts','src/engine/regional-activation.ts'];
  assert.ok(changedFiles.every(f=>f===qtHistoryRevision || reviewedSourceContracts.includes(f) || (coherence && optInRegionalFiles.includes(f)) || (coherence && ['src/engine/signal.ts','src/engine/morphology.ts','src/engine/secondary-repolarization.ts','src/engine/torsades-frame.ts'].includes(f))), 'Unexpected generator/analyzer/catalog/dependency change');
  async function load(dir,name){
    const outfile=path.join(temp,name+'.mjs');
    await build({stdin:{contents:"export {synthesize} from './src/engine/signal'; export {fromPreset,PRESETS} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
    return import(pathToFileURL(outfile).href);
  }
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),rows=[],matrix=[];
  let expected=before;
  {
    const predicted=path.join(temp,'prediction');await cp(base,predicted,{recursive:true});
    const file=path.join(predicted,'src/engine/signal.ts');
    if(coherence) await writeFile(file,predictWpwSupport(predictTorsadesFrame(predictSource(await readFile(file,'utf8')))));
    else await writeFile(file,predictWpwSupport(await readFile(file,'utf8')));
    const qtFile=path.join(predicted,qtHistoryRevision);
    await writeFile(qtFile,predictQTInitialization(await readFile(qtFile,'utf8')));
    const rhythmFile=path.join(predicted,'src/engine/rhythm.ts');
    await writeFile(rhythmFile,predictAfClock(await readFile(rhythmFile,'utf8')));
    expected=await load(predicted,'expected');
  }
  assertTeachingCatalogRevision(before.PRESETS,after.PRESETS);
  function check(c,label){
    const original=before.synthesize(c,10),actual=after.synthesize(c,10),prediction=expected.synthesize(c,10);
    const result=assertTraceContract(prediction,actual,label,coherence?1e-12:0);
    let changedSamples=0,maxChangeMv=0;
    for(const l of PHYSICAL_LEADS)for(let i=0;i<actual.leads[l].length;i++){
      const d=Math.abs(actual.leads[l][i]-original.leads[l][i]);if(d>0)changedSamples++;
      maxChangeMv=Math.max(maxChangeMv,d);
    }
    return {label,changedSamples,maxChangeMv,...result};
  }
  for(const preset of before.PRESETS.filter(p=>p.strategy!=='pending'))
    for(const filter of ['off','diagnostic','monitor','aggressive'])
      {
        const c={...before.fromPreset(preset),filter},label=`${preset.id}/${filter}`;
        // Default phenotypes are outside this repair's numerical delta: exact, not tolerance-based.
        if(coherence && c.conduction!=='wpw' && c.rhythm!=='torsades' && c.rhythm!=='af' && !(c.rhythm==='sinus' && ['mobitz1','mobitz2','two_one','high'].includes(c.av)))
          assertTraceContract(before.synthesize(c,10),after.synthesize(c,10),label+'/default-frozen');
        if(coherence && c.rhythm==='torsades') {
          // The complete QRS/acquisition chain must remain bit-identical when T is removed.
          assertTraceContract(before.synthesize({...c,tAmp:0},10),after.synthesize({...c,tAmp:0},10),label+'/qrs-frozen');
        }
        rows.push({preset:preset.id,filter,...check(c,label)});
      }
  assert.equal(rows.length,244);
  if(coherence)for(const id of ['lbbb','rbbb','irbbb','vvi','pvc','vt'])
    for(const electrolyte of ['none','hypokalemia','hyperkalemia'])
      for(const phase of ['acute','hyperacute','evolving']) {
        const c={...before.fromPreset(before.PRESETS.find(p=>p.id===id)),filter:'off',hr:60,atrialRate:60,variability:0,
          electrolyte,phase,ischemia:phase==='acute'?'none':'anterior',st:phase==='acute'?0:1};
        const label=`${id}/${electrolyte}/${phase}`;
        if(electrolyte!=='none'&&phase!=='acute'){
          assert.throws(()=>expected.synthesize(c,10),/outside scope/);
          assert.throws(()=>after.synthesize(c,10),/fuera de alcance/);
          matrix.push({label,rejectedAsUnsupported:true});
        }else matrix.push(check(c,label));
      }
  const report={schemaVersion:2,stage:coherence?'A02-A03-independent-prediction':'A01-characterization-only',baselineCommit:BASE,
    eventCalendarRevision:'Strict bounded events and causal RR/PR assertions; optional programmed flutter sequences. Historical default samples remain exact.',
    torsadesFrameRevision:'Secondary T shares the historical time-varying QRS frame. Non-torsades defaults and QRS-only traces remain exact.',
    wpwSupportRevision:'Independent compact-support correction; no negative-phase delta before native onset.',
    afClockRevision:'Representative gamma renewal CV0.22; frozen candidate and independent source prediction, not universal AF physiology.',
    qtInitializationRevision:'First event retains nominal ventricular RR; adaptation starts at second event. Separate from A02/A03 morphology.',
    candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changedFiles,
    clinicalValidation:false,scenarios:rows.length,sampleComparisons:rows.reduce((n,r)=>n+r.checked,0),rows,matrix,
    limitations:['The b744caca baseline has absent secondary ST and bypassed T modifiers; it is not clinical truth.',
      'Coherence mode predicts the stated mathematical intervention, not physiological accuracy. No new patient data or holdout.']};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined,matrix:matrix.length}));
} finally {await rm(temp,{recursive:true,force:true});}
