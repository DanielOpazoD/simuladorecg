/** Exact regression on 152 already exposed LUDB records. This does not create a
 * fresh holdout or replace the immutable terminal-consensus evaluation. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadLudb} from '../tests/reference/ludb/load-ludb.mjs';
const arg=key=>{const i=process.argv.indexOf(key);assert.ok(i>=0&&process.argv[i+1],key);return resolve(process.argv[i+1]);};
const out=arg('--output'),baseline=arg('--baseline');mkdirSync(out,{recursive:true});
const released='d208370f883b9f1d3a22c34db62d97daacb279c6';
assert.equal(execFileSync('git',['-C',baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),released);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sources={};
const load=async(root,name)=>{
 const file=resolve(out,name+'.mjs'),result=await build({entryPoints:[resolve(root,'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
 assert.ok(!Object.keys(result.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Reference leakage');
 sources[name]=Object.fromEntries(Object.keys(result.metafile.inputs).map(f=>[relative(root,resolve(f)),hash(readFileSync(f))]));
 return(await import(pathToFileURL(file))).analyzeSamples;
};
const before=await load(baseline,'before'),after=await load(process.cwd(),'after'),records=[],seen=new Set();
for(const [cohort,split,root,count] of [
 ['original40','expansion',arg('--original'),40],['calibration40','delineation-calibration',arg('--calibration'),40],
 ['exposed-v1-40','qt-reconciliation-v1',arg('--exposed-v1'),40],['exposed-consensus32','terminal-consensus-v1',arg('--consensus'),32],
]){
 const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json')));assert.equal(manifest.records.length,count);
 for(const entry of manifest.records){
  const id=+entry.record;assert.ok(!seen.has(id),'Repeated record');seen.add(id);
  const {signal}=loadLudb(root,split,id);
  const physical=()=>hash(Buffer.concat(Object.values(signal.leads).map(x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength))));
  const digest=physical(),a=before(signal);assert.equal(physical(),digest,'Baseline mutated samples');
  const b=after(signal);assert.equal(physical(),digest,'Candidate mutated samples');
  assert.deepEqual(b,a,`Current analyzer changed released measurements on exposed ${cohort}/${id}`);
  records.push({id,cohort,physicalSamplesSha256:digest,measurement:a,exact:true});
 }
}
assert.equal(records.length,152);
writeFileSync(resolve(out,'comparison.json'),JSON.stringify({schemaVersion:1,clinicalValidation:false,role:'Exposed exact regression; all fields, boundaries, confidence and populations',baselineCommit:released,sources,records},null,2)+'\n');
console.log(JSON.stringify({exposedRecords:records.length,allMeasurementsExact:true,clinicalValidation:false}));
