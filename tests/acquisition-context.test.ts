import { describe, expect, it } from "vitest";
import { LEADS, type Lead, type Signal } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { caseContext, caseReading, normalizeImportedCase } from "../src/presets/case-context";
import { decodeCase, encodeCase } from "../src/ui/persistence";

function st60(s: Signal, lead: Lead) {
  const b = s.events.beats.find((beat) => beat.time > 3)!;
  const lo = Math.round((b.time - 0.035) * s.fs);
  const hi = Math.round((b.time - 0.020) * s.fs);
  const baseline = s.leads[lead].slice(lo, hi).reduce((sum, v) => sum + v, 0) / (hi - lo);
  return s.leads[lead][Math.round((b.time + b.qrs! + 0.060) * s.fs)] - baseline;
}

describe("Acquisition context is not basal physiology", () => {
  it("retains the original teaching for an acquisition without reversal", () => {
    const p = presetById("inferior")!, c = fromPreset(p);
    expect(caseReading(c)).toMatchObject({ title: p.name, findings: p.findings });
    expect(caseContext(c).warnings).toEqual([]);
  });

  it.each(["off", "diagnostic"] as const)("preserves samples and replaces contradictory inferior observations (%s)", (filter) => {
    const c = fromPreset(presetById("inferior")!);
    c.filter = filter;
    const basal = synthesize(c, 10);
    c.artifacts.reversed = true;
    const original = structuredClone(c), before = synthesize(c, 10);
    const imported = normalizeImportedCase(JSON.parse(JSON.stringify(c)));
    const after = synthesize(imported, 10), context = caseContext(imported), reading = caseReading(imported);
    expect(imported).toEqual(original); // name, seed, view, physiology and acquisition are preserved
    expect(c).toEqual(original);
    expect(context.preset?.id).toBe("inferior");
    expect(context.warnings.join(" ")).toMatch(/inversión.*brazos/i);
    expect(reading.title).toBe("Registro con brazos invertidos");
    expect(reading.findingsTitle).toBe("Transformación de la adquisición");
    expect(reading.findings.join(" ")).not.toMatch(/III\s*>\s*II|ST↓ recíproco en I/);
    // This selected example reverses the order and sign; 0.02 mV is a fixture
    // discrimination margin, NOT an ischemia criterion. The transform itself
    // must satisfy the project's algebraic tolerance of 1e-9 mV.
    expect(st60(basal, "III") - st60(basal, "II")).toBeGreaterThan(0.02);
    expect(st60(after, "II") - st60(after, "III")).toBeGreaterThan(0.02);
    expect(st60(after, "I")).toBeGreaterThan(0.02);
    for (const lead of LEADS) {
      expect(after.leads[lead]).toEqual(before.leads[lead]);
      const source: Lead = ({ I: "I", II: "III", III: "II", aVR: "aVL", aVL: "aVR" } as Partial<Record<Lead, Lead>>)[lead] ?? lead;
      const sign = lead === "I" ? -1 : 1;
      let error = 0;
      for (let i = 0; i < after.leads[lead].length; i++) error = Math.max(error, Math.abs(after.leads[lead][i] - sign * basal.leads[source][i]));
      expect(error, lead).toBeLessThan(1e-9);
    }
    expect(decodeCase(encodeCase(imported))).toEqual(imported);
  });

  it("warns for manually adjusted cases without inventing a diagnosis or overwriting a free name", () => {
    const c = fromPreset(presetById("sinus")!);
    c.presetId = "custom"; c.name = "Mi ejercicio"; c.artifacts.reversed = true;
    expect(caseReading(c).title).toBe("Registro con brazos invertidos");
    expect(caseContext(c).preset).toBeUndefined();
    expect(caseContext(c).warnings.join(" ")).toMatch(/inversión/i);
    expect(normalizeImportedCase(c).name).toBe("Mi ejercicio");
  });

  it("does not confuse Cabrera's display polarity with an electrode reversal", () => {
    const c = fromPreset(presetById("inferior")!); c.view.cabrera = true;
    expect(caseReading(c).findings).toEqual(presetById("inferior")!.findings);
    expect(caseContext(c).warnings).toEqual([]);
  });
});
