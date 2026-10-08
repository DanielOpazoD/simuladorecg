import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { analyzeSamples } from "../src/engine/sample-analysis";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";
import { LEADS, type ECGCase, type Signal } from "../src/engine/types";
function recording(id: string, changes: Partial<ECGCase>, noise = 0) {
  const c = {
    ...fromPreset(presetById(id)!),
    variability: 0,
    seed: 53,
    ...changes,
  };
  c.artifacts = {
    ...c.artifacts,
    baseline: noise,
    muscle: noise,
    mains: noise,
  };
  return synthesize(c, 10);
}
function expectBoundaries(s: Signal, qrsTolerance = 10, qtTolerance = 10) {
  const original = structuredClone(s.leads),
    m = analyzeSamples({ fs: s.fs, leads: s.leads });
  const beats = m.beats.filter((b) => b.peak > 1 && b.peak < 9);
  expect(beats.length).toBeGreaterThanOrEqual(4);
  for (const b of beats) {
    const r = s.events.beats.find(
      (e) => b.peak >= e.time - 0.01 && b.peak <= e.time + e.qrs! + 0.03,
    );
    expect(r).toBeDefined();
    expect(Math.abs(b.qrs - r!.qrs! * 1000)).toBeLessThanOrEqual(qrsTolerance);
    expect(Math.abs((b.onset - r!.time) * 1000)).toBeLessThanOrEqual(
      qrsTolerance,
    );
    expect(Math.abs((b.offset - r!.time - r!.qrs!) * 1000)).toBeLessThanOrEqual(
      qrsTolerance,
    );
    expect(b.qt).not.toBeNull();
    expect(Math.abs(b.qt! - r!.qt! * 1000)).toBeLessThanOrEqual(qtTolerance);
    expect(b.tPeak!).toBeGreaterThan(b.offset);
  }
  expect(s.leads).toEqual(original);
  return m;
}
describe("shared QRS boundaries constrain QT", () => {
  for (const filter of ["off", "diagnostic"] as const) {
    it(`does not include the preceding P in low-amplitude WPW onset: ${filter}`, () => {
      const s = recording("wpw", { hr: 60, qrsAmp: 0.5, tAmp: 0.28, filter });
      const m = expectBoundaries(s);
      expect(m.hr).toBeCloseTo(60, 5);
    });
    it(`preserves a short observed return before low-voltage WPW: ${filter}`, () => {
      const s = recording("wpw", {
        hr: 55,
        electrolyte: "lowvoltage",
        filter,
        seed: 11,
      });
      expectBoundaries(s);
    });
    it(`retains weak terminal RBBB activation before searching for T: ${filter}`, () => {
      const s = recording("rbbb", {
        hr: 60,
        qrs: 240,
        qtc: 350,
        activationModel: "regional-rbbb-v1",
        filter,
        seed: 17,
      });
      expectBoundaries(s);
    });
  }
  it("does not label terminal ventricular activation as T when later repolarization overlaps", () => {
    const s = recording("rbbb", {
      hr: 120,
      qrs: 240,
      qtc: 520,
      activationModel: "regional-rbbb-v1",
      filter: "diagnostic",
      seed: 17,
    });
    const m = analyzeSamples(s);
    expect(m.qrs).not.toBeNull();
    expect(Math.abs(m.qrs! - 240)).toBeLessThan(10);
    for (const b of m.beats) {
      const r = s.events.beats.find(
        (e) => b.peak >= e.time - 0.01 && b.peak <= e.time + e.qrs! + 0.03,
      );
      expect(r).toBeDefined();
      if (b.tPeak !== null)
        expect(b.tPeak).toBeGreaterThanOrEqual(r!.time + r!.qrs! - 0.01);
      if (b.qt !== null)
        expect(Math.abs(b.qt - r!.qt! * 1000)).toBeLessThanOrEqual(30);
    }
  });
  for (const pr of [90, 100.3, 101.7])
    for (const filter of ["off", "diagnostic"] as const)
      it(`preserves an already correct noisy WPW ventricular count: ${pr}/${filter}`, () => {
        const m = analyzeSamples(
          recording(
            "wpw",
            { hr: 120, pr, electrolyte: "lowvoltage", filter, seed: 17 },
            0.05,
          ),
        );
        expect(m.evidence.hr.status).toBe("usable");
        expect(Math.abs(m.hr! - 120)).toBeLessThan(1);
      });
  for (const seed of [19, 71])
    for (const filter of ["off", "diagnostic"] as const)
      it(`preserves already resolved rapid ventricular observations: ${seed}/${filter}`, () => {
        const m = analyzeSamples(
          recording("vt", { hr: 250, qrs: 210, qtc: 350, filter, seed }, 0.03),
        );
        expect(m.evidence.hr.status).toBe("usable");
        expect(Math.abs(m.hr! - 250)).toBeLessThan(1);
      });
});

