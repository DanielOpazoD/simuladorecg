import { describe, it, expect } from "vitest";
import { fixture } from "./fixtures";
import { measure } from "../src/engine/measure";
import {
  terminalAnalysisCopy,
  terminalConsensus,
} from "../src/engine/terminal-delineation";
import { constrainQtEvidence } from "../src/engine/measurement-support";

describe("Sample-only terminal consensus", () => {
  it.each([250, 500, 1000])(
    "filters a private copy without adding DC information at %s Hz",
    (fs) => {
      const raw = fixture({ fs }).leads.II,
        original = Float64Array.from(raw);
      const clean = terminalAnalysisCopy(raw, fs),
        shifted = terminalAnalysisCopy(
          Float64Array.from(raw, (v) => v + 1.75),
          fs,
        );
      expect(raw).toEqual(original);
      expect(clean.length).toBe(raw.length);
      expect(
        Math.max(...clean.map((v, i) => Math.abs(v - shifted[i]))),
      ).toBeLessThan(1e-8);
      expect(
        Math.max(
          ...terminalAnalysisCopy(new Float64Array(fs * 3).fill(1.75), fs).map(
            Math.abs,
          ),
        ),
      ).toBeLessThan(1e-8);
    },
  );
  it("does not let an offered terminal candidate bypass the observed wavelet boundary", () => {
    const s = fixture(),
      m = measure(s),
      r = m.detectedPeaks.map((t) => Math.round(t * s.fs));
    const offsets = r.map(
      (p) =>
        m.beats.find((b) => Math.round(b.peak * s.fs) === p)?.offset ?? null,
    );
    const falseEnds = r.map((p) => [
      { peak: p / s.fs + 0.2, end: p / s.fs + 0.7 },
    ]);
    const result = terminalConsensus(s, r, offsets, falseEnds);
    result.forEach((v, i) => {
      if (v) expect(Math.abs(v.end - falseEnds[i][0].end)).toBeGreaterThan(0.1);
    });
  });
  it("never mutates acquired leads or candidate coordinates", () => {
    const s = fixture(),
      before = structuredClone(s),
      m = measure(s),
      r = m.detectedPeaks.map((t) => Math.round(t * s.fs)),
      copy = [...r];
    const offsets = r.map(
      (p) =>
        m.beats.find((b) => Math.round(b.peak * s.fs) === p)?.offset ?? null,
    );
    terminalConsensus(s, r, offsets);
    expect(s).toEqual(before);
    expect(r).toEqual(copy);
  });
  it("keeps QT and every correction attached to the selected terminal boundaries", () => {
    const m = measure(fixture());
    expect(m.qt).not.toBeNull();
    for (const b of m.beats)
      if (b.qt !== null)
        expect(b.qt).toBeCloseTo((b.tEnd! - b.onset) * 1000, 8);
    expect(m.qtc.bazett).toBeCloseTo(m.qt! / Math.sqrt(m.rr!), 8);
    expect(m.qtc.fridericia).toBeCloseTo(m.qt! / Math.cbrt(m.rr!), 8);
  });
});

describe("QT depends on QRS boundary evidence", () => {
  it.each(["review", "unavailable"] as const)(
    "does not promote a QT above %s QRS boundaries",
    (status) => {
      const evidence = structuredClone(measure(fixture()).evidence);
      evidence.qrs.status = status;
      evidence.qt.status = "usable";
      const before = structuredClone(evidence),
        result = constrainQtEvidence(evidence);
      expect(result.qt.status).toBe("review");
      expect(result.qt.reason).toContain("límites QRS");
      expect(result.qrs).toBe(evidence.qrs);
      expect(evidence).toEqual(before);
      expect(result.qt.count).toBe(evidence.qt.count);
      expect(result.qt.spread).toBe(evidence.qt.spread);
      expect(constrainQtEvidence(result)).toBe(result);
    },
  );
  it("does not change supported or already withheld evidence", () => {
    const evidence = measure(fixture()).evidence;
    expect(constrainQtEvidence(evidence)).toBe(evidence);
    evidence.qt.status = "unavailable";
    evidence.qrs.status = "review";
    expect(constrainQtEvidence(evidence)).toBe(evidence);
  });
});
