import { describe, expect, it } from "vitest";
import { fixture, T, type Knot } from "./fixtures";
import { measure } from "../src/engine/measure";

// Independent piecewise-linear source: a broad connected QRS with two slow
// shoulders and an internal notch. No synthesizer, cases, events, or audit.
const wide: Knot[] = [
  [0.36, 0],
  [0.39, 0.8],
  [0.465, 1],
  [0.475, 0.8],
  [0.485, 1],
  [0.57, 0.8],
  [0.6, 0],
];
describe("complete observed QRS rather than one terminal component", () => {
  it.each(
    [250, 500, 1000].flatMap((fs) =>
      [160, 200, 240].flatMap((width) =>
        [false, true].map((offset) => ({ fs, width, offset })),
      ),
    ),
  )(
    "retains $width ms support at $fs Hz, baseline offset=$offset",
    ({ fs, width, offset }) => {
      const qrs: Knot[] = wide.map(([t, y]) => [
        0.36 + ((t - 0.36) * width) / 240,
        y,
      ]);
      const s = fixture({
        fs,
        offset,
        qrs,
        t: T.map(([t, y]) => [t + 0.15, y]),
      });
      const before = Object.fromEntries(
        Object.entries(s.leads).map(([k, v]) => [k, v.slice()]),
      );
      const m = measure(s);
      expect(m.qrs).not.toBeNull();
      expect(Math.abs(m.qrs! - width)).toBeLessThanOrEqual(12);
      expect(Math.abs(m.hr! - 60)).toBeLessThanOrEqual(0.1);
      for (const b of m.beats) {
        expect(b.axis).not.toBeNull();
        expect(
          Math.abs(
            b.axis! - (Math.atan2(1.3 / Math.sqrt(3), 0.7) * 180) / Math.PI,
          ),
        ).toBeLessThan(0.5);
        expect(b.onset).toBeLessThanOrEqual(b.peak + 1 / fs);
        expect(b.offset).toBeGreaterThanOrEqual(b.peak - 1 / fs);
      }
      expect(s.leads).toEqual(before);
    },
  );
});

import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";
import { analyzeSamples } from "../src/engine/sample-analysis";
it("keeps the same QRS fiducial when the competing slope belongs to that complex", () => {
  const c = {
    ...fromPreset(presetById("vt")!),
    hr: 120,
    qrsAmp: 0.5,
    tAmp: 0,
    variability: 0,
    seed: 53,
    filter: "off" as const,
  };
  Object.assign(c.artifacts, { baseline: 0, muscle: 0, mains: 0 });
  const s = synthesize(c, 10),
    input = { fs: s.fs, leads: s.leads };
  const original = detectVentricularCandidates(input, { tReject: false });
  const selected = detectVentricularCandidates(input);
  expect(selected.peaks).toEqual(original.peaks);
  const m = analyzeSamples(input);
  expect(Math.abs(m.instantHr! - 120)).toBeLessThanOrEqual(5);
  expect(m.evidence.qrs.status).toBe("review");
  expect(Math.abs(m.qrs! - 165)).toBeLessThanOrEqual(20);
});
