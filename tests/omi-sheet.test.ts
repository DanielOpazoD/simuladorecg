/**
 * OMI case sheets, support and structured description (A3).
 */
import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById, PRESETS } from "../src/presets/catalog";
import { OMI_FAMILIES, catalogGroup } from "../src/ui/catalog-presentation";
import { OMI_SHEETS, REFERENCES } from "../src/presets/omi-content";
import { leadList, leadMeasures, structuredDescription } from "../src/ui/structured-description";
import { stMarks } from "../src/render/st-lens";
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
    const cited = new Set(Object.values(OMI_SHEETS).flatMap((x) => x.refs));
    expect(Object.keys(REFERENCES).filter((r) => !cited.has(r as never))).toEqual([]);
  });
  it("la ficha se escapa y lleva el capítulo de ECGsmith y el nivel de cada fuente", () => {
    const html = omiSheetHtml("anterior");
    expect(html).toContain("Ficha del caso");
    expect(html).toContain("ECGsmith");
    expect(html).toContain('class="ref-level">guía');
    expect(html).toContain("https://doi.org/10.1016/j.jemermed.2020.10.026");
    expect(omiSheetHtml("sinus")).toBe("");
    expect(omiSheetHtml("constructor")).toBe("");
    expect(omiSheetHtml("anterior", true)).toContain('class="omi-refs" open');
  });
});

describe("descripción estructurada", () => {
  const read = (id: string) => { const c = preset(id); return structuredDescription(c, synthesize(c, 10)); };
  const line = (d: ReturnType<typeof read>, key: string) => d.lines.find((l) => l.key === key)?.text ?? "";
  it("agrupa solo tramos de tres o más precordiales consecutivas", () => {
    expect(leadList(["V2", "V3", "V4"])).toBe("V2–V4");
    expect(leadList(["II", "III", "aVF"])).toBe("II, III y aVF");
    expect(leadList(["I", "aVL", "V1", "V2", "V3", "V4", "V5"])).toBe("I, aVL y V1–V5");
    expect(leadList(["I", "V2", "V3"])).toBe("I, V2 y V3");
  });
  it("lee SDST anterior con IDST inferior y reciprocidad en la oclusión de la DA", () => {
    const d = read("anterior"), st = line(d, "ST");
    expect(st).toMatch(/^SDST en [^;]*V1–V5/);
    expect(st).toMatch(/IDST [^;]*III/);
    expect(line(d, "Rec.")).toMatch(/reciprocidad/);
    expect(d.summary).toContain("12 derivaciones");
  });
  it("en el ECG normal no llama SDST a la elevación fisiológica de V1–V3", () => {
    const st = line(read("sinus"), "ST");
    expect(st).toMatch(/^Punto J elevado en V1–V3 .*bajo el criterio de las guías/);
    expect(st).not.toMatch(/SDST|IDST/);
  });
  it("ve el IDST ascendente y la T desproporcionada de De Winter, y las T de Wellens", () => {
    const d = read("de_winter");
    expect(line(d, "ST")).toMatch(/^IDST ascendente desde J en V1–V6/);
    expect(Number(/T\/QRS (\d+),(\d)/.exec(line(d, "T"))!.slice(1).join("."))).toBeGreaterThanOrEqual(0.9);
    expect(line(read("wellens_a"), "T")).toMatch(/T bifásicas positiva-negativa en V2 y V3/);
    expect(line(read("wellens_b"), "T")).toMatch(/T negativas en V1–V3/);
  });
  it("cuenta Q patológicas por la definición universal y no las evalúa con QRS ancho", () => {
    expect(line(read("old_inferior"), "Q")).toMatch(/^Q patológicas en II, III y aVF/);
    expect(line(read("sinus"), "Q")).toBe("Sin Q patológicas.");
    const lbbb = read("lbbb");
    expect(line(lbbb, "Q")).toMatch(/No se evalúan/);
    expect(line(lbbb, "Rec.")).toBe("");
    expect(line(lbbb, "ST/QRS")).toMatch(/secundario/);
  });
  it("lee el ST de los latidos dominantes, no el de las extrasístoles", () => {
    const c = preset("bigeminy"), s = synthesize(c, 10);
    const v1 = leadMeasures(s).find((m) => m.lead === "V1")!;
    const normal = stMarks(s, "V1", 0.3, 9.7).filter((m) => s.events.beats[m.beat].kind === "normal").map((m) => m.j0).sort((a, b) => a - b);
    expect(v1.j0).toBe(normal[Math.floor(normal.length / 2)]);
    expect(line(structuredDescription(c, s), "D")).toMatch(/QRS (8|9|10|11)\d ms/);
  });
  it("no lee el ST donde no hay base: flutter, torsades, FV", () => {
    expect(line(read("flutter"), "ST")).toMatch(/ondas F/);
    for (const id of ["torsades", "vf"]) expect(line(read(id), "ST")).toMatch(/Sin complejos organizados/);
  });
  it("en un bloqueo AV declara la frecuencia ventricular, la auricular y el bloqueo", () => {
    expect(line(read("complete"), "B·C")).toMatch(/bloqueo AV completo, frecuencia ventricular \d+ lpm, ondas P a \d+\/min/);
  });
  it("cada ficha coincide con su trazado en los rasgos que nombra", () => {
    expect(line(read("subendo"), "ST")).toMatch(/máx\. −[\d,]+ mm en J, en V[45]/);
    expect(line(read("lateral"), "ST")).toMatch(/^SDST en I, aVL y V3–V6/);
    expect(line(read("posterior"), "ST")).toMatch(/en V[23]\)/);
    const lcx = leadMeasures(synthesize(preset("inferior_lcx"), 10)), at = (l: string) => lcx.find((m) => m.lead === l)!.j0;
    expect(at("II")).toBeGreaterThanOrEqual(at("III"));
  });
});
