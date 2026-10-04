import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("catalog ventricular trajectory benchmark",()=>{
  it("covers the complete active catalog and emits finite generator metrics",()=>{
    const dir=mkdtempSync(path.join(tmpdir(),"ecg-trajectory-"));
    try{
      const out=path.join(dir,"report.json");
      execFileSync(process.execPath,["scripts/benchmark-ventricular-trajectory.mjs",out],{stdio:"pipe"});
      const r=JSON.parse(readFileSync(out,"utf8"));
      expect(r.schemaVersion).toBe(1);
      expect(r.presets).toBe(61);
      expect(r.cases).toHaveLength(61);
      expect(r.maxAxisErrorDeg).toBeLessThan(1e-7);
      expect(r.cases.every((x:any)=>x.peakSpatialMagnitude>0 && x.pathLength>0)).toBe(true);
      expect(r.cases.every((x:any)=>x.reversals<=2)).toBe(true);
      expect(r.byKind.normal).toBeGreaterThan(40);
      expect(r.byKind.pvc).toBeGreaterThan(0);
      expect(r.byKind.ventricular).toBeGreaterThan(0);
      expect(r.byKind.paced).toBeGreaterThan(0);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
