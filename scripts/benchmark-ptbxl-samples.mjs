/** Same sample extractor for external medians and model output; different window oracles.
 * Does not call measure(), auditMeasurement() or tune the generator. No clinical thresholds.
 */
import { build } from 'esbuild';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { MORPHOLOGY_LEADS, vendorWindows, sampledMorphology, linearSummary } from './lib/ptbxl-morphology.mjs';
const root=process.cwd(),output=process.argv[2];
if(!output)throw new Error('Usage: node scripts/benchmark-ptbxl-samples.mjs OUTPUT_DIRECTORY');
const temp=await mkdtemp(path.join(tmpdir(),'ptbxl-morphology-'));
const write=(name,data)=>writeFile(path.join(output,name),JSON.stringify(data,null,2)+'\n');
try {
  const bundled=path.join(temp,'metrics.mjs');
  const result=await build({stdin:{contents:`export {synthesize} from './src/engine/signal'; export {PRESETS,fromPreset} from './src/presets/catalog'; export {morphologyMetrics,sampleAt} from './tests/support/morphology-metrics';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:bundled,metafile:true});
  assert.ok(!Object.keys(result.metafile.inputs).some(p=>p.includes('measure.ts')||p.includes('/analysis/')),'Benchmark imports analyzer');
  const {synthesize,PRESETS,fromPreset,morphologyMetrics,sampleAt}=await import(pathToFileURL(bundled).href);
  const source=JSON.parse(await readFile(path.join(output,'median-beats.json'),'utf8'));
  const records=source.records.map(r=>{
    try {const windows=vendorWindows(r.fiducialsMs);
      return {ecg_id:r.ecg_id,groups:r.groups,windows,windowSource:r.windowSource,
        ...sampledMorphology(r,windows,morphologyMetrics,sampleAt)};
    }catch(e){return {ecg_id:r.ecg_id,groups:r.groups,unavailable:String(e.message)};}
  });
  const fields=['jMv','j60Mv','qrsPeakToPeakMv','qrsPositivePeakMv','qrsNegativePeakMagnitudeMv','tPeakMv','tSignedAreaMvS','tFwhmMs','tSymmetry','tToQrs'];
  const groups=['ALL','NORM','MI','STTC','CD','HYP'];
  const distributions=Object.fromEntries(groups.map(group=> {
    const selected=records.filter(r=>r.groups.includes(group));
    return [group,Object.fromEntries(MORPHOLOGY_LEADS.map(l=>[l,Object.fromEntries(fields.map(f=>[f,linearSummary(selected.map(r=>r.leads?.[l]?.[f]))]))]))];
  }));
  await write('median-morphology.json',{requested:source.requested,sourceStatuses:source.statuses,
    records,distributions,windowOracle:'12SL automatic fiducials; not clinical truth',
    denominator:'Distribution total counts decoded records in group; sourceStatuses also reports missing medians. No imputation.'});
  const generated=[];
  for(const preset of PRESETS.filter(p=>p.strategy!=='pending')) {
    const c=fromPreset(preset); c.filter='off';c.notch=0;
    Object.assign(c.artifacts,{baseline:0,muscle:0,mains:0,loose:0,reversed:false});
    const signal=synthesize(c,10), b=signal.events.beats.find(b=>b.time>3&&b.time<6);
    if(!b||!(b.qt>0)) {generated.push({preset:preset.id,unavailable:'No complete ventricular cycle'});continue;}
    const on=b.time,off=on+b.qrs,tOff=on+b.qt;
    // Native parametric T support, not independently delineated. May include residual ST.
    const tOn=tOff-Math.min(.22,(b.qt-b.qrs)*.68);
    const windows={baseline:[on-.035,on-.020],qrs:[on,off],t:[tOn,tOff]};
    generated.push({preset:preset.id,filter:'off',windowSource:'Synthetic event timings, not independent delineation; T window follows the declared synthesis support',
      windows,...sampledMorphology(signal,windows,morphologyMetrics,sampleAt)});
  }
  await write('generator-morphology.json',{records:generated,analyzerUsed:false,
    comparability:'Same sample metrics, different window definitions. One exemplar per preset, not population distributions or paired clinical error. No calibration/tuning.'});
  await write('sample-extractor-provenance.json',{inputs:Object.keys(result.metafile.inputs),analyzerUsed:false});
  console.log(JSON.stringify({externalDecoded:records.length,externalWindowUnavailable:records.filter(r=>r.unavailable).length,generated:generated.length,analyzerUsed:false}));
} finally {await rm(temp,{recursive:true,force:true});}
