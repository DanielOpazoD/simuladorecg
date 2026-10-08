import { it, expect } from "vitest";
import { selectRefractoryMaxima } from "../src/engine/analysis/ventricular-candidates";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { analyzeSamples } from "../src/engine/sample-analysis";
function select(pairs: [number, number][], separation = 180) {
  const energy = new Float64Array(Math.max(0, ...pairs.map(([p]) => p)) + 1);
  for (const [p, e] of pairs) energy[p] = e;
  return selectRefractoryMaxima(
    pairs.map(([p]) => p),
    energy,
    separation,
  );
}
it("retains two real maxima instead of a stronger bridging maximum", () => {
  expect(
    select([
      [938, 27],
      [1046, 27.1],
      [1188, 27],
    ]),
  ).toEqual([938, 1188]);
});
it("does not invent a peak in an empty interval or halve an alternating train", () => {
  expect(
    select([
      [200, 4],
      [410, 12],
      [620, 4],
      [830, 12],
    ]),
  ).toEqual([200, 410, 620, 830]);
  expect(
    select([
      [200, 4],
      [830, 12],
    ]),
  ).toEqual([200, 830]);
});
it("keeps a truly dominant single maximum and the exact existing refractory bound", () => {
  expect(
    select([
      [938, 5],
      [1046, 27],
      [1188, 5],
    ]),
  ).toEqual([1046]);
  expect(
    select([
      [200, 10],
      [380, 9],
    ]),
  ).toEqual([200]);
  expect(
    select([
      [200, 10],
      [381, 9],
    ]),
  ).toEqual([200, 381]);
});
it("handles empty and single maximum sets", () => {
  expect(select([])).toEqual([]);
  expect(select([[250, 2]])).toEqual([250]);
});
it("matches exhaustive independent subset enumeration, without modifying inputs", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const maxima = Array.from({ length: 8 }, (_, i) => i * 73 + (seed % 13)),
      energy = new Float64Array(600);
    maxima.forEach((p, i) => (energy[p] = ((seed * 17 + i * 29) % 41) + 1));
    const copy = energy.slice(),
      selected = selectRefractoryMaxima(maxima, energy, 180);
    let maximum = -Infinity;
    for (let mask = 0; mask < 256; mask++) {
      const subset = maxima.filter((_, i) => mask & (1 << i));
      if (subset.some((p, i) => i > 0 && p - subset[i - 1] <= 180)) continue;
      maximum = Math.max(
        maximum,
        subset.reduce((sum, p) => sum + energy[p], 0),
      );
    }
    expect(selected.reduce((sum, p) => sum + energy[p], 0)).toBe(maximum);
    expect(energy).toEqual(copy);
  }
});
for (const [hr, qrs] of [
  [240, 240],
  [260, 200],
])
  for (const filter of ["off", "diagnostic"] as const)
    for (const noise of [0, 0.025])
      for (const qtc of [350, 430])
        it(`retains rapid broad ventricular complexes: ${hr}/${qrs}, ${filter}, noise ${noise}, QTc ${qtc}`, () => {
          const c = {
            ...fromPreset(presetById("vt")!),
            hr,
            qrs,
            qtc,
            filter,
            variability: 0,
            seed: 53,
          };
          Object.assign(c.artifacts, {
            baseline: noise,
            muscle: noise,
            mains: noise,
          });
          const s = synthesize(c, 10),
            m = analyzeSamples({ fs: s.fs, leads: s.leads });
          expect(m.hr).not.toBeNull();
          expect(Math.abs(m.hr! - hr)).toBeLessThanOrEqual(1);
          const used = new Set<number>();
          for (const b of s.events.beats.filter(
            (b) => b.time + b.qrs! / 2 >= 0.3 && b.time + b.qrs! / 2 < 9.7,
          )) {
            const index = m.detectedPeaks.findIndex(
              (p, i) =>
                !used.has(i) &&
                p >= b.time - 0.01 &&
                p <= b.time + b.qrs! + 0.03,
            );
            expect(index).toBeGreaterThanOrEqual(0);
            used.add(index);
          }
        });
it.each([80, 140])(
  "repairs a missed 220/min complex without certifying its ambiguous width (%s ms control)",
  (qrs) => {
    const c = {
      ...fromPreset(presetById("vt")!),
      hr: 220,
      qrs,
      qtc: 350,
      filter: "diagnostic" as const,
      variability: 0,
      seed: 53,
    };
    Object.assign(c.artifacts, {
      baseline: 0.025,
      muscle: 0.025,
      mains: 0.025,
    });
    const s = synthesize(c, 10),
      m = analyzeSamples({ fs: s.fs, leads: s.leads });
    expect(Math.abs(m.hr! - 220)).toBeLessThanOrEqual(1);
    expect(m.detectedPeaks.length).toBe(35);
    expect(m.evidence.qrs.status).toBe("review");
    expect(m.evidence.qrs.reason).toMatch(/recuperados|límites/);
  },
);