// Independent sampled pulse/carrier controls. The detector receives no cases,
// event clocks, labels or hidden physiological boundaries from this fixture.
function pulseTrain(weakPulse: boolean, carrier: boolean) {
  const fs = 500,
    leads = Object.fromEntries(
      LEADS.map((l) => [l, new Float64Array(fs * 10)]),
    ) as Signal["leads"];
  const names = ["I", "II", "V1", "V5"] as const;
  for (let i = 0; i < fs * 10; i++)
    for (const [k, l] of names.entries()) {
      let value = carrier
        ? 0.008 * Math.sin((2 * Math.PI * 50 * i) / fs) * (k % 2 ? -1 : 1)
        : 0;
      for (let beat = 0; beat < 10; beat++) {
        const t = i / fs - (beat + 0.5);
        value +=
          1.5 * [1, -0.4, 0.2, 0.7][k] * Math.exp(-0.5 * (t / 0.008) ** 2);
        if (weakPulse)
          value +=
            0.08 *
            [-0.2, 1, 0.6, -0.3][k] *
            Math.exp(-0.5 * ((t - 0.18) / 0.008) ** 2);
      }
      leads[l][i] = value;
    }
  return { fs, leads };
}
describe("weak support must be a localized rapid observation", () => {
  it("recovers repeated weak transient support without creating another activation", () => {
    const s = pulseTrain(true, false),
      d = detectVentricularCandidates(s);
    expect(d.peaks.length).toBeGreaterThanOrEqual(8);
    expect(
      d.complexes.filter((c) => c.support.length > 1).length,
    ).toBeGreaterThanOrEqual(4);
    for (const c of d.complexes.filter((c) => c.support.length > 1))
      expect(
        c.support.some((p) => p > c.marker && d.energy[p] <= d.threshold),
      ).toBe(true);
  });
  it("does not bridge a phase-locked continuous carrier merely because its fast contour repeats", () => {
    const s = pulseTrain(false, true),
      original = structuredClone(s.leads),
      d = detectVentricularCandidates(s);
    expect(d.peaks.length).toBeGreaterThanOrEqual(8);
    expect(d.complexes.every((c) => c.support.length === 1)).toBe(true);
    expect(s.leads).toEqual(original);
  });
});

for (const hr of [240, 260])
  for (const noise of [0, 0.025])
    for (const filter of ["off", "diagnostic"] as const)
      it(`does not attach a nearer next activation as late support: ${hr}/${noise}/${filter}`, () => {
        const m = analyzeSamples(
          recording("rbbb", { hr, qrs: 80, qtc: 350, filter, seed: 53 }, noise),
        );
        expect(m.evidence.hr.status).toBe("usable");
        expect(Math.abs(m.hr! - hr)).toBeLessThan(1);
        expect(m.qrs).not.toBeNull();
        expect(Math.abs(m.qrs! - 80)).toBeLessThan(10);
      });
for (const filter of ["off", "diagnostic"] as const)
  it(`preserves known ventricular-rate availability at 220 bpm: ${filter}`, () => {
    const m = analyzeSamples(
      recording("rbbb", { hr: 220, qrs: 80, qtc: 430, filter, seed: 53 }),
    );
    expect(m.evidence.hr.status).toBe("usable");
    expect(Math.abs(m.hr! - 220)).toBeLessThan(1);
  });
