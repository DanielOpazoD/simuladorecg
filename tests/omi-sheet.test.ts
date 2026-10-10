/**
 * OMI case sheets, support and structured description (A3).
 */
import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById, PRESETS } from "../src/presets/catalog";
import { OMI_FAMILIES, catalogGroup } from "../src/ui/catalog-presentation";
import { OMI_SHEETS, REFERENCES } from "../src/presets/omi-content";
import { leadList, structuredDescription } from "../src/ui/structured-description";
import { omiSheetHtml } from "../src/ui/omi-sheet";

const preset = (id: string) => ({ ...fromPreset(presetById(id)!), variability: 0 });

describe("fichas OMI", () => {
  it("cada patrón propio de las familias OMI tiene ficha completa, con respaldo verificable", () => {
    const own = PRESETS.filter((p) => OMI_FAMILIES.some((f) => f.id === catalogGroup(p)));
    expect(own.length).toBe(15);
    for (const p of own) {
      const s = OMI_SHEETS[p.id];
      expect(s, p.id).toBeTruthy();
      for (const text of [s.context, s.ecg, s.interpretation, s.lesson]) expect(text.length).toBeGreaterThan(20);
      expect(s.notes.map((n) => n.kind)).toEqual(["Perla", "Trampa", "Consejo"]);
      expect(s.refs.length).toBeGreaterThan(0);
      for (const r of s.refs) expect(REFERENCES[r], `${p.id}:${r}`).toBeTruthy();
    }
    for (const r of Object.values(REFERENCES)) expect(r.url).toMatch(/^https:\/\/(doi\.org\/10\.|physionet\.org\/)/);
  });
  it("la ficha se escapa y lleva el capítulo de ECGsmith y el nivel de cada fuente", () => {
    const html = omiSheetHtml("anterior");
    expect(html).toContain("Ficha del caso");
    expect(html).toContain("ECGsmith");
    expect(html).toContain('class="ref-level">guía');
    expect(html).toContain("https://doi.org/10.1016/j.jemermed.2020.10.026");
    expect(omiSheetHtml("sinus")).toBe("");
  });
});

describe("descripción estructurada", () => {
  it("agrupa precordiales consecutivas", () => {
    expect(leadList(["V2", "V3", "V4"])).toBe("V2–V4");
    expect(leadList(["II", "III", "aVF"])).toBe("II, III y aVF");
    expect(leadList(["I", "aVL", "V1", "V2", "V3", "V4", "V5"])).toBe("I, aVL y V1–V5");
  });
  it("lee SDST anterior con IDST inferior en la oclusión de la DA, y en el sinusal nada que alcance el umbral", () => {
    const c = preset("anterior"), d = structuredDescription(c, synthesize(c, 10));
    const st = d.lines.find((l) => l.key === "ST")!.text;
    expect(st).toMatch(/SDST en [^;]*V2–V4|SDST en [^;]*V1–V/);
    expect(st).toMatch(/IDST en [^;]*III/);
    expect(d.lines.some((l) => l.key === "Rec.")).toBe(true);
    expect(d.summary).toContain("12 derivaciones");
    const s = structuredDescription(preset("sinus"), synthesize(preset("sinus"), 10));
    const normal = s.lines.find((l) => l.key === "ST")!.text;
    expect(normal).toMatch(/^Sin desviación|por debajo del umbral de las guías/);
    expect(normal).not.toMatch(/IDST/);
    expect(st).not.toMatch(/por debajo del umbral/);
  });
  it("en un bloqueo AV declara la frecuencia ventricular y el bloqueo", () => {
    const c = preset("complete"), d = structuredDescription(c, synthesize(c, 10));
    expect(d.lines.find((l) => l.key === "B·C")!.text).toMatch(/bloqueo AV completo, frecuencia ventricular/);
  });
});
