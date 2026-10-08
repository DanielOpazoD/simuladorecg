import {predictLeadingQrs} from './lib/leading-qrs-prediction.mjs';
import {predictWpwRepolarization} from './lib/wpw-repolarization-prediction.mjs';
import {predictSecondaryST} from './lib/secondary-st-prediction.mjs';
import {predictLpfbSource} from './lib/lpfb-source-prediction.mjs';
import {assertTeachingCatalogRevision} from './lib/teaching-scope-revision.mjs';
import {predictWpwSupport} from './lib/wpw-support-prediction.mjs';
import {predictAfClock,assertFrozenAfSampler} from './lib/af-clock-prediction.mjs';
import {predictTorsadesFrame} from './lib/torsades-frame-prediction.mjs';
import {assertTraceContract} from '../tests/support/repolarization-contract.mjs';
import {assertLbbbRegionalSamples} from './lib/lbbb-regional-contract.mjs';
import {predictQTInitialization,assertReviewedQTInitialization} from './lib/qt-initialization-revision.mjs';
/** Frozen PR55 source versus candidate: defaults exact; opt-in samples causal. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assertExactSignal} from './lib/fidelity-contracts.mjs';
import {assertRegionalSampleContract} from './lib/regional-activation-contract.mjs';
const BASE='0df1527edb4a3cb5ff95bc4b88305a5b40372e20';
const output=process.argv[2];assert.ok(output,'Usage: validate-regional-activation.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'ecg-regional-activation-'));
try {
  assertReviewedQTInitialization(await readFile('src/engine/repolarization.ts'));
  assertFrozenAfSampler(await readFile('src/engine/af-rr.ts'));
  const base=path.join(temp,'baseline');await mkdir(base);
  execFileSync('tar',['-xf','-','-C',base],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
  const load=async(dir,name)=>{const outfile=path.join(temp,name+'.mjs');
    await build({stdin:{contents:"export {synthesize} from './src/engine/signal'; export {PRESETS,fromPreset,presetById} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
    return import(pathToFileURL(outfile).href);
  };
  const qtFile=path.join(base,'src/engine/repolarization.ts');
  await writeFile(qtFile,predictQTInitialization(await readFile(qtFile,'utf8')));
  const signalFile=path.join(base,'src/engine/signal.ts');
  await writeFile(signalFile,predictLeadingQrs(predictWpwSupport(predictTorsadesFrame(await readFile(signalFile,'utf8')))));
  const rhythmFile=path.join(base,'src/engine/rhythm.ts');
  await writeFile(rhythmFile,predictAfClock(await readFile(rhythmFile,'utf8')));
  const morphologyFile=path.join(base,'src/engine/morphology.ts');
  await writeFile(morphologyFile,predictLpfbSource(await readFile(morphologyFile,'utf8')));
  await predictSecondaryST(base);
  await predictWpwRepolarization(base);
  const referencePreparation='PR55 with independent QT initialization plus torsades-frame, compact WPW support and representative AF-clock, LPFB, secondary-ST and complete WPW repolarization source predictions, plus additive clipped-QRS provenance; unrelated defaults remain exact';
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),defaults=[];
  assertTeachingCatalogRevision(before.PRESETS,after.PRESETS);
  for(const p of before.PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive']){
    const c={...before.fromPreset(p),filter};
    const a=before.synthesize(c,10),b=after.synthesize(c,10);
    assert.deepEqual(b.leadingQrs,a.leadingQrs,'Clipped QRS provenance must match the frozen warm-up calendar');
    if(c.rhythm==='torsades') assertTraceContract(a,b,`${p.id}/${filter}: independently predicted T frame`,1e-12);
    else assertExactSignal(a,b,`${p.id}/${filter}: legacy samples, events, truth and warnings must remain exact`);
    defaults.push({preset:p.id,filter,exact:c.conduction!=='wpw'&&c.rhythm!=='torsades'&&c.rhythm!=='af',predictedWpwSupport:c.conduction==='wpw',predictedWpwRepolarization:c.conduction==='wpw',predictedAfClock:c.rhythm==='af',predictedTorsadesFrame:c.rhythm==='torsades'});
  }
  assert.equal(defaults.length,244);
  assert.throws(()=>assertLbbbRegionalSamples(before),/Source-area drift/,'Historical global stretching must fail the regional integral contract');
  const regional=assertRegionalSampleContract(after),lbbbRegional=assertLbbbRegionalSamples(after);
  const report={schemaVersion:1,referencePreparation,baselineCommit:BASE,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    clinicalValidation:false,defaults,regional,lbbbRegional,limitations:['Experimental temporal bases, not clinical calibration or anatomical activation mapping.','Default samples remain exact against the QT-initialization prediction; This source-only comparison does not assess the separately revised detector.']};

  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({referencePreparation,defaultsExact:defaults.filter(r=>r.exact).length,predictedAfClock:defaults.filter(r=>r.predictedAfClock).length,predictedTorsades:defaults.filter(r=>r.predictedTorsadesFrame).length,...regional,lbbbRegional}));
} finally {await rm(temp,{recursive:true,force:true});}
