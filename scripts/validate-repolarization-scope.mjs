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
  const base=path.join(temp,'baseline');await mkdir(base);
  execFileSync('tar',['-xf','-','-C',base],{input:execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024})});
  const changedFiles=execFileSync('git',['diff','--name-only',BASE,'HEAD','--','src/engine','src/presets','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const nonNumericalContracts=['src/engine/ventricular-trajectory.ts'];
  assert.ok(changedFiles.every(f=>nonNumericalContracts.includes(f) || (coherence && ['src/engine/signal.ts','src/engine/morphology.ts','src/engine/secondary-repolarization.ts'].includes(f))), 'Unexpected generator/analyzer/catalog/dependency change');
  async function load(dir,name){
    const outfile=path.join(temp,name+'.mjs');
    await build({stdin:{contents:"export {synthesize} from './src/engine/signal'; export {fromPreset,PRESETS} from './src/presets/catalog';",resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
    return import(pathToFileURL(outfile).href);
  }
  const before=await load(base,'before'),after=await load(process.cwd(),'after'),rows=[],matrix=[];
  let expected=before;
  if(coherence){
    const predicted=path.join(temp,'prediction');await cp(base,predicted,{recursive:true});
    const file=path.join(predicted,'src/engine/signal.ts');
    await writeFile(file,predictSource(await readFile(file,'utf8')));
    expected=await load(predicted,'expected');
  }
  assert.deepEqual(after.PRESETS,before.PRESETS,'Catalog must stay frozen');
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
        if(coherence)assertTraceContract(before.synthesize(c,10),after.synthesize(c,10),label+'/default-frozen');
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
    candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changedFiles,
    clinicalValidation:false,scenarios:rows.length,sampleComparisons:rows.reduce((n,r)=>n+r.checked,0),rows,matrix,
    limitations:['The b744caca baseline has absent secondary ST and bypassed T modifiers; it is not clinical truth.',
      'Coherence mode predicts the stated mathematical intervention, not physiological accuracy. No new patient data or holdout.']};
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined,matrix:matrix.length}));
} finally {await rm(temp,{recursive:true,force:true});}
