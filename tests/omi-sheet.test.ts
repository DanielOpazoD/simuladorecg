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
import { omiSheetHtml, structuredDescriptionHtml } from "../src/ui/omi-sheet";
import { descriptionInfoHtml } from "../src/ui/description-info";

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
  it("describe en lenguaje clínico la oclusión de la DA: elevación, descenso recíproco y T prominentes", () => {
    const d = read("anterior"), st = line(d, "ST");
    // Only leads that reach the guideline threshold (V1 0,8 mm and V5 0,7 mm stay out).
    expect(st).toMatch(/^Elevación del ST en I, aVL y V2–V4, máxima en V3/);
    expect(st).toMatch(/descenso del ST [^;]*III/);
    expect(line(d, "Rec.")).toBe("Cambios recíprocos del ST.");
    expect(line(d, "T")).toMatch(/Ondas T invertidas en III y aVF; ondas T prominentes, grandes para su QRS, en V3/);
    expect(d.lines.find((l) => l.key === "ST")!.info).toBe("st");
    expect(d.summary).toContain("12 derivaciones");
  });
  it("el ECG normal dice «sin alteraciones del ST», «onda T normal» y «sin ondas Q patológicas»", () => {
    const d = read("sinus");
    expect(line(d, "ST")).toBe("Sin alteraciones del ST.");
    expect(line(d, "T")).toBe("Onda T normal.");
    expect(line(d, "Q")).toBe("Sin ondas Q patológicas.");
    expect(d.summary).not.toMatch(/J\+60|T\/QRS/);
  });
  it("De Winter: descenso ascendente y T prominentes; Wellens: T bifásicas o invertidas", () => {
    const d = read("de_winter");
    expect(line(d, "ST")).toMatch(/^Descenso del ST con pendiente ascendente en V1–V6/);
    expect(line(d, "T")).toMatch(/ondas T prominentes, grandes para su QRS, en [^.]*V2–V6|Ondas T prominentes/i);
    expect(line(read("wellens_a"), "T")).toBe("Ondas T bifásicas en V2 y V3.");
    expect(line(read("wellens_b"), "T")).toBe("Ondas T invertidas en V2 y V3.");
  });
  it("cuenta Q patológicas por la definición universal y no las valora con QRS ancho", () => {
    expect(line(read("old_inferior"), "Q")).toBe("Ondas Q patológicas en II, III y aVF.");
    const lbbb = read("lbbb");
    expect(line(lbbb, "Q")).toMatch(/no valorables/);
    // With RBBB the initial forces are preserved: Q waves are read.
    expect(line(read("rbbb"), "Q")).toBe("Sin ondas Q patológicas.");
    expect(line(lbbb, "Rec.")).toBe("");
    expect(line(lbbb, "ST/QRS")).toMatch(/secundarias/);
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
    for (const id of ["torsades", "vf"]) expect(line(read(id), "ST")).toMatch(/no hay complejos organizados/);
  });
  it("en un bloqueo AV declara la frecuencia ventricular, la auricular y el bloqueo", () => {
    expect(line(read("complete"), "B·C")).toMatch(/bloqueo AV completo, frecuencia ventricular \d+ lpm, ondas P a \d+\/min/);
  });
  it("cada ficha coincide con su trazado en los rasgos que nombra", () => {
    expect(line(read("subendo"), "ST")).toMatch(/máximo en V[45]/);
    expect(line(read("lateral"), "ST")).toMatch(/^Elevación del ST en I, aVL y V3–V6[^.]*descenso del ST [^;]*III/);
    // Pericarditis: the ST depression in aVR is named.
    expect(line(read("pericarditis"), "ST")).toMatch(/descenso del ST en aVR/);
    expect(line(read("rbbb"), "T")).not.toMatch(/aplanadas/);
    expect(line(read("lbbb"), "T")).not.toMatch(/prominentes|aplanadas en aVF/);
    expect(line(read("posterior"), "ST")).toMatch(/máximo en V[23]/);
    const lcx = leadMeasures(synthesize(preset("inferior_lcx"), 10)), at = (l: string) => lcx.find((m) => m.lead === l)!.j0;
    expect(at("II")).toBeGreaterThanOrEqual(at("III"));
  });
  it("cada línea clínica abre sus criterios, referencias y valores medidos", () => {
    const d = read("old_inferior"), html = structuredDescriptionHtml(d);
    expect(html.match(/data-action="description-info"/g)).toHaveLength(3);
    const q = descriptionInfoHtml("q", d.measures);
    expect(q).toContain("Cuarta definición universal");
    expect(q).toContain("https://doi.org/10.1161/CIR.0000000000000617");
    expect(q).toMatch(/<tr class="info-hit"><td>III<\/td>/);
    expect(descriptionInfoHtml("st", d.measures)).toContain("1,5 mm en mujeres");
    expect(descriptionInfoHtml("t", d.measures)).toContain("10.1161/CIRCULATIONAHA.108.191096");
  });
});
