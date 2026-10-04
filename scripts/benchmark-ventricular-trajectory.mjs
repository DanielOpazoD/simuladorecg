import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fromPreset, PRESETS } from "../src/presets/catalog";
import { qrsKernels } from "../src/engine/morphology";
import { ventricularSource } from "../src/engine/ventricular-source";
import { spatialQrsSummary, angularSeparation } from "../src/engine/ventricular-trajectory";

const out=process.argv[2] ?? "docs/ventricular-trajectory-benchmark.json";
const cases=PRESETS.filter(p=>p.strategy!=="pending").map(p=>{
  const c=fromPreset(p);
  const kind = c.rhythm==="paced" ? "paced" : c.rhythm==="vt" || c.rhythm==="idioventricular" ? "ventricular" :
    c.ectopy==="pvc" || c.ectopy==="bigeminy" || c.ectopy==="trigeminy" || c.ectopy==="couplet" ? "pvc" : "normal";
  const beat={time:0,rr:60/c.hr,kind};
  const source=ventricularSource(c,beat);
  const q=spatialQrsSummary(qrsKernels(c,beat));
  const target=source?.axis ?? c.axis;
  return {preset:p.id,kind,source:source?.id??null,targetAxis:target,
    frontalAxis:q.frontalAxis,axisErrorDeg:angularSeparation(q.frontalAxis,target),
    peakSpatialMagnitude:q.peakSpatialMagnitude,pathLength:q.pathLength,reversals:q.reversals};
});
const finite=cases.every(r=>Object.entries(r).filter(([k])=>!["preset","kind","source"].includes(k)).every(([,v])=>Number.isFinite(v)));
if(!finite) throw new Error("Non-finite ventricular trajectory metric");
const maxAxisErrorDeg=Math.max(...cases.map(r=>r.axisErrorDeg));
const report={schemaVersion:1,role:"Generator-level engineering benchmark, not clinical validation",
  presets:cases.length,maxAxisErrorDeg,
  byKind:Object.fromEntries([...new Set(cases.map(r=>r.kind))].map(k=>[k,cases.filter(r=>r.kind===k).length])),
  limitations:["Spatial kernel metrics describe the synthetic generator before filtering and do not establish clinical fidelity.",
    "Preset target axes and source templates are engineering inputs, not population reference intervals."],cases};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,cases:undefined}));
