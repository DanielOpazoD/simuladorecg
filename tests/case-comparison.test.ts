import { describe, expect, it } from "vitest";
import { PRESETS, fromPreset, presetById } from "../src/presets/catalog";
import { caseComparisonHtml, comparisonCase } from "../src/ui/case-comparison";

describe("independent catalog comparison", () => {
  it("retains the reference physiology while sharing the current paper calibration", () => {
    const current = fromPreset(presetById("anterior")!);
    current.hr = 123;
    current.st = 4;
    current.seed = 711;
    current.filter = "aggressive";
    current.artifacts.reversed = true;
    current.acquisition = "realistic";
    current.view = { ...current.view, mode: "monitor", speed: 50, gain: 5, chestGain: 20, cabrera: true, timing: "simultaneous", format: "6x2", fit: false };
    const before = structuredClone(current);
    const comparison = comparisonCase("sinus", current)!;
    const sinus = fromPreset(presetById("sinus")!);

    expect({ ...comparison, view: sinus.view, acquisition: sinus.acquisition }).toEqual(sinus);
    expect(comparison.acquisition).toBe("realistic");
    expect(comparison.view).toEqual({ ...current.view, mode: "paper" });
    expect(current).toEqual(before);
    comparison.view.speed = 25;
    comparison.artifacts.reversed = false;
    expect(current).toEqual(before);
  });

  it("rejects missing and unavailable references without changing the current case", () => {
    const current = fromPreset(presetById("sinus")!);
    const before = structuredClone(current);
    expect(comparisonCase("missing-reference", current)).toBeNull();
    for (const preset of PRESETS.filter(p => p.strategy === "pending")) {
      expect(comparisonCase(preset.id, current)).toBeNull();
    }
    expect(current).toEqual(before);
  });

  it("offers exactly the available catalog and names the comparison as independent examples", () => {
    const html = caseComparisonHtml();
    expect(html).toContain('value="sinus" selected');
    expect(html).toContain("Ejemplos independientes");
    expect(html).toContain('<optgroup label="Sinusal y auricular">');
    expect(html).toContain('<optgroup label="Ramas y fascículos">');
    const ids = [...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids)).toEqual(new Set(PRESETS.filter(p => p.strategy !== "pending").map(p => p.id)));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(html).not.toContain("ECG previo");
    expect(html).not.toContain("Actual − referencia");
  });
});
