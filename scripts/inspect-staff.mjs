/** Exploratory descriptors of preselected STAFF excerpts, NOT external accuracy.
 * Usage: node scripts/inspect-staff.mjs INPUT.json.gz OUTPUT.json
 * Uses the frozen detector only to propose windows; no annotations are inferred
 * from artery labels and no parameters are fitted. Keep every patient/abstention.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/inspect-staff.mjs INPUT.json.gz OUTPUT.json');
const bytes=await readFile(input), data=JSON.parse(gunzipSync(bytes)), tmp=await mkdtemp(path.join(tmpdir(),'ecg-staff-'));
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),k=Math.floor(s.length/2);return s.length%2?s[k]:(s[k-1]+s[k])/2;};
try{
 const bundle=path.join(tmp,'measure.mjs');
 await build({entryPoints:['src/engine/measure.ts'],bundle:true,platform:'node',format:'esm',outfile:bundle});
 const {measure}=await import(pathToFileURL(bundle).href), rows=[];
 for(const r of data.records){
  const segments={};
  for(const [kind,v] of Object.entries(r.segments)){
   if(v.units.some(u=>u!=='mV')||v.samples.some(a=>a.some(x=>!Number.isFinite(x))))throw new Error('Invalid physical samples');
   const leads=Object.fromEntries(v.leads.map((l,i)=>[l,Float64Array.from(v.samples[i])]));
   for(const [l,fn] of Object.entries({aVR:(a,b)=>-(a+b)/2,aVL:(a,b)=>a-b/2,aVF:(a,b)=>b-a/2}))leads[l]=Float64Array.from(leads.I,(a,i)=>fn(a,leads.II[i]));
   const m=measure({fs:v.fs,leads}), accepted=m.beats.filter(b=>b.onset>.5&&b.offset+.06<9.5);
   const descriptors={};
   for(const [lead,a] of Object.entries(leads)){
    const values=accepted.map(b=>{
     const base=median(Array.from(a.slice(Math.round((b.onset-.035)*v.fs),Math.round((b.onset-.020)*v.fs))));
     const j60=a[Math.round((b.offset+.06)*v.fs)]-base;
     const start=Math.ceil((b.offset+.06)*v.fs),end=b.tEnd===null?start:Math.floor(b.tEnd*v.fs);
     const rep=end>start?Array.from(a.slice(start,end)).map(x=>x-base):[];
     const peak=rep.length?rep.reduce((p,x)=>Math.abs(x)>Math.abs(p)?x:p,0):null;
     return {onset:b.onset,offset:b.offset,tEnd:b.tEnd,baselineMv:base,j60EstimatedMv:j60,postJ60PeakMv:peak};
    });
    descriptors[lead]={count:values.length,j60EstimatedMv:median(values.map(x=>x.j60EstimatedMv)),postJ60PeakMv:median(values.flatMap(x=>x.postJ60PeakMv===null?[]:[x.postJ60PeakMv])),beats:values};
   }
   segments[kind]={record:v.record,sourceSha256:v.sha256,estimatedHr:m.hr,proposedComplexes:m.detectedPeaks.length,acceptedWindows:accepted.length,descriptors};
  }
  const delta={};
  for(const l of Object.keys(segments.baseline.descriptors)){
   const a=segments.baseline.descriptors[l],b=segments.inflation.descriptors[l];
   delta[l]={j60EstimatedMv:a.j60EstimatedMv===null||b.j60EstimatedMv===null?null:b.j60EstimatedMv-a.j60EstimatedMv,postJ60PeakMv:a.postJ60PeakMv===null||b.postJ60PeakMv===null?null:b.postJ60PeakMv-a.postJ60PeakMv};
  }
  rows.push({patient:r.patient,artery:r.artery,segments,delta});
 }
 await mkdir(path.dirname(path.resolve(output)),{recursive:true});
 await writeFile(output,JSON.stringify({source:data.source,license:data.license,inputSha256:createHash('sha256').update(bytes).digest('hex'),selection:data.selection,reservedPatientsNotDownloaded:data.reservedPatientsNotDownloaded,scope:'Exploratory only. PR baseline and J/T bounds proposed by frozen product detector, not expert annotations. Post-J60 peak is not an isolated T measurement. No clinical validity, fitted profiles or error/sensitivity estimates.',rows},null,2));
 console.log(JSON.stringify({patients:rows.length,windows:rows.flatMap(r=>Object.entries(r.segments).map(([phase,s])=>({patient:r.patient,phase,proposed:s.proposedComplexes,accepted:s.acceptedWindows})))}));
}finally{await rm(tmp,{recursive:true,force:true});}
