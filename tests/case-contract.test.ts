import { repolarizationLimitations, SECONDARY_ST_RATIO_LIMIT } from "../src/presets/teaching-limits";
import { describe, expect, it, vi } from "vitest";
import { cloneCase, DEFAULT_CASE, normalizeCase } from "../src/engine/types";
import { PRESETS, fromPreset, presetById } from "../src/presets/catalog";
import {
  caseContext,
  normalizeImportedCase,
} from "../src/presets/case-context";
import { changeCase } from "../src/ui/case-state";
import {
  decodeCase,
  encodeCase,
  saveCase,
  savedCases,
} from "../src/ui/persistence";

describe("Declared preset versus imported physiology", () => {
  it("retains the clinical context of every unchanged active preset", () => {
    for (const preset of PRESETS.filter((p) => p.strategy !== "pending")) {
      const context = caseContext(fromPreset(preset));
      expect(context.preset?.id, preset.id).toBe(preset.id);
      expect(context.warnings, preset.id).toEqual(repolarizationLimitations(fromPreset(preset)));
    }
  });

  it("does not attach sinus findings to imported VF or silently alter its parameters", () => {
    const c = normalizeCase({ ...DEFAULT_CASE, rhythm: "vf" }),
      original = cloneCase(c),
      context = caseContext(c);
    expect(context.preset).toBeUndefined();
    expect(context.displayName).toBe("Caso personalizado");
    expect(context.warnings).toHaveLength(1);
    expect(c).toEqual(original);
    expect(c.rhythm).toBe("vf");
  });

  it("detects changes in numeric physiology even if the declared rhythm is unchanged", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.qrs = 180;
    c.hr = 130;
    c.name = "Mi ejercicio";
    const context = caseContext(c);
    expect(context.preset).toBeUndefined();
    expect(context.displayName).toBe("Mi ejercicio");
    expect(context.warnings).toHaveLength(1);
  });

  it("does not invalidate a free name, seed, view, noise or recording filter", () => {
    const c = fromPreset(presetById("rbbb")!);
    c.name = "Caso guardado de conducción";
    c.seed = 71;
    c.view.gain = 5;
    c.view.palette = "dark";
    c.artifacts.baseline = 0.2;
    c.filter = "monitor";
    c.notch = 60;
    c.mainsFrequency = 60;
    const restored = decodeCase(encodeCase(c))!;
    expect(restored).toEqual(c);
    expect(caseContext(restored)).toMatchObject({
      preset: { id: "rbbb" },
      displayName: c.name,
      warnings: [],
    });
  });

  it("keeps old JSON and links readable while guarding their clinical explanation", () => {
    const oldCase = { ...DEFAULT_CASE, rhythm: "vf" },
      original = structuredClone(oldCase),
      json = normalizeImportedCase(JSON.parse(JSON.stringify(oldCase))),
      oldHash =
        "#case=" + Buffer.from(JSON.stringify(oldCase)).toString("base64url"),
      linked = decodeCase(oldHash)!;
    expect(linked).toEqual(json);
    expect(json).toEqual({
      ...oldCase,
      presetId: "custom",
      name: "Caso personalizado",
    });
    expect(oldCase).toEqual(original);
    expect(decodeCase(encodeCase(json))).toEqual(json);
  });

  it("normalizes existing browser storage and saved metadata without changing physiology", () => {
    const oldCase = { ...DEFAULT_CASE, rhythm: "vf" },
      valid = fromPreset(presetById("rbbb")!);
    valid.name = "Mi caso de conducción";
    valid.seed = 51;
    let stored = JSON.stringify([oldCase, valid]);
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: (_key: string, value: string) => (stored = value),
    });
    try {
      const cases = savedCases();
      expect(cases[0]).toEqual({
        ...oldCase,
        presetId: "custom",
        name: "Caso personalizado",
      });
      expect(cases[1]).toEqual(valid);
      saveCase(normalizeCase(oldCase));
      expect(JSON.parse(stored)).toEqual(cases);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not identify a custom case as sinus merely because its values match", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.presetId = "custom";
    c.name = "Mi caso";
    expect(caseContext(c)).toEqual({
      preset: undefined,
      displayName: "Mi caso",
      warnings: [],
    });
  });

  it("warns about an unknown or pending label without losing imported physiology", () => {
    for (const presetId of ["old-unknown-preset", "pending_0"]) {
      const c = normalizeCase({ ...DEFAULT_CASE, presetId, hr: 42 }),
        context = caseContext(c);
      expect(context.preset).toBeUndefined();
      expect(context.warnings).toHaveLength(1);
      expect(c.hr).toBe(42);
      expect(normalizeImportedCase(c).presetId).toBe("custom");
    }
  });
});

describe("Concordant injury example requires the existing LBBB substrate", () => {
  it("applies the Sgarbossa preset's substrate through the lesion selector", () => {
    const previous = cloneCase(DEFAULT_CASE),
      original = cloneCase(previous),
      c = changeCase(previous, "ischemia", "sgarbossa"),
      preset = fromPreset(presetById("sgarbossa")!);
    expect(c).toMatchObject({
      conduction: preset.conduction,
      qrs: preset.qrs,
      axis: preset.axis,
      septalQ: preset.septalQ,
      st: preset.st,
      ischemia: preset.ischemia,
      presetId: "custom",
    });
    expect(previous).toEqual(original);
    expect(caseContext(c).warnings).toEqual([SECONDARY_ST_RATIO_LIMIT]);
  });

  it("preserves unrelated patient settings when selecting the example", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.hr = 85;
    c.seed = 32;
    c.view.gain = 20;
    const next = changeCase(c, "ischemia", "sgarbossa");
    expect(next.hr).toBe(85);
    expect(next.seed).toBe(32);
    expect(next.view).toEqual(c.view);
  });

  it("warns for an inconsistent import instead of silently manufacturing LBBB", () => {
    const c = normalizeCase({
      ...DEFAULT_CASE,
      presetId: "custom",
      ischemia: "sgarbossa",
    });
    expect(caseContext(c).warnings).toHaveLength(1);
    expect(c.conduction).toBe("normal");
    expect(c.qrs).toBe(90);
    c.conduction = "lbbb";
    c.qrs = 100;
    expect(caseContext(c).warnings).toHaveLength(2);
    expect(caseContext(c).warnings[0]).toMatch(/requiere conducción BRI/);
    expect(caseContext(c).warnings[1]).toBe(SECONDARY_ST_RATIO_LIMIT);
  });

  it("warns when a later conduction change removes the required substrate", () => {
    const selected = changeCase(DEFAULT_CASE, "ischemia", "sgarbossa"),
      changed = changeCase(selected, "conduction", "normal");
    expect(changed.ischemia).toBe("sgarbossa");
    expect(changed.conduction).toBe("normal");
    expect(changed.qrs).toBe(90);
    expect(caseContext(changed).preset).toBeUndefined();
    expect(caseContext(changed).warnings).toHaveLength(1);
  });
});
