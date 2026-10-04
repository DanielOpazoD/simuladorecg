import { describe, expect, it } from "vitest";

describe("catalog ventricular trajectory benchmark",()=>{
  it("covers the complete active catalog and emits finite generator metrics", async()=>{
    const { fromPreset, PRESETS } = await import("../src/presets/catalog");
    const { qrsKernels } = await import("../src/engine/morphology");
    const { ventricularSource } = await import("../src/engine/ventricular-source");
    const { spatialQrsSummary, angularSeparation } = await import("../src/engine/ventricular-trajectory");
    const cases=PRESETS.filter(p=>p.strategy!=="pending").map(p=>{
      const c=fromPreset(p);
      const kind = c.rhythm==="paced" ? "paced" : c.rhythm==="vt" || c.rhythm==="idioventricular" ? "ventricular" :
        c.ectopy==="pvc" || c.ectopy==="bigeminy" || c.ectopy==="trigeminy" || c.ectopy==="couplet" ? "pvc" : "normal";
      const beat={time:0,rr:60/c.hr,kind} as any;
      const source=ventricularSource(c,beat), q=spatialQrsSummary(qrsKernels(c,beat));
      return {kind,axisErrorDeg:angularSeparation(q.frontalAxis,source?.axis??c.axis),...q};
    });
    expect(cases).toHaveLength(61);
    expect(Math.max(...cases.map(x=>x.axisErrorDeg))).toBeLessThan(1e-7);
    expect(cases.every(x=>x.peakSpatialMagnitude>0 && x.pathLength>0 && x.integrated.every(Number.isFinite))).toBe(true);
    expect(cases.every(x=>x.reversals<=2)).toBe(true);
    for(const kind of ["normal","pvc","ventricular","paced"]) expect(cases.some(x=>x.kind===kind)).toBe(true);
  });
});
