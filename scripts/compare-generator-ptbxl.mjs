/** Descriptive bridge from the existing PTB-XL+ artifact to generator morphology.
 * No generator tuning, no diagnostic score, no analyzer. Uses only aggregate external summaries.
 */
import assert from'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';
const root=process.argv[2],out=process.argv[3];if(!root||!out)throw Error('Usage: node scripts/compare-generator-ptbxl.mjs PTBXL_OUTPUT OUT');
await mkdir(out,{recursive:true});const ext=JSON.parse(await readFile(path.join(root,'median-morphology.json'),'utf8')),gen=JSON.parse(await readFile(path.join(root,'generator-morphology.json'),'utf8'));
const groups=['NORM','MI','STTC'];const leads=['I','II','V1','V2','V3','V4','V5','V6'];const fields=['j60Mv','qrsPeakToPeakMv','tPeakMv','tFwhmMs','tToQrs'];
const regional=['inferior','inferior_lcx','anterior','lateral','posterior','diffuse','subendo','wellens_a','wellens_b','de_winter'];
const rows=[];for(const id of regional){const r=gen.records.find(x=>x.preset===id);assert.ok(r&&!r.unavailable,'Missing '+id);for(const lead of leads)for(const field of fields){const value=r.leads?.[lead]?.[field];if(!Number.isFinite(value))continue;const references={};for(const group of groups){const s=ext.distributions?.[group]?.[lead]?.[field];if(!s||!Number.isFinite(s.q25)||!Number.isFinite(s.q75))continue;const span=Math.max(1e-9,s.q75-s.q25);references[group]={n:s.n,q25:s.q25,median:s.median,q75:s.q75,robustDistanceIqr:value<s.q25?(s.q25-value)/span:value>s.q75?(value-s.q75)/span:0};}rows.push({preset:id,lead,field,value,references})}}
const summary={schemaVersion:1,role:'Development triage only; aggregate distributions are not paired truth or calibration targets',regionalPresets:regional.length,rows:rows.length,groups,fields,
 outliersByGroup:Object.fromEntries(groups.map(g=>[g,rows.filter(r=>r.references[g]?.robustDistanceIqr>1).length])),
 largestMI:[...rows].filter(r=>r.references.MI).sort((a,b)=>b.references.MI.robustDistanceIqr-a.references.MI.robustDistanceIqr).slice(0,30),
 limitations:['PTB-XL+ diagnostic groups overlap and are not acute occlusion adjudication.','External windows use 12SL automatic fiducials; generator windows use synthesis timing.','IQR distance is a triage descriptor, not a fidelity score.','No coefficient may be changed from this report alone.']};
await writeFile(path.join(out,'generator-ptbxl-gap.json'),JSON.stringify({summary,rows},null,2)+'\n');console.log(JSON.stringify(summary));
