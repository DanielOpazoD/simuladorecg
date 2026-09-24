import { describe, it, expect } from "vitest";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { auditMeasurement } from "../src/engine/analysis/model-audit";
import { referenceForMeasurement } from "../src/engine/reference";
import {
  circularMedian,
  spread,
  unwrapAngles,
} from "../src/engine/analysis/statistics";
import { fromPreset, presetById } from "../src/presets/catalog";

const caseData = (id: string) => {
  const signal = synthesize(fromPreset(presetById(id)!), 10);
  return { signal, raw: measure(signal) };
};
describe("Audit identities and the actual contributing population", () => {
  it("keeps correct bigeminy bounds despite different whole-window proportions", () => {
    const { signal, raw } = caseData("bigeminy");
    const m = auditMeasurement(signal, raw);
    expect(m.qrs).not.toBeNull();
    expect(m.qrs).toBe(raw.qrs);
    expect(m.evidence.qrs.status).toBe("review");
    expect(referenceForMeasurement(signal, raw).reference.qrs).toBeLessThan(
      100,
    );
    expect(raw.rejected).toBeUndefined();
  });
  it("audits heart rate between observed endpoints, not a later edge beat", () => {
    const { signal, raw } = caseData("couplet");
    expect(auditMeasurement(signal, raw).hr).toBe(raw.hr);
  });
  it("rejects a wrong individual QRS even when the global duration is unchanged", () => {
    const { signal, raw } = caseData("sinus");
    raw.beats[2].onset += 0.06;
    raw.beats[2].offset += 0.06;
    const m = auditMeasurement(signal, raw);
    expect(m.qrs).toBeNull();
    expect(m.pr).toBeNull();
    expect(m.qt).toBeNull();
    expect(m.axis).toBeNull();
    expect(m.rejected?.qrs).toBe(raw.qrs);
  });
  it("does not let a false peak compensate for an interior missed beat", () => {
    const { signal, raw } = caseData("sinus");
    raw.detectedPeaks[3] += 0.3;
    const originalHR = raw.hr;
    const m = auditMeasurement(signal, raw);
    expect(m.hr).toBeNull();
    expect(m.rejected?.hr).toBe(originalHR);
    expect(raw.hr).toBe(originalHR);
  });
  it("rejects a P/PR candidate assigned to a ventricular ectopic without AV association", () => {
    const { signal, raw } = caseData("pvc");
    expect(auditMeasurement(signal, raw).pr).toBe(raw.pr);
    const ectopic = referenceForMeasurement(signal, raw).pairs.find(
      ({ source }) => source.pr === undefined,
    )!;
    expect(raw.pr).not.toBeNull();
    expect(ectopic).toBeDefined();
    ectopic.measured.pr = 160;
    ectopic.measured.pOnset = ectopic.measured.onset - 0.16;
    const candidate = structuredClone(raw);
    const m = auditMeasurement(signal, raw);
    expect(m.pr).toBeNull();
    expect(m.pAxis).toBeNull();
    expect(m.rejected?.pr).toBe(raw.pr);
    expect(m.qrs).toBe(raw.qrs);
    expect(m.evidence.pr.reason).toContain("sin asociación AV");
    expect(raw).toEqual(candidate);
  });
  it("does not fill absent measurements with the synthetic reference", () => {
    const { signal, raw } = caseData("sinus");
    raw.qt = null;
    raw.pr = null;
    const m = auditMeasurement(signal, raw);
    expect(m.qt).toBeNull();
    expect(m.pr).toBeNull();
    expect(m.qtc.fridericia).toBeNull();
  });
});

describe("Circular axis statistics", () => {
  it("treats +179 and -179 as neighbouring axes", () => {
    const angles = [179, -179, 178, -178];
    expect(Math.abs(circularMedian(angles))).toBeGreaterThan(175);
    expect(spread(unwrapAngles(angles))).toBeLessThan(5);
  });
  it("does not let the first outlier choose the branch cut", () => {
    expect(Math.abs(circularMedian([0, 179, -179]))).toBeGreaterThan(175);
    expect(circularMedian([10, 20, 30])).toBe(20);
  });
});
