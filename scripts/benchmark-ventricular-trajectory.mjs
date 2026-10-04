import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const out=process.argv[2] ?? "docs/ventricular-trajectory-benchmark.json";
const temp=await mkdtemp(path.join(tmpdir(),"ecg-trajectory-bundle-"));
try {
  const entry=path.join(temp,"benchmark.mjs");
  await build({stdin:{contents:`
import { fromPreset, PRESETS } from "./src/presets/catalog";
import { qrsKernels } from "./src/engine/morphology";
import { ventricularSource } from "./src/engine/ventricular-source";
import { spatialQrsSummary, angularSeparation } from "./src/engine/ventricular-trajectory";
export function run(){
 return PRESETS.filter(p=>p.strategy!=="pending").map(p=>{
  const c=fromPreset(p);
  const kind=c.rhythm==="paced"?"paced":c.rhythm==="vt"||c.rhythm==="idioventricular"?"ventricular":
   c.ectopy==="pvc"||c.ectopy==="bigeminy"||c.ectopy==="trigeminy"||c.ectopy==="couplet"?"pvc":"normal";
  const beat={time:0,rr:60/c.hr,kind},source=ventricularSource(c,beat),q=spatialQrsSummary(qrsKernels(c,beat));
  const target=source?.axis??c.axis;
  return {preset:p.id,kind,source:source?.id??null,targetAxis:target,frontalAxis:q.frontalAxis,
   axisErrorDeg:angularSeparation(q.frontalAxis,target),peakSpatialMagnitude:q.peakSpatialMagnitude,
   pathLength:q.pathLength,reversals:q.reversals};
 });
}`,resolveDir:process.cwd()},bundle:true,platform:"node",format:"esm",outfile:entry});
  const {run}=await import(pathToFileURL(entry).href),cases=run();
  if(!cases.every(r=>[r.targetAxis,r.frontalAxis,r.axisErrorDeg,r.peakSpatialMagnitude,r.pathLength,r.reversals].every(Number.isFinite)))
    throw new Error("Non-finite ventricular trajectory metric");
  const report={schemaVersion:1,role:"Generator-level engineering benchmark, not clinical validation",presets:cases.length,
   maxAxisErrorDeg:Math.max(...cases.map(r=>r.axisErrorDeg)),
   byKind:Object.fromEntries([...new Set(cases.map(r=>r.kind))].map(k=>[k,cases.filter(r=>r.kind===k).length])),
   limitations:["Spatial kernel metrics describe the synthetic generator before filtering and do not establish clinical fidelity.",
    "Preset target axes and source templates are engineering inputs, not population reference intervals."],cases};
  await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({...report,cases:undefined}));
} finally {await rm(temp,{recursive:true,force:true});}
