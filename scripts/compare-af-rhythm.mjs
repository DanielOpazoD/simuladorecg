/** Descriptive comparison, never an optimizer or a clinical acceptance threshold. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const input=process.argv[2],output=process.argv[3];
assert.ok(input&&output,'Usage: compare-af-rhythm.mjs REFERENCE_JSON OUTPUT_JSON');
const bytes=await readFile(input),reference=JSON.parse(bytes);
const temp=await mkdtemp(path.join(tmpdir(),'ecg-af-compare-'));
const summarize=(values)=>{const a=[...values].sort((a,b)=>a-b);assert.ok(a.length&&a.every(Number.isFinite),'No finite comparison windows');const q=p=>{const k=(a.length-1)*p,i=Math.floor(k);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(k-i);};return {n:a.length,p05:q(.05),median:q(.5),p95:q(.95)};};
try {
 const entry=path.join(temp,'events.mjs');
 await build({stdin:{contents:"export {generateEvents} from './src/engine/rhythm';export {DEFAULT_CASE,cloneCase} from './src/engine/types';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:entry});
 const {generateEvents,DEFAULT_CASE,cloneCase}=await import(pathToFileURL(entry).href);
 const rows=reference.records.map(record=>{
  if(!record.windows.length)return {record:record.record,status:'no-full-windows',afEpisodes:record.afEpisodes.length};
  const meanRR=record.windows.reduce((s,w)=>s+w.meanSeconds,0)/record.windows.length;
  const hr=60/meanRR,synthetic=[];
  for(let seed=1;seed<=100;seed++){
   const c={...cloneCase(DEFAULT_CASE),rhythm:'af',hr,seed};
   const times=generateEvents(c,64).beats.filter(b=>b.time>=4).map(b=>b.time);
   const rr=times.slice(1).map((t,i)=>t-times[i]),mean=rr.reduce((s,v)=>s+v,0)/rr.length;
   const sd=Math.sqrt(rr.reduce((s,v)=>s+(v-mean)**2,0)/rr.length);
   // Exact clipping endpoint; epsilon covers subtraction of accumulated times only.
   const boundaryHits=rr.filter(x=>Math.abs(x-.38*60/hr)<1e-10||Math.abs(x-2.15*60/hr)<1e-10).length;
   synthetic.push({cv:sd/mean,rateFromMeanRR:60/mean,boundaryFraction:boundaryHits/rr.length});
  }
  return {record:record.record,status:'descriptive-only',requestedRate:hr,
   external:{windows:record.windows.length,cv:summarize(record.windows.map(w=>w.cv)),rate:summarize(record.windows.map(w=>w.rateFromMeanRR))},
   synthetic:{windows:synthetic.length,seeds:'1..100',cv:summarize(synthetic.map(w=>w.cv)),rate:summarize(synthetic.map(w=>w.rateFromMeanRR)),clippingFraction:summarize(synthetic.map(w=>w.boundaryFraction))}};
 });
 assert.ok(rows.some(r=>r.status==='descriptive-only'),'No comparable AF records');
 await writeFile(output,JSON.stringify({sourceSha256:createHash('sha256').update(bytes).digest('hex'),rows,
  limitations:['Windows within a record are not independent patients. Only the available corrected annotation cohort is used.',
  'Rate matching is for descriptive comparison, not fitting parameters; RR variability is not universal.',
  'No waveform morphology, automatic ECG detection or clinical validation is assessed.'],fittedParameters:false},null,2)+'\n');
 console.log(JSON.stringify(rows));
}finally{await rm(temp,{recursive:true,force:true});}
