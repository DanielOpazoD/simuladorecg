import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { analyzeSamples } from "../src/engine/sample-analysis";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";
import type { ECGCase, Signal } from "../src/engine/types";

function recording(id: string, changes: Partial<ECGCase>) {
  const config = { ...fromPreset(presetById(id)!), variability: 0, ...changes };
  config.artifacts = { ...config.artifacts, baseline: 0, muscle: 0, mains: 0 };
  return synthesize(config, 10);
}
// A correct average is insufficient: every interior ventricular activation has
// exactly one candidate and every interior candidate belongs to an activation.
function expectIdentity(
  signal: Signal,
  peaks: readonly number[],
  margin = 0.2,
) {
  const events = signal.events.beats.filter(
    (b) => b.time > margin && b.time + b.qrs! < 10 - margin,
  );
  for (const beat of events)
    expect(
      peaks.filter(
        (p) => p >= beat.time - 0.01 && p <= beat.time + beat.qrs! + 0.03,
      ),
    ).toHaveLength(1);
  for (const peak of peaks.filter((p) => p > margin && p < 10 - margin))
    expect(
      signal.events.beats.filter(
        (b) => peak >= b.time - 0.01 && peak <= b.time + b.qrs! + 0.03,
      ),
    ).toHaveLength(1);
}

describe("recurrent wave identity independent of amplitude dominance", () => {
  for (const [id, qrsAmp, tAmp, hr] of [
    ["sinus", 0.1, 0, 120],
    ["sinus", 0.5, 0.8, 120],
    ["lbbb", 0.1, 0, 60],
    ["lbbb", 0.1, 0, 120],
    ["pvc", 0.1, 0, 120],
  ] as const)
    for (const filter of ["off", "diagnostic"] as const)
      it(`counts actual QRS with larger P/T: ${id}/${qrsAmp}/${tAmp}/${hr}/${filter}`, () => {
        const signal = recording(id, { qrsAmp, tAmp, hr, filter, seed: 53 });
        const original = structuredClone(signal.leads);
        const measurement = analyzeSamples({
          fs: signal.fs,
          leads: signal.leads,
        });
        expect(measurement.hr).not.toBeNull();
        expect(Math.abs(measurement.hr! - hr)).toBeLessThan(1);
        expectIdentity(signal, measurement.detectedPeaks);
        const detected = detectVentricularCandidates(signal);
        expect(detected.complexes.map((c) => c.marker)).toEqual(detected.peaks);
        // Rejected waves remain geometric evidence, not extra ventricular beats.
        expect(
          detected.boundaryCandidates.some((p) => !detected.peaks.includes(p)),
        ).toBe(true);
        expect(signal.leads).toEqual(original);
      });
  for (const filter of ["off", "diagnostic"] as const)
    it(`retains a rapid same-contour train despite changing local rank: ${filter}`, () => {
      const signal = recording("vt", {
        hr: 180,
        qrs: 240,
        qtc: 350,
        filter,
        seed: 53,
      });
      const measurement = analyzeSamples(signal);
      expect(measurement.hr).not.toBeNull();
      expect(Math.abs(measurement.hr! - 180)).toBeLessThan(1);
      expectIdentity(signal, measurement.detectedPeaks, 0.4);
    });
  for (const filter of ["off", "diagnostic"] as const)
    it(`does not reclassify neighboring ventricular waves after exclusions: ${filter}`, () => {
      const signal = recording("vt", {
        qrsAmp: 1,
        tAmp: 0.8,
        hr: 60,
        filter,
        seed: 53,
      });
      const measurement = analyzeSamples(signal);
      expect(measurement.hr).not.toBeNull();
      expect(Math.abs(measurement.hr! - 60)).toBeLessThan(1);
      expectIdentity(signal, measurement.detectedPeaks);
    });
  for (const filter of ["off", "diagnostic"] as const)
    it(`keeps unsupported overlapping WPW intervals unpromoted: ${filter}`, () => {
      const signal = recording("wpw", {
        qrsAmp: 0.5,
        tAmp: 0.8,
        hr: 60,
        filter,
        seed: 53,
      });
      const measurement = analyzeSamples(signal);
      expect(measurement.qrs).toBeNull();
      expect(measurement.qt).toBeNull();
    });
});
