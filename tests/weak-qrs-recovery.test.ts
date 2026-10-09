import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { analyzeSamples } from "../src/engine/sample-analysis";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";
import type { ECGCase, Signal } from "../src/engine/types";
function recording(id: string, changes: Partial<ECGCase>) {
  const config = { ...fromPreset(presetById(id)!), variability: 0, ...changes };
  config.artifacts = { ...config.artifacts, baseline: 0, muscle: 0, mains: 0 };
  return synthesize(config, 10, { learnedBase: false }); // frozen-analyzer fixture on kernels
}
function ventricularIdentity(signal: Signal, peaks: readonly number[]) {
  const events = signal.events.beats.filter(
    (b) => b.time > 0.2 && b.time + b.qrs! < 9.8,
  );
  for (const beat of events)
    expect(
      peaks.filter(
        (t) => t >= beat.time - 0.01 && t <= beat.time + beat.qrs! + 0.03,
      ),
    ).toHaveLength(1);
  for (const t of peaks.filter((t) => t > 0.2 && t < 9.8))
    expect(
      signal.events.beats.filter(
        (b) => t >= b.time - 0.01 && t <= b.time + b.qrs! + 0.03,
      ),
    ).toHaveLength(1);
}
describe("observed weak QRS displaced by a larger preceding wave", () => {
  for (const id of ["lbbb", "wpw"])
    for (const filter of ["off", "diagnostic"] as const) {
      it(`recovers every ventricular observation without promoting uncertain intervals: ${id}/${filter}`, () => {
        const s = recording(id, {
          qrsAmp: 0.1,
          tAmp: 0.28,
          hr: 60,
          filter,
          seed: 53,
        });
        const original = structuredClone(s.leads);
        const d = detectVentricularCandidates({ fs: s.fs, leads: s.leads }),
          m = analyzeSamples({ fs: s.fs, leads: s.leads });
        expect(m.hr).toBeCloseTo(60, 6);
        if (id === "lbbb") {
          expect(m.qrs).not.toBeNull();
          expect(Math.abs(m.qrs! - 160)).toBeLessThan(20);
          expect(m.qt).not.toBeNull();
          expect(Math.abs(m.qt! - 410)).toBeLessThan(30);
        }
        ventricularIdentity(s, m.detectedPeaks);
        expect(d.complexes.some((c) => c.refractoryRestored)).toBe(true);
        expect(d.boundaryCandidates.some((p) => !d.peaks.includes(p))).toBe(
          true,
        );
        for (const beat of m.beats) {
          const ref = s.events.beats.find(
            (b) =>
              beat.peak >= b.time - 0.01 && beat.peak <= b.time + b.qrs! + 0.03,
          );
          if (ref && Math.abs(beat.qrs - ref.qrs! * 1000) > 20)
            expect(m.evidence.qrs.status).not.toBe("usable");
          if (
            ref &&
            beat.qt !== null &&
            Math.abs(beat.qt - ref.qt! * 1000) > 30
          )
            expect(m.evidence.qt.status).not.toBe("usable");
        }
        expect(s.leads).toEqual(original);
      });
    }
  for (const seed of [83, 97])
    for (const filter of ["off", "diagnostic"] as const) {
      it(`keeps rapid ventricular support when an earlier slope looks sharper: ${seed}/${filter}`, () => {
        const s = recording("vt", {
          hr: 185,
          qrs: 225,
          qtc: 350,
          seed,
          filter,
        });
        const m = analyzeSamples({ fs: s.fs, leads: s.leads });
        expect(Math.abs(m.hr! - 185)).toBeLessThan(1);
        ventricularIdentity(s, m.detectedPeaks);
      });
    }
});
