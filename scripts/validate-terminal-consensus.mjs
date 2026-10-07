/** Reproduce numerical T/QT changes against the last released analyzer on identical samples. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadLudb,fourLeadWaveReference} from '../tests/reference/ludb/load-ludb.mjs';
import {assessRecord,poolRecords,errors} from './lib/ludb-frozen-baseline.mjs';
const arg=key=>{const i=process.argv.indexOf(key);assert.ok(i>=0&&process.argv[i+1],key);return resolve(process.argv[i+1]);};
const out=arg('--output'),baseline=arg('--baseline');mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sources={};
const load=async(root,name)=>{
 const file=resolve(out,name+'.mjs'),result=await build({entryPoints:[resolve(root,'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
 assert.ok(!Object.keys(result.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Reference leakage');
 sources[name]=Object.fromEntries(Object.keys(result.metafile.inputs).map(f=>[relative(root,resolve(f)),hash(readFileSync(f))]));
 return(await import(pathToFileURL(file))).analyzeSamples;
};
const before=await load(baseline,'before'),after=await load(process.cwd(),'after');
const protocol=JSON.parse(readFileSync('tests/reference/ludb-delineation/protocol.json'));
const prospective=process.argv.includes('--prospective'),frozen=prospective?JSON.parse(readFileSync('docs/terminal-consensus-prospective-protocol.json')):null;
if(frozen)for(const[file,sha]of Object.entries({...frozen.algorithmFiles,...frozen.evaluatorFiles}))assert.equal(hash(readFileSync(file)),sha,'Frozen source drift: '+file);
const cohorts=prospective?[['prospective32','terminal-consensus-v1',arg('--prospective')]]:[
 ['original40','expansion',arg('--original')],['calibration40','delineation-calibration',arg('--calibration')],['exposed-v1-40','qt-reconciliation-v1',arg('--exposed-v1')],
];
const records=[];
for(const[cohort,split,root]of cohorts){
 const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json')));
 if(frozen){assert.deepEqual(manifest.records.map(r=>+r.record).sort((a,b)=>a-b),frozen.cohort.records);assert.equal(manifest.protocolSha256,hash(readFileSync('docs/terminal-consensus-prospective-protocol.json')));}
 for(const entry of manifest.records){
  const{signal,metadata}=loadLudb(root,split,+entry.record);
  const physical=()=>hash(Buffer.concat(Object.values(signal.leads).map(x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength))));
  const digest=physical(),a=before(signal),b=after(signal);assert.equal(physical(),digest,'Sample mutation');
  assert.deepEqual(a.detectedPeaks,b.detectedPeaks,'Changed ventricular detection');assert.equal(a.beats.length,b.beats.length,'Changed beat population');
  for(let i=0;i<a.beats.length;i++){
   const nonterminal=beat=>Object.fromEntries(Object.entries(beat).filter(([key])=>!['tPeak','tEnd','tTangentEnd','qt'].includes(key)));
   assert.deepEqual(nonterminal(a.beats[i]),nonterminal(b.beats[i]),'Changed nonterminal boundary');
   if(b.beats[i].qt!==null)assert.ok(Math.abs(b.beats[i].qt-(b.beats[i].tEnd-b.beats[i].onset)*1000)<1e-8);
  }
  for(const key of['hr','instantHr','pr','qrs','axis','pAxis','rr'])assert.equal(a[key],b[key],'Changed '+key);
  for(const key of['hr','qrs','axis'])assert.deepEqual(a.evidence[key],b.evidence[key],'Changed '+key+' confidence');
  assert.ok(b.evidence.qt.status!=='usable'||b.evidence.qrs.status==='usable','QT promoted above its QRS boundaries');
  const refs=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
  records.push({id:+entry.record,cohort,physicalSamplesSha256:digest,measurements:{before:a,after:b},before:assessRecord(signal,refs,()=>a,protocol),after:assessRecord(signal,refs,()=>b,protocol)});
 }
}
const summary=Object.fromEntries(['before','after'].map(side=>[side,poolRecords(records.map(r=>r[side]))]));
const paired=records.filter(r=>r.before.intervals.qt.errorMs!==null&&r.after.intervals.qt.errorMs!==null);
const comparison={samePopulation:{before:errors(paired.map(r=>r.before.intervals.qt.errorMs)),after:errors(paired.map(r=>r.after.intervals.qt.errorMs))},
 newlyAvailable:errors(records.filter(r=>r.before.intervals.qt.errorMs===null&&r.after.intervals.qt.errorMs!==null).map(r=>r.after.intervals.qt.errorMs)),
 lost:records.filter(r=>r.before.intervals.qt.errorMs!==null&&r.after.intervals.qt.errorMs===null).map(r=>({id:r.id,cohort:r.cohort,errorMs:r.before.intervals.qt.errorMs})),
 worse:paired.filter(r=>Math.abs(r.after.intervals.qt.errorMs)>Math.abs(r.before.intervals.qt.errorMs)+1e-8).map(r=>({id:r.id,cohort:r.cohort,before:r.before.intervals.qt.errorMs,after:r.after.intervals.qt.errorMs})),
};
let outcome=null;
if(frozen){const t=frozen.engineeringTargets,q=summary.after.intervals.qt,w=summary.after.waves.T.endpoint.offset;outcome={
 paired:comparison.samePopulation.after.n>=t.minimumPaired&&comparison.samePopulation.after.maeMs<=comparison.samePopulation.before.maeMs,
 coverage:q.numericWithReference>=summary.before.intervals.qt.numericWithReference&&q.coverageOfEligible>=t.minimumQtCoverage,
 qt:q.errors.maeMs<=t.qt.maeMs&&q.errors.p95AbsMs<=t.qt.p95Ms&&q.errors.maxAbsMs<=t.qt.maxMs,
 usable:q.usableErrors.n>=t.minimumUsable&&q.usableErrors.maxAbsMs<=t.maximumUsableQtErrorMs,
 terminal:w.maeMs<=t.terminal.maeMs&&w.p95AbsMs<=t.terminal.p95Ms&&w.maxAbsMs<=t.terminal.maxMs&&w.coverageOfEligible>=t.minimumTerminalCoverage,
 };}
const report={schemaVersion:1,clinicalValidation:false,role:prospective?'Prospectively frozen same-dataset evaluation; exposed after execution, never retune this candidate':'Exposed development comparison; not holdout evidence',sources,
 baselineCommit:execFileSync('git',['-C',baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),comparison,summary,outcome,records};
writeFileSync(resolve(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({qtBefore:summary.before.intervals.qt,qtAfter:summary.after.intervals.qt,terminalBefore:summary.before.waves.T.endpoint.offset,terminalAfter:summary.after.waves.T.endpoint.offset,comparison,outcome}));
if(frozen)assert.ok(Object.values(outcome).every(Boolean),'Frozen acceptance failed; retain all outcomes and do not retune this candidate');
