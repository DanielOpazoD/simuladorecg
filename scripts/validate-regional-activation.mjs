/** Frozen PR55 source versus candidate: defaults exact; opt-in samples causal. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assertRegionalSampleContract} from './lib/regional-activation-contract.mjs';
const BASE='0df1527edb4a3cb5ff95bc4b88305a5b40372e20';
const output=process.argv[2];assert.ok(output,'Usage: validate-regional-activation.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'ecg-regional-activation-'));
try {
  const base=path.join(temp,'baseline');await mkdir(base);
  execFileSync('tar',['-xf','-','-C',base],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
  const load=async(dir,name)=>{const outfile=path.join(temp,name+'.mjs');
    await build({stdin:{contents:"export {synthesize} from './src/engine/signal'; export {PRESETS,fromPreset,presetById} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
    return import(pathToFileURL(outfile).href);
  };
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),defaults=[];
  assert.deepEqual(before.PRESETS,after.PRESETS,'No new or relabelled presets');
  for(const p of before.PRESETS.filter(p=>p.strategy!=='pending'))for(const filter of ['off','diagnostic','monitor','aggressive']){
    const c={...before.fromPreset(p),filter};
    const a=before.synthesize(c,10),b=after.synthesize(c,10);
    assert.deepEqual(b,a,`${p.id}/${filter}: legacy samples, events, truth and warnings must remain exact`);
    defaults.push({preset:p.id,filter,exact:true});
  }
  assert.equal(defaults.length,244);
  const regional=assertRegionalSampleContract(after);
  const report={schemaVersion:1,baselineCommit:BASE,candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    clinicalValidation:false,defaults,regional,limitations:['Experimental temporal bases, not clinical calibration or anatomical activation mapping.','Default signals and detector remain unchanged.']};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({defaultsExact:defaults.length,...regional}));
} finally {await rm(temp,{recursive:true,force:true});}
