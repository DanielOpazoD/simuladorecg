import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { detectVentricularCandidates } from "../src/engine/analysis/ventricular-candidates";

describe("one accepted ventricular observation contract", () => {
  for (const id of ["sinus", "lbbb", "wpw", "vt", "vvi", "bigeminy"])
    it(`keeps markers, support and provenance aligned: ${id}`, () => {
      const signal = synthesize(fromPreset(presetById(id)!), 10);
      const result = detectVentricularCandidates({
        fs: signal.fs,
        leads: signal.leads,
      });
      expect(result.complexes.map((c) => c.marker)).toEqual(result.peaks);
      const identities = new Set<number>();
      for (const complex of result.complexes) {
        expect(identities.has(complex.marker)).toBe(false);
        identities.add(complex.marker);
        expect(complex.support).toContain(complex.marker);
        expect(complex.support).toEqual(
          [
            ...new Set(
              result.mergedComponents.get(complex.marker) ?? [complex.marker],
            ),
          ].sort((a, b) => a - b),
        );
        expect(complex.recovered).toBe(result.recovered.has(complex.marker));
        expect(complex.refractoryRestored).toBe(
          result.restoredByRefractorySelection.has(complex.marker),
        );
        expect(
          complex.support.every(
            (p) => Number.isInteger(p) && p >= 0 && p < signal.fs * 10,
          ),
        ).toBe(true);
      }
      const saved = structuredClone(result.complexes);
      for (const support of result.mergedComponents.values()) support.push(-1);
      result.peaks.push(-1);
      expect(result.complexes).toEqual(saved);
    });
});
