/** Frozen candidate vs old clipped clock; record-weighted, not a clinical validation. */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [input,output]=process.argv.slice(2);if(!output)throw Error('Usage: compare-af-renewal.mjs REFERENCE OUTPUT');
const bytes=await readFile(input),reference=JSON.parse(bytes),protocol=reference.protocol;
assert.ok(['development','evaluation'].includes(reference.role),'Unknown reference role');
assert.deepEqual(reference.records.map(r=>r.record),protocol[reference.role+'Records'],'Record selection changed');
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(await readFile('src/engine/af-rr.ts')),protocol.frozenCandidate.sourceSha256,'Candidate changed after freeze');
const temp=await mkdtemp(path.join(tmpdir(),'af-renewal-'));
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length;}
function median(a){const b=a.slice().sort((x,y)=>x-y),i=(b.length-1)/2;return(b[Math.floor(i)]+b[Math.ceil(i)])/2;}
function summary(rr){const m=mean(rr),q=rr.map(x=>x/m).sort((a,b)=>a-b);const quant=p=>{const x=(q.length-1)*p,i=Math.floor(x);return q[i]+(q[Math.min(i+1,q.length-1)]-q[i])*(x-i)};const a=rr.slice(0,-1),b=rr.slice(1),ma=mean(a),mb=mean(b),cov=a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0),v1=a.reduce((s,x)=>s+(x-ma)**2,0),v2=b.reduce((s,x)=>s+(x-mb)**2,0);return{cv:Math.sqrt(mean(rr.map(x=>(x-m)**2)))/m,quantiles:[quant(.05),quant(.5),quant(.95)],lag1:cov/Math.sqrt(v1*v2)};}
try{
 const outfile=path.join(temp,'samplers.mjs');await build({stdin:{contents:"export {afInterval} from './src/engine/af-rr';export {random,normal} from './src/engine/random';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile});
 const {afInterval,random,normal}=await import(pathToFileURL(outfile));
 const draw=(r,base,next)=>{let time=.35;const rr=[];while(time<60){const value=next(r,base);time+=value;if(time<60)rr.push(value);}return summary(rr)};
 const old=(r,base)=>base*Math.max(.38,Math.min(2.15,.8+Math.exp(.42*normal(r))*.2+.38*normal(r)));
 const rows=[];
 for(const record of reference.records){
  const ref=record.summary;if(!ref.windows)continue;
  const models={};
  for(const [name,next] of [['oldClipped',old],['gammaCandidate',afInterval]]){
   const reps=Array.from({length:100},(_,seed)=>draw(random(seed+101),60/ref.medianRate,next));
   models[name]={cv:median(reps.map(x=>x.cv)),quantiles:[0,1,2].map(i=>median(reps.map(x=>x.quantiles[i]))),lag1:median(reps.map(x=>x.lag1))};
   models[name].cvError=Math.abs(models[name].cv-ref.medianCV);
   models[name].quantileErrors=[0,2].map(i=>Math.abs(models[name].quantiles[i]-ref.medianNormalizedQuantiles[i]));
  }
  rows.push({record:record.record,reference:ref,models});
 }
 assert.ok(rows.length>0,'No eligible AF reference windows');
 const aggregate=name=>({cvMAE:mean(rows.map(r=>r.models[name].cvError)),q05MAE:mean(rows.map(r=>r.models[name].quantileErrors[0])),q95MAE:mean(rows.map(r=>r.models[name].quantileErrors[1]))});
 const before=aggregate('oldClipped'),after=aggregate('gammaCandidate');
 const regressions=rows.flatMap(r=>r.models.gammaCandidate.quantileErrors.map((x,i)=>({record:r.record,quantile:i===0?.05:.95,worsening:x-r.models.oldClipped.quantileErrors[i]})).filter(x=>x.worsening>.02));
 const result={role:reference.role,records:rows.length,before,after,primaryImproved:after.cvMAE<before.cvMAE,minimumRecordsMet:rows.length>=5,quantileRegressions:regressions,rows,referenceSha256:hash(bytes),candidateSha256:protocol.frozenCandidate.sourceSha256,clinicalValidation:false,scope:'Interval primitive only; no waveform, AV physiology, patient independence or serial-dependence validation'};
 await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,rows:undefined}));
 assert.ok(result.minimumRecordsMet,'Insufficient records for the fixed comparison');
 assert.ok(result.primaryImproved,'Registered primary CV criterion failed');
}finally{await rm(temp,{recursive:true,force:true});}
