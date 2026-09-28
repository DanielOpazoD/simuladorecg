/** A01: exact comparison to an immutable source; known baseline defects are NOT endorsed. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assertTraceContract} from '../tests/support/repolarization-contract.mjs';
const BASE='b744caca103f0aeefcdb7ddfd98fd5fea9f08588';
const output=process.argv[2];
assert.ok(output && process.argv.length===3,'Usage: validate-repolarization-scope.mjs OUTPUT');
const temp=await mkdtemp(path.join(tmpdir(),'repolarization-scope-'));
try {
  const base=path.join(temp,'baseline');await mkdir(base);
  execFileSync('tar',['-xf','-','-C',base],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
  async function load(dir,name){
    const outfile=path.join(temp,name+'.mjs');
    await build({stdin:{contents:"export {synthesize} from './src/engine/signal'; export {fromPreset,PRESETS} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
    return import(pathToFileURL(outfile).href);
  }
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),rows=[];
  assert.deepEqual(after.PRESETS,before.PRESETS,'A01 cannot change the catalog');
  for(const preset of before.PRESETS.filter(p=>p.strategy!=='pending'))
    for(const filter of ['off','diagnostic','monitor','aggressive']) {
      const c={...before.fromPreset(preset),filter};
      const a=before.synthesize(c,10),b=after.synthesize(c,10);
      rows.push({preset:preset.id,filter,...assertTraceContract(a,b,`${preset.id}/${filter}`)});
    }
  assert.equal(rows.length,244);
  const report={schemaVersion:1,stage:'A01-characterization-only',baselineCommit:BASE,
    candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    clinicalValidation:false,scenarios:rows.length,sampleComparisons:rows.reduce((n,r)=>n+r.checked,0),rows,
    limitations:['Baseline has absent secondary ST and bypassed T modifiers. Exact preservation here does not endorse those defects.',
      'No new patient data or holdout; numerical software regression only.']};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined}));
} finally {await rm(temp,{recursive:true,force:true});}
