import {assertTeachingCatalogRevision} from './lib/teaching-scope-revision.mjs';
import {predictWpwSupport} from './lib/wpw-support-prediction.mjs';
import {predictAfClock,assertFrozenAfSampler} from './lib/af-clock-prediction.mjs';
import {predictTorsadesFrame} from './lib/torsades-frame-prediction.mjs';
import {assertTraceContract} from '../tests/support/repolarization-contract.mjs';
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
  await writeFile(signalFile,predictWpwSupport(predictTorsadesFrame(await readFile(signalFile,'utf8'))));
  const rhythmFile=path.join(base,'src/engine/rhythm.ts');
  await writeFile(rhythmFile,predictAfClock(await readFile(rhythmFile,'utf8')));
  const referencePreparation='PR55 with independent QT initialization plus torsades-frame, compact WPW support and representative AF-clock predictions; unrelated defaults remain exact';
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),defaults=[];
  assertTeachingCatalogRevision(before.PRESETS,after.PRESETS);
  for(const p of before.PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive']){
    const c={...before.fromPreset(p),filter};
    const a=before.synthesize(c,10),b=after.synthesize(c,10);
    if(c.rhythm==='torsades') assertTraceContract(a,b,`${p.id}/${filter}: independently predicted T frame`,1e-12);
    else assertExactSignal(a,b,`${p.id}/${filter}: legacy samples, events, truth and warnings must remain exact`);
    defaults.push({preset:p.id,filter,exact:c.conduction!=='wpw'&&c.rhythm!=='torsades'&&c.rhythm!=='af',predictedWpwSupport:c.conduction==='wpw',predictedAfClock:c.rhythm==='af',predictedTorsadesFrame:c.rhythm==='torsades'});
  }
  assert.equal(defaults.length,244);
  const regional=assertRegionalSampleContract(after);
  const report={schemaVersion:1,referencePreparation,baselineCommit:BASE,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    clinicalValidation:false,defaults,regional,limitations:['Experimental temporal bases, not clinical calibration or anatomical activation mapping.','Default samples remain exact against the QT-initialization prediction; detector unchanged.']};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({referencePreparation,defaultsExact:defaults.filter(r=>r.exact).length,predictedAfClock:defaults.filter(r=>r.predictedAfClock).length,predictedTorsades:defaults.filter(r=>r.predictedTorsadesFrame).length,...regional}));
} finally {await rm(temp,{recursive:true,force:true});}
