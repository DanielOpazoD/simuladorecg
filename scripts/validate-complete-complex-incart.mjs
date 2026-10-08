/** Frozen paired non-regression screen. Reference annotations never enter analysis. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {matchQrsEvents} from '../tests/reference/ludb/load-ludb.mjs';

const [dataRoot,output]=process.argv.slice(2);
assert.ok(dataRoot&&output,'Usage: validate-complete-complex-incart.mjs DATA_DIR OUTPUT');
const hash=b=>createHash('sha256').update(b).digest('hex');
const protocolBytes=await readFile('docs/complete-complex-incart-protocol.json'),p=JSON.parse(protocolBytes);
const manifestBytes=await readFile(path.join(dataRoot,'manifest.json')),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.protocolSha256,hash(protocolBytes));
const expected=p.dataset.records.flatMap(record=>p.dataset.segmentStartsSeconds.map(start=>[record,start]));
assert.equal(expected.length,p.dataset.expectedWindows);
assert.deepEqual(manifest.rows.map(r=>[r.record,r.startSeconds]),expected);
assert.ok(manifest.rows.every(r=>r.digitalAndPhysicalDecoderParity&&r.nativeReader==='WFDB 4.3.1'));
for(const [file,sha]of Object.entries(p.analyzerFiles))assert.equal(hash(await readFile(file)),sha,'Frozen algorithm changed: '+file);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','Dirty evaluated source');
const candidateCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const temp=await mkdtemp(path.join(tmpdir(),'incart-collision-'));
try{
 const baseline=path.join(temp,'baseline');await mkdir(baseline);
 execFileSync('tar',['-xf','-','-C',baseline],{input:execFileSync('git',['archive',p.baselineCommit],{maxBuffer:100*1024*1024})});
 const sourceHashes={};
 async function analyzer(root,label){
  const file=path.join(temp,label+'.mjs');const result=await build({entryPoints:[path.join(root,'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
  assert.ok(!Object.keys(result.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)),'Reference/model leakage');
  sourceHashes[label]=Object.fromEntries(await Promise.all(Object.keys(result.metafile.inputs).map(async f=>[path.relative(root,path.resolve(f)),hash(await readFile(f))])));
  return(await import(pathToFileURL(file))).analyzeSamples;
 }
 const before=await analyzer(baseline,'before'),after=await analyzer(process.cwd(),'after');
 assert.deepEqual(sourceHashes.after,p.analyzerFiles,'Unpinned dependency');
 const rows=[];
 for(const entry of manifest.rows){
  const bytes=await readFile(path.join(dataRoot,'fixtures',entry.file));assert.equal(hash(bytes),entry.fixtureSha256);
  const f=JSON.parse(bytes);assert.equal(f.record,entry.record);assert.equal(f.startSeconds,entry.startSeconds);
  assert.equal(f.fs,257);assert.deepEqual(Object.keys(f.leads).sort(),p.input.leads.slice().sort());
  const leads=Object.fromEntries(p.input.leads.map(name=>[name,Float64Array.from(f.leads[name])]));
  for(const a of Object.values(leads)){assert.equal(a.length,p.dataset.durationSeconds*f.fs);assert.ok(a.every(Number.isFinite));}
  for(const [i,a]of f.annotations.entries()){assert.ok(Number.isInteger(a.sample)&&a.sample>=0&&a.sample<10*f.fs);assert.ok(p.reference.beatSymbols.includes(a.symbol));if(i)assert.ok(a.sample>=f.annotations[i-1].sample);}
  const [lo,hi]=p.reference.windowSeconds;
  const reference=f.annotations.map(a=>a.sample/f.fs).filter(t=>t>=lo&&t<hi);
  const referenceHr=reference.length>=2?60*(reference.length-1)/(reference.at(-1)-reference[0]):null;
  const input={fs:f.fs,leads};
  const sampleHash=()=>hash(Buffer.concat(Object.values(leads).map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength))));
  const originalHash=sampleHash();
  const measurements={before:before(input),after:after(input)};assert.equal(sampleHash(),originalHash,'Acquired ECG mutated');
  const result={};
  for(const side of ['before','after']){
   const m=measurements[side];assert.ok(m.detectedPeaks.every((t,i)=>Number.isFinite(t)&&(!i||t>m.detectedPeaks[i-1])));
   const match=matchQrsEvents(reference,m.detectedPeaks.filter(t=>t>=lo&&t<hi),p.reference.eventMatchingToleranceSeconds);
   assert.equal(match.tp+match.fn,reference.length);
   const error=m.hr===null||referenceHr===null?null:m.hr-referenceHr;
   result[side]={tp:match.tp,fp:match.fp,fn:match.fn,hr:m.hr,status:m.evidence.hr.status,errorBpm:error,falselyUsable:m.evidence.hr.status==='usable'&&referenceHr!==null&&(error===null||Math.abs(error)>p.acceptance.hrErrorScreenBpm)};
  }
  rows.push({record:f.record,startSeconds:f.startSeconds,patientGroup:f.patientGroup,referenceHr,referenceCount:reference.length,...result,unchanged:isDeepStrictEqual(measurements.before,measurements.after),measurements});
 }
 const sum=(side,key)=>rows.reduce((n,r)=>n+r[side][key],0);
 const missed=rows.filter(r=>r.after.fn>r.before.fn),newFalseUsable=rows.filter(r=>r.after.falselyUsable&&!r.before.falselyUsable);
 const summary={windows:rows.length,recordings:p.dataset.records.length,patientGroups:manifest.patientGroups,unchangedWindows:rows.filter(r=>r.unchanged).length,changedWindows:rows.filter(r=>!r.unchanged).length,additionalMissedBeatWindows:missed.length,newFalselyUsableHrWindows:newFalseUsable.length,before:{tp:sum('before','tp'),fp:sum('before','fp'),fn:sum('before','fn'),falselyUsable:rows.filter(r=>r.before.falselyUsable).length},after:{tp:sum('after','tp'),fp:sum('after','fp'),fn:sum('after','fn'),falselyUsable:rows.filter(r=>r.after.falselyUsable).length}};
 const passed=rows.length===p.dataset.expectedWindows&&missed.length===0&&newFalseUsable.length===0&&summary.after.fp<=summary.before.fp;
 const report={status:passed?'pass':'fail',clinicalValidation:false,protocolSha256:hash(protocolBytes),manifestSha256:hash(manifestBytes),baselineCommit:p.baselineCommit,candidateCommit,sourceHashes,summary,rows,interpretation:p.interpretation};
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,summary}));assert.ok(passed,'Prespecified temporal non-regression screen failed; retain all outcomes');
}finally{await rm(temp,{recursive:true,force:true});}
