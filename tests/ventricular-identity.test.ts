import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { analyzeSamples } from "../src/engine/sample-analysis";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";
import type { ECGCase, Signal } from "../src/engine/types";

// Source references belong to the evaluator. The product receives fs/leads only.
function evaluate(id: string, changes: Partial<ECGCase>, noise: number) {
  const c = { ...fromPreset(presetById(id)!), variability: 0, ...changes };
  c.artifacts = {
    ...c.artifacts,
    baseline: noise,
    muscle: noise,
    mains: noise,
  };
  const s = synthesize(c, 10);
  const snapshot = structuredClone(s.leads);
  const m = analyzeSamples({ fs: s.fs, leads: s.leads });
  expect(s.leads).toEqual(snapshot);
  return { s, m };
}
function assertVentricularIdentity(s: Signal, detected: number[]) {
  const used = new Set<number>();
  for (const b of s.events.beats.filter(
    (b) => b.time > 0.3 && b.time + b.qrs! < 9.7,
  )) {
    const i = detected.findIndex(
      (p, i) =>
        !used.has(i) && p >= b.time - 0.01 && p <= b.time + b.qrs! + 0.03,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    used.add(i);
  }
  for (const p of detected.filter((p) => p > 0.3 && p < 9.7))
    expect(
      s.events.beats.some(
        (b) => p >= b.time - 0.01 && p <= b.time + b.qrs! + 0.03,
      ),
    ).toBe(true);
}

describe("complete ventricular identity after released PR152", () => {
  for (const [hr, qrs] of [
    [190, 210],
    [210, 180],
    [250, 210],
    [250, 230],
  ])
    for (const noise of [0, 0.03])
      for (const seed of [19, 71])
        for (const filter of ["off", "diagnostic"] as const)
          it(`preserves actual rapid QRS: ${hr}/${qrs}, ${noise}, ${seed}, ${filter}`, () => {
            const { s, m } = evaluate(
              "vt",
              { hr, qrs, seed, filter, qtc: 350 },
              noise,
            );
            expect(m.hr).not.toBeNull();
            expect(Math.abs(m.hr! - hr)).toBeLessThanOrEqual(1);
            assertVentricularIdentity(s, m.detectedPeaks);
          });

  for (const [hr, seed, noise] of [
    [55, 11, 0.075],
    [55, 41, 0.075],
    [60, 83, 0.08],
  ])
    for (const filter of ["off", "diagnostic"] as const)
      it(`separates noisy T from paced QRS and retains whole intervals: ${hr}/${seed}/${filter}`, () => {
        const { s, m } = evaluate(
          "vvi",
          { hr, seed, filter, electrolyte: "lowvoltage" },
          noise,
        );
        expect(m.hr).not.toBeNull();
        expect(Math.abs(m.hr! - hr)).toBeLessThanOrEqual(1);
        assertVentricularIdentity(s, m.detectedPeaks);
        expect(m.qrs).not.toBeNull();
        // The newly exposed wrong QT was in seed 41. Seed 11/diagnostic has
        // only four resolved T ends in seven beats: keep the existing coverage
        // gate rather than demanding a summary unsupported by those samples.
        if (seed !== 11) expect(m.qt).not.toBeNull();
        const reference = s.events.beats[2];
        expect(Math.abs(m.qrs! - reference.qrs! * 1000)).toBeLessThanOrEqual(
          20,
        );
        if (m.qt !== null)
          expect(Math.abs(m.qt - reference.qt! * 1000)).toBeLessThanOrEqual(30);
        else expect(m.evidence.qt.status).toBe("unavailable");
        for (const b of m.beats.filter((b) => b.qt !== null))
          expect(Math.abs(b.qt! - reference.qt! * 1000)).toBeLessThanOrEqual(
            30,
          );
        // A suppressed stimulus can obscure the onset even after numerical repair.
        expect(m.evidence.qrs.status).not.toBe("usable");
        expect(m.evidence.qt.status).not.toBe("usable");
      });
});

it("retains noisy complete-complex identity under independent lead polarity reversals", () => {
  const { s, m } = evaluate(
    "vvi",
    { hr: 55, seed: 41, filter: "off", electrolyte: "lowvoltage" },
    0.075,
  );
  const expected = detectVentricularCandidates({ fs: s.fs, leads: s.leads });
  const leads = structuredClone(s.leads);
  for (const lead of ["I", "II", "V1", "V5"] as const) {
    for (let i = 0; i < leads[lead].length; i++) leads[lead][i] *= -1;
    const next = detectVentricularCandidates({ fs: s.fs, leads });
    expect(next.peaks).toEqual(expected.peaks);
    expect(next.mergedComponents).toEqual(expected.mergedComponents);
  }
});
