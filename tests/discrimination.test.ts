import { describe, expect, it } from "vitest";
import { measure } from "../src/engine/measure";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { fixture, wave, type Knot } from "./fixtures";

/** These challenges use independent piecewise-linear waves, not model events. */
describe("Ventricular detection in the presence of competing waves", () => {
  it.each([250, 500, 1000])("does not count a tall T twice at %s Hz", (fs) => {
    const s = fixture({
      fs,
      t: [
        [0.52, 0],
        [0.66, 1.1],
        [0.76, 0],
      ],
    });
    const m = measure(s);
    expect(m.detectedPeaks).toHaveLength(10);
    expect(m.hr).toBeCloseTo(60, 0);
    expect(m.beats.length).toBeGreaterThanOrEqual(7);
    expect(Math.abs(m.qrs! - 90)).toBeLessThanOrEqual(12);
  });

  it.each([0.2, 0.352])(
    "does not use a narrow stimulus at %s s as QRS",
    (time) => {
      const s = fixture();
      const spike: Knot[] = [
        [time - 0.002, 0],
        [time, 3],
        [time + 0.002, 0],
      ];
      for (const samples of Object.values(s.leads))
        for (let i = 0; i < samples.length; i++)
          samples[i] += wave((i / s.fs) % 1, spike);
      const before = s.leads.II.slice();
      const m = measure(s);
      expect(s.leads.II).toEqual(before);
      expect(m.detectedPeaks).toHaveLength(10);
      expect(m.detectedPeaks.every((t) => t % 1 > 0.36 && t % 1 < 0.46)).toBe(
        true,
      );
      expect(m.beats.length).toBeGreaterThanOrEqual(7);
      expect(Math.abs(m.qrs! - 90)).toBeLessThanOrEqual(12);
    },
  );
});

describe("Raw detector regression for existing difficult presets", () => {
  it.each(["hyperk", "complete_v", "aai", "vvi", "ddd"])(
    "counts ventricles rather than T, P or stimuli in %s",
    (id) => {
      const c = fromPreset(presetById(id)!);
      const s = synthesize(c, 10);
      const raw = measure({ fs: s.fs, leads: s.leads });
      expect(raw.hr).not.toBeNull();
      expect(Math.abs(raw.hr! - s.truth.hr)).toBeLessThan(2);
      const expected = s.events.beats.filter(
        (b) => b.time > 0.15 && b.time + b.qrs! < 9.82,
      );
      const detected = raw.detectedPeaks.filter((t) => t > 0.15 && t < 9.82);
      expect(Math.abs(detected.length - expected.length)).toBeLessThanOrEqual(
        1,
      );
      for (const t of detected)
        expect(
          s.events.beats.some(
            (b) => t >= b.time - 0.025 && t <= b.time + b.qrs! + 0.025,
          ),
        ).toBe(true);
    },
  );
});
