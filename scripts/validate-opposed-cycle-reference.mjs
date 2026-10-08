import {prepareConfidenceCounterfactual} from './lib/confidence-counterfactual.mjs';
/** Paired quality-only audit on the two already exposed LUDB cohorts.
 * Header voltage scaling is not calibration; numerical outputs must remain exact. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadLudb} from '../tests/reference/ludb/load-ludb.mjs';
import {OPPOSED_CYCLE_REVISION as revision,assertReviewedOpposedCycle,assertQualityOnlyRevision} from './lib/opposed-cycle-revision.mjs';
const arg=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],name);return path.resolve(process.argv[i+1]);};
const output=arg('--output'),original=arg('--original'),calibration=arg('--calibration');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=await mkdtemp(path.join(tmpdir(),'opposed-reference-'));
try{
 assertReviewedOpposedCycle(await readFile(revision.file));
 const baseline=path.join(temp,'baseline');
 const qualityCounterfactual=await prepareConfidenceCounterfactual(process.cwd(),baseline);
 const sourceHashes={};
 async function analyzer(root,label){
  const outfile=path.join(temp,label+'.mjs');
  const built=await build({entryPoints:[path.resolve(root,'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile});
  assert.ok(!Object.keys(built.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)));
  sourceHashes[label]=Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).map(async f=>[path.relative(root,path.resolve(f)),hash(await readFile(f))])));
  return (await import(pathToFileURL(outfile))).analyzeSamples;
 }
 const before=await analyzer(baseline,'before'),after=await analyzer(process.cwd(),'after'),rows=[];
 for(const [root,split,protocolFile] of [[original,'expansion','tests/reference/ludb-expansion/protocol.json'],[calibration,'delineation-calibration','tests/reference/ludb-delineation/protocol.json']]){
  const bytes=await readFile(protocolFile),protocol=JSON.parse(bytes),ids=protocol.records??protocol.calibration.records;
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json')));
  assert.equal(manifest.protocolSha256,hash(bytes));
  assert.deepEqual(manifest.records.map(r=>Number(r.record)).sort((a,b)=>a-b),ids);
  for(const id of ids){
   const {signal}=loadLudb(root,split,id),samples={fs:signal.fs,leads:signal.leads};
   const sampleHash=()=>hash(Buffer.concat(Object.values(signal.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength))));
   const initial=sampleHash(),b=before(samples),a=after(samples);assertQualityOnlyRevision(b,a);assert.equal(sampleHash(),initial);
   const changed=Object.keys(b.evidence).filter(k=>b.evidence[k].status!==a.evidence[k].status);
   rows.push({id,split,physicalSamplesSha256:initial,numericallyIdentical:true,hr:a.hr,before:b.evidence.hr.status,after:a.evidence.hr.status,changed});
  }
 }
 assert.equal(rows.length,80);
 const report={revision,qualityCounterfactual,sourceHashes,clinicalValidation:false,cohortRole:'Already exposed development/regression data, not independent patient validation',
  sourceScale:'Literal header conversion; LUDB absolute amplitude and cross-lead calibration remain quarantined',
  summary:{records:80,numericallyIdentical:rows.length,changedRecords:rows.filter(r=>r.changed.length).length,usableBefore:rows.filter(r=>r.before==='usable').length,usableAfter:rows.filter(r=>r.after==='usable').length},rows};
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}finally{await rm(temp,{recursive:true,force:true});}
