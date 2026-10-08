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

describe("actual QRS ownership precedes uncertainty padding", () => {
  function paired(peaks: number[], width = 0.23) {
    const { signal, raw } = caseData("sinus");
    const example = signal.events.beats[0];
    signal.events.beats = [
      { ...example, time: 1, qrs: width },
      { ...example, time: 1.24, qrs: width },
    ];
    raw.detectedPeaks = peaks;
    raw.beats = [];
    return referenceForMeasurement(signal, raw);
  }
  it("matches terminal markers inside their actual wide QRS", () => {
    const r = paired([1.228, 1.468]);
    expect(r.falsePeaks).toBe(0);
    expect(r.missedBeats).toBe(0);
    expect(r.reference.hr).toBeCloseTo(250, 9);
  });
  it("does not assign a duplicate to the next padded QRS", () => {
    expect(paired([1.228, 1.229, 1.468]).falsePeaks).toBe(1);
  });
  it("preserves ambiguity inside truly overlapping source supports", () => {
    expect(paired([1.25], 0.3).falsePeaks).toBe(1);
  });
  it("preserves ambiguity in a gap covered by both tolerance windows", () => {
    expect(paired([1.234]).falsePeaks).toBe(1);
  });
  it("keeps the existing isolated 25 ms tolerance and rejects points beyond it", () => {
    expect(paired([1.48]).falsePeaks).toBe(0);
    expect(paired([1.5]).falsePeaks).toBe(1);
  });
  it("retains correctly detected rapid broad-QRS rate without promoting bad intervals", () => {
    const c = {
      ...fromPreset(presetById("vt")!),
      hr: 250,
      qrs: 230,
      qtc: 350,
      variability: 0,
      seed: 71,
      filter: "diagnostic" as const,
    };
    c.artifacts = { ...c.artifacts, baseline: 0.03, muscle: 0.03, mains: 0.03 };
    const signal = synthesize(c, 10),
      raw = measure(signal),
      frozen = structuredClone(raw);
    const audited = auditMeasurement(signal, raw);
    expect(Math.abs(raw.hr! - 250)).toBeLessThan(1);
    expect(audited.hr).toBe(raw.hr);
    expect(audited.detectedPeaks).toEqual(raw.detectedPeaks);
    expect(audited.qrs).toBeNull();
    expect(audited.qt).toBeNull();
    expect(audited.rejected?.qrs).toBe(raw.qrs);
    expect(raw).toEqual(frozen);
  });
});

describe("recording-origin QRS provenance", () => {
  it("retains the generated clipped leading QRS without moving visible events or inventing a beat", () => {
    const c = {
      ...fromPreset(presetById("vt")!),
      hr: 240,
      qrs: 240,
      qtc: 350,
      variability: 0,
      seed: 53,
      filter: "diagnostic" as const,
    };
    c.artifacts = { ...c.artifacts, baseline: 0, muscle: 0, mains: 0 };
    const signal = synthesize(c, 10),
      raw = measure(signal),
      frozen = structuredClone(raw);
    expect(signal.events.beats[0].time).toBeCloseTo(0.2, 12);
    expect(signal.leadingQrs).toHaveLength(1);
    expect(signal.leadingQrs![0].time).toBeCloseTo(-0.05, 12);
    expect(signal.leadingQrs![0].qrs).toBe(0.24);
    const audited = auditMeasurement(signal, raw);
    expect(audited.hr).toBe(raw.hr);
    expect(Math.abs(audited.hr! - 240)).toBeLessThan(1);
    expect(audited.qrs).toBeNull();
    expect(raw).toEqual(frozen);
    const without = structuredClone(signal);
    delete without.leadingQrs;
    expect(auditMeasurement(without, raw).hr).toBeNull();
  });
  it("does not manufacture leading QRS provenance when only repolarization crosses the origin", () => {
    const signal = synthesize(
      { ...fromPreset(presetById("sinus")!), hr: 60, variability: 0 },
      10,
    );
    expect(signal.leadingQrs).toHaveLength(0);
    for (const b of signal.leadingQrs ?? []) {
      expect(b.time).toBeLessThan(0);
      expect(b.time + b.qrs!).toBeGreaterThan(0);
    }
    expect(signal.events.beats.every((b) => b.time >= 0)).toBe(true);
  });
});
