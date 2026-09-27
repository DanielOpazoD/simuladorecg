import { describe, expect, it } from "vitest";
import { axisFromLeads, project, type Vec } from "../src/engine/leads";
import { qrsKernels } from "../src/engine/morphology";
import { fromPreset, presetById } from "../src/presets/catalog";
import type { Beat, ECGCase } from "../src/engine/types";
import { ventricularSource } from "../src/engine/ventricular-source";

const load = (id: string) => fromPreset(presetById(id)!);
const integratedAxis = (c: ECGCase, beat: Beat) => {
  const sum = qrsKernels(c, beat).reduce(
    (acc, k) => acc.map((v, j) => v + k.v[j] * k.sigma) as Vec,
    [0, 0, 0] as Vec,
  );
  const p = project(sum);
  return axisFromLeads(p.I, p.II);
};
const angularError = (a: number, b: number) =>
  Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe("Final QRS frontal-axis contract", () => {
  it.each([
    ["sinus", -1, 0.1, "lowvoltage"],
    ["sinus", 1, 3, "none"],
    ["rv_chronic", -1, 0.1, "lowvoltage"],
    ["rv_chronic", 1, 3, "none"],
    ["rv_acute", -1, 0.1, "lowvoltage"],
    ["rv_acute", 1, 3, "none"],
  ] as const)(
    "%s honors the requested axis after transition=%s, gain=%s, electrolyte=%s",
    (id, transition, qrsAmp, electrolyte) => {
      const c = load(id);
      c.transition = transition;
      c.qrsAmp = qrsAmp;
      c.electrolyte = electrolyte;
      expect(angularError(integratedAxis(c, { time: 0, rr: 1, kind: "normal" }), c.axis))
        .toBeLessThan(1e-9);
    },
  );

  it.each([
    ["vvi", "paced"],
    ["pvc", "pvc"],
    ["vt", "ventricular"],
    ["complete_v", "ventricular"],
  ] as const)("uses the effective ventricular-source axis for %s", (id, kind) => {
    const c = load(id);
    c.transition = 1;
    c.qrsAmp = 0.3;
    c.electrolyte = "lowvoltage";
    const beat = { time: 0, rr: 1, kind } as Beat;
    const source = ventricularSource(c, beat)!;
    expect(angularError(integratedAxis(c, beat), source.axis)).toBeLessThan(1e-9);
  });

  it("does not mutate the requested case while closing the final axis", () => {
    const c = load("rv_acute");
    c.transition = 0.8;
    const before = structuredClone(c);
    qrsKernels(c, { time: 0, rr: 1, kind: "normal" });
    expect(c).toEqual(before);
  });
});
