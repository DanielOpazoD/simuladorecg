/** Offline, sample-based morphology from original human-annotated ECGs.
 * No synthetic labels, detector estimates or vendor median amplitudes are used. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {loadLudb} from '../tests/reference/ludb/load-ludb.mjs';
import {sourceScaleEvidence} from './lib/source-scale.mjs';
const arg=k=>{const i=process.argv.indexOf(k);assert.ok(i>=0&&process.argv[i+1],k);return resolve(process.argv[i+1])};
const out=arg('--output');mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const bundle=resolve(out,'extractor.mjs');
const built=await build({entryPoints:['tests/support/annotated-morphology.ts'],bundle:true,platform:'node',format:'esm',metafile:true,outfile:bundle});
assert.ok(!Object.keys(built.metafile.inputs).some(f=>f.startsWith('src/')),'Reference extraction must not import the model or detector');
const {annotatedMorphology}=await import(pathToFileURL(bundle));
const metricNames=['tFwhmMs','tSymmetry','tToQrs'];
const blockedMetrics=['qrsPeakToPeakMv','tPeakMv','tSignedAreaMvS','tAbsoluteAreaMvS','jMv','j60Mv'];
const summary=values=>{
 const a=values.filter(x=>x!==null);assert.ok(a.every(Number.isFinite));a.sort((x,y)=>x-y);
 const q=p=>{if(!a.length)return null;const at=(a.length-1)*p,i=Math.floor(at);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(at-i)};
 return {available:a.length,missing:values.length-a.length,total:values.length,p05:q(.05),median:q(.5),p95:q(.95)};
};
const cohorts=[],allRecords=[],seen=new Set();
for(const [name,root,protocolFile,split,key] of [
 ['original40',arg('--original'),'tests/reference/ludb-expansion/protocol.json','expansion',null],
 ['calibration40',arg('--calibration'),'tests/reference/ludb-delineation/protocol.json','delineation-calibration','calibration']]){
 const protocolBytes=readFileSync(protocolFile),protocol=JSON.parse(protocolBytes),ids=key?protocol[key].records:protocol.records;
 const manifestBytes=readFileSync(resolve(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.protocolSha256,hash(protocolBytes));assert.deepEqual(manifest.records.map(x=>+x.record).sort((a,b)=>a-b),ids);
 assert.ok(manifest.records.every(r=>r.split===split));assert.equal(ids.length,40);
 const records=[];
 for(const id of ids){
  assert.ok(!seen.has(id),'Duplicate record between cohorts');seen.add(id);
  const {signal,metadata}=loadLudb(root,split,id);assert.equal(signal.fs,500);assert.equal(Object.keys(signal.leads).length,12);
  const raw=readFileSync(resolve(root,split,metadata.signalFile));
  assert.equal(hash(raw),metadata.sourceFiles.find(f=>f.path===metadata.signalFile).sha256);
  const digital=Object.fromEntries(metadata.channels.map((c,k)=>[c.lead,Array.from({length:metadata.samples},(_,i)=>raw.readInt16LE((i*metadata.channels.length+k)*2))]));
  const calibration=Object.fromEntries(metadata.channels.map(c=>[c.lead,{gain:c.adcGain,baseline:c.baseline}]));
  const sourceScale=sourceScaleEvidence(digital,calibration);
  const leads={};
  for(const [lead,samples] of Object.entries(signal.leads)){
   const rows=annotatedMorphology(samples,signal.fs,metadata.annotations[lead]);
   const metrics=Object.fromEntries(metricNames.map(metric=>[metric,summary(rows.map(r=>metric==='qrsPeakToPeakMv'?r.qrsPeakToPeakMv:metric==='j60BeforeTMv'?(r.j60Context==='before-T'?r.metrics?.j60Mv??null:null):r.metrics?.[metric]??null))]));
   const reasons={};for(const row of rows)reasons[row.reason??'annotated-windows-admitted']=(reasons[row.reason??'annotated-windows-admitted']??0)+1;
   leads[lead]={annotatedQrs:rows.length,admittedWindows:rows.filter(r=>r.metrics!==null).length,reasons,
    j60Contexts:Object.fromEntries(['before-T','inside-T','after-T','unavailable'].map(c=>[c,rows.filter(r=>(r.j60Context??'unavailable')===c).length])),metrics};
   writeFileSync(resolve(out,`${name}-${id}-${lead}.json`),JSON.stringify({record:id,lead,absoluteAmplitudeEligible:false,voltageMeaning:'Header-declared values, not established clinical mV',rows},null,2)+'\n');
  }
  const record={id,cohort:name,sourceScale,physicalSamplesSha256:hash(Buffer.concat(Object.values(signal.leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)))),leads};
  records.push(record);allRecords.push(record);
 }
 cohorts.push({name,fixtureManifestSha256:hash(manifestBytes),protocolSha256:hash(protocolBytes),records:records.length});
}
const leadNames=Object.keys(allRecords[0].leads);
const recordBalanced=Object.fromEntries(leadNames.map(lead=>[lead,Object.fromEntries(metricNames.map(metric=>[metric,summary(allRecords.map(r=>r.leads[lead].metrics[metric].median))]))]));
const report={schemaVersion:1,role:'Observed reference morphology across heterogeneous original ECGs, not normal ranges or diagnostic targets',cohorts,
 units:{duration:'ms',ratios:'dimensionless'},
 absoluteAmplitudeReference:{eligible:false,blockedMetrics,reason:'LUDB header gains track digital channel range; reader arithmetic agreement does not establish original physical voltage. No inferred rescaling.'},
 sourceHashes:Object.fromEntries([...Object.keys(built.metafile.inputs),'scripts/lib/source-scale.mjs','scripts/reference-annotated-morphology.mjs','tests/reference/ludb/load-ludb.mjs'].map(f=>[f,hash(readFileSync(f))])),records:allRecords,recordBalanced,
 clinicalValidation:false,generatorTuned:false,detectorUsed:false,reservedCohortUsed:false,
 limitations:['Each record contributes one median per lead/metric; beats are not independent patients.','A baseline free of annotated overlap is not proven isoelectric or noise-free.','Ambiguous and missing windows retain explicit denominators.','J+60 inside or after T is not pooled as an ST-only reference.','Human annotations are per lead, not global boundaries.','LUDB absolute voltage and 12SL median-unit conflicts remain quarantined; no inferred conversion is used.','Heterogeneous ECG distributions must not be taught as normal ranges.']};
writeFileSync(resolve(out,'annotated-morphology-reference.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({records:allRecords.length,leadRecords:allRecords.length*12,annotatedQrs:allRecords.reduce((n,r)=>n+Object.values(r.leads).reduce((n,l)=>n+l.annotatedQrs,0),0),admittedWindows:allRecords.reduce((n,r)=>n+Object.values(r.leads).reduce((n,l)=>n+l.admittedWindows,0),0),clinicalValidation:false}));
