import { afterEach, describe, expect, it, vi } from "vitest";
import { fromPreset, presetById } from "../src/presets/catalog";
import { caseContext, normalizeImportedCase } from "../src/presets/case-context";
import { changeCase, keepsPractice } from "../src/ui/case-state";
import { readAcquisitionPreference, saveAcquisitionPreference } from "../src/ui/acquisition-preference";
import { comparisonCase } from "../src/ui/case-comparison";
import { createExplorationOrigin, restoreExplorationOrigin } from "../src/ui/exploration-origin";

afterEach(() => vi.unstubAllGlobals());

describe("reader-selected acquisition keeps the cardiac case", () => {
  it.each(["sinus", "anterior", "lbbb", "af", "vvi"])("%s can disable the added noise without changing its physiology or catalog identity", id => {
    const preset = presetById(id)!, c = fromPreset(preset);
    c.acquisition = "realistic";
    c.artifacts.muscle = .2;
    const before = structuredClone(c), clean = changeCase(c, "acquisition", "ideal");
    expect(clean).toEqual({ ...c, acquisition: "ideal" });
    expect(c).toEqual(before);
    expect(caseContext(clean).preset?.id).toBe(id);
    expect(normalizeImportedCase(clean).acquisition).toBe("ideal");
    expect(normalizeImportedCase(clean).presetId).toBe(id);
    expect(changeCase(clean, "acquisition", "realistic")).toEqual(c);
    expect(comparisonCase("sinus", clean)?.acquisition).toBe("ideal");
    const origin = createExplorationOrigin(preset, c);
    expect(restoreExplorationOrigin(origin, { ...clean, hr: 110 })).toEqual({ ...c, acquisition: "ideal" });
  });

  it("does not change an unanswered exercise or silently accept an unknown profile", () => {
    expect(keepsPractice("acquisition")).toBe(true);
    expect(() => changeCase(fromPreset(presetById("sinus")!), "acquisition", "quiet-v1")).toThrow();
  });

  it("uses only explicit valid preferences and tolerates blocked storage", () => {
    const data = new Map<string,string>();
    vi.stubGlobal("localStorage", { getItem: (k:string) => data.get(k) ?? null, setItem: (k:string,v:string) => data.set(k,v) });
    expect(readAcquisitionPreference()).toBeNull();
    saveAcquisitionPreference("ideal"); expect(readAcquisitionPreference()).toBe("ideal");
    data.set("ecglab-acquisition", "quiet-v1"); expect(readAcquisitionPreference()).toBeNull();
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
    expect(readAcquisitionPreference()).toBeNull();
    expect(() => saveAcquisitionPreference("ideal")).not.toThrow();
  });
});
