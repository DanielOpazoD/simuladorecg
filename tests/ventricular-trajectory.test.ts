import { describe, expect, it } from "vitest";
import { qrsKernels } from "../src/engine/morphology";
import { spatialQrsSummary, angularSeparation } from "../src/engine/ventricular-trajectory";
import { fromPreset, presetById } from "../src/presets/catalog";
import type { Beat } from "../src/engine/types";

const beat = (kind: Beat["kind"] = "normal"): Beat => ({time:0, rr:1, kind});
const load = (id:string) => fromPreset(presetById(id)!);

describe("generator-level spatial QRS contract", () => {
  it.each([
    ["sinus","normal"],["rbbb","normal"],["lbbb","normal"],
    ["pvc","pvc"],["vt","ventricular"],["vvi","paced"],["complete_v","ventricular"],
  ] as const)("%s produces a finite, non-degenerate spatial trajectory", (id, kind) => {
    const c=load(id), s=spatialQrsSummary(qrsKernels(c,beat(kind)));
    expect(s.integrated.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(s.frontalAxis)).toBe(true);
    expect(s.peakSpatialMagnitude).toBeGreaterThan(0.03);
    expect(s.pathLength).toBeGreaterThan(0.03);
    expect(s.reversals).toBeLessThanOrEqual(2);
  });

  it.each([
    ["sinus","normal"],["rbbb","normal"],["lbbb","normal"],
  ] as const)("%s closes the generated spatial loop on the requested frontal axis", (id, kind) => {
    const c=load(id), s=spatialQrsSummary(qrsKernels(c,beat(kind)));
    expect(angularSeparation(s.frontalAxis,c.axis)).toBeLessThan(1e-8);
  });

  it("ventricular source examples remain spatially distinguishable, not merely relabelled", () => {
    const cases = [
      ["pvc","pvc"],["vt","ventricular"],["vvi","paced"],["complete_v","ventricular"],
    ] as const;
    const summaries=cases.map(([id,kind])=>spatialQrsSummary(qrsKernels(load(id),beat(kind))));
    for(let i=0;i<summaries.length;i++) for(let j=i+1;j<summaries.length;j++) {
      const a=summaries[i], b=summaries[j];
      const axis=angularSeparation(a.frontalAxis,b.frontalAxis);
      const path=Math.abs(a.pathLength-b.pathLength);
      const vector=Math.hypot(...a.integrated.map((v,k)=>v-b.integrated[k]));
      expect(axis>10 || path>0.02 || vector>0.02, `profiles ${i}/${j} collapsed`).toBe(true);
    }
  });

  it("gain changes scale the loop without rotating its frontal axis", () => {
    const c=load("sinus");
    const base=spatialQrsSummary(qrsKernels(c,beat()));
    c.qrsAmp*=2;
    const high=spatialQrsSummary(qrsKernels(c,beat()));
    expect(angularSeparation(base.frontalAxis,high.frontalAxis)).toBeLessThan(1e-8);
    expect(high.peakSpatialMagnitude/base.peakSpatialMagnitude).toBeCloseTo(2,10);
    expect(high.pathLength/base.pathLength).toBeCloseTo(2,10);
  });
});
