import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { measure } from "../src/engine/measure";
import {
  loadLudb,
  fourLeadQrsReference,
  matchQrsEvents,
} from "./reference/ludb/load-ludb.mjs";

const root = fileURLToPath(
  new URL("./reference/ludb/fixtures", import.meta.url),
);
describe("Independent LUDB development regression (no model audit)", () => {
  it.each([1, 2, 3, 4])(
    "retains every annotated ventricular event in record %s",
    (id) => {
      const { signal, metadata } = loadLudb(root, "development", id);
      const reference = fourLeadQrsReference(metadata);
      const m = measure(signal);
      const first = reference.beats[0].peak - 0.15;
      const last = reference.beats.at(-1).peak + 0.15;
      const matching = matchQrsEvents(
        reference.beats.map((b) => b.peak),
        m.detectedPeaks.filter((t) => t >= first && t <= last),
      );
      expect(matching.fn).toBe(0);
      expect(matching.fp).toBe(0);
      expect(m.beats.length).toBeGreaterThanOrEqual(3);
    },
  );
  it("matches annotated boundaries with adequate coverage", () => {
    const onset = [],
      offset = [],
      width = [];
    for (const id of [1, 2, 3, 4]) {
      const { signal, metadata } = loadLudb(root, "development", id);
      const ref = fourLeadQrsReference(metadata).beats;
      const m = measure(signal);
      const matching = matchQrsEvents(
        ref.map((b) => b.peak),
        m.beats.map((b) => b.peak),
      );
      for (const pair of matching.pairs) {
        const a = ref.find((b) => b.peak === pair.reference),
          b = m.beats.find((b) => b.peak === pair.detected);
        if (a.qrsOnset === null || a.qrsOffset === null) continue;
        onset.push(Math.abs(b.onset - a.qrsOnset) * 1000);
        offset.push(Math.abs(b.offset - a.qrsOffset) * 1000);
        width.push(Math.abs(b.qrs - (a.qrsOffset - a.qrsOnset) * 1000));
      }
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(width.length).toBeGreaterThanOrEqual(27);
    expect(mean(onset)).toBeLessThan(25);
    expect(mean(offset)).toBeLessThan(25);
    expect(mean(width)).toBeLessThan(35);
  });
});
