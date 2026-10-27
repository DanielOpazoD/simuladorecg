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
import { omiReferencesHtml, omiSheetHtml, structuredDescriptionHtml } from "../src/ui/omi-sheet";
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
  it("puede trasladar todas las fuentes a información sin duplicarlas en la lectura", () => {
    for (const id of Object.keys(OMI_SHEETS)) {
      const sheet = omiSheetHtml(id, false, false), refs = omiReferencesHtml(id);
      expect(sheet).toContain("Ficha del caso");
      expect(sheet).not.toContain("<details");
      expect(sheet).not.toContain("ECGsmith");
      expect(refs).not.toContain("<details");
      expect(omiSheetHtml(id)).toContain(refs);
      expect([...refs.matchAll(/<li>/g)]).toHaveLength(OMI_SHEETS[id].refs.length + 1);
    }
    expect(omiReferencesHtml("constructor")).toBe("");
    expect(omiReferencesHtml("sinus")).toBe("");
  });
  it("separa el escenario docente de las inferencias clínicas de alto impacto", () => {
    for (const s of Object.values(OMI_SHEETS)) {
      expect(s.interpretation).toMatch(/^Escenario simulado/);
    }
    const diffuse = OMI_SHEETS.diffuse;
    expect(diffuse.interpretation).toMatch(/no diagnostica.*tronco ni excluye oclusión/);
    expect(diffuse.lesson).toMatch(/evaluación urgente.*isquemia persistente o inestabilidad/);
    expect(OMI_SHEETS.subendo.interpretation).toMatch(/troponina elevada por sí sola tampoco establece infarto/);
    expect(OMI_SHEETS.subendo.interpretation).not.toContain("si la troponina sube es un NOMI");
    expect(OMI_SHEETS.inferior_lcx.lesson).toMatch(/síntomas isquémicos.*sospechar OMI posterior/);
    expect(OMI_SHEETS.inferior_lcx.lesson).toContain("alteraciones secundarias");
    expect(OMI_SHEETS.de_winter.interpretation).toMatch(/evaluación urgente.*no identifica por sí solo/);
    expect(OMI_SHEETS.wellens_b.context).toContain("no establece cuánto tiempo");
    expect(OMI_SHEETS.old_anterior.interpretation).toContain("ni excluye oclusión aguda superpuesta");
  });
  it("las derivaciones adicionales son una recomendación clínica, no un registro ni una confirmación del simulador", () => {
    expect(OMI_SHEETS.rv_infarct.ecg).toContain("V4R no se registra en este simulador");
    expect(OMI_SHEETS.rv_infarct.lesson).toContain("puede aportar evidencia adicional");
    expect(OMI_SHEETS.posterior.ecg).toContain("V7–V9 no se registran en este simulador");
    expect(OMI_SHEETS.inferior_lcx.notes[0].text).toContain("no registradas en este simulador");
    const extraLeadCopy = [OMI_SHEETS.rv_infarct, OMI_SHEETS.posterior, OMI_SHEETS.inferior_lcx]
      .flatMap(s => [s.ecg, s.lesson, ...s.notes.map(n => n.text)]).join(" ");
    expect(extraLeadCopy).not.toMatch(/V4R lo confirma|se vería la elevación/);
    expect(OMI_SHEETS.posterior.notes[2].text).toContain("negativas no excluyen oclusión");
  });
  it("conserva el umbral validado de Sgarbossa y vincula las cautelas a estudios primarios", () => {
    expect(OMI_SHEETS.sgarbossa.ecg).toContain("al menos 1 mm y razón ST/S ≤ −0,25");
    expect(OMI_SHEETS.sgarbossa.notes[1].text).toContain("criterios negativos no la excluyen");
    for (const [id, ref] of [
      ["diffuse", "avr2013"], ["subendo", "avr2013"],
      ["posterior", "posterior2021"], ["inferior_lcx", "posterior2021"],
      ["inferior", "avl2016"], ["pericarditis", "avl2016"],
    ] as const) {
      expect(OMI_SHEETS[id].refs).toContain(ref);
      expect(REFERENCES[ref].level).toBe("estudio");
    }
    expect(REFERENCES.udmi2018.cite).toContain("Referencia histórica de los criterios implementados");
    expect(OMI_SHEETS.inferior.notes[1].text).toContain("no excluye oclusión inferior");
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
    expect(line(d, "T")).toMatch(/Ondas T invertidas en III y aVF; ondas T prominentes en V3/);
    expect(d.lines.find((l) => l.key === "ST")!.info).toBe("st");
    expect(d.summary).toContain("12 derivaciones");
  });
  it("el ejemplo sinusal no convierte la ausencia de hallazgos seleccionados en normalidad clínica", () => {
    const d = read("sinus");
    expect(line(d, "ST")).toBe("No se destacan cambios del ST con las reglas de esta descripción.");
    expect(line(d, "T")).toBe("No se destacan alteraciones de la onda T con estas reglas descriptivas.");
    expect(line(d, "Q")).toBe("Sin ondas Q patológicas.");
    expect(d.summary).not.toMatch(/J\+60|T\/QRS/);
    expect(structuredDescription(preset("sinus"), synthesize(preset("sinus"), 10), "Ritmo sinusal").summary)
      .toMatch(/^Electrocardiograma de 12 derivaciones \(25 mm\/s, 10 mm\/mV\) en ritmo sinusal, frecuencia 72 lpm, con PR de \d+ ms, QRS de \d+ ms y QTc de \d+ ms, y eje QRS normal \(\d+°\)\. No se destacan cambios del ST con las reglas de esta descripción\. .* En suma: ritmo sinusal\.$/);
  });
  it("De Winter: descenso ascendente y T prominentes; Wellens: T bifásicas o invertidas", () => {
    const d = read("de_winter");
    expect(line(d, "ST")).toMatch(/^Descenso del ST con pendiente ascendente en V1–V6/);
    expect(line(d, "T")).toMatch(/ondas T prominentes en [^.]*V2–V6|Ondas T prominentes/i);
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
    // The measured T prominence remains visible with LBBB; QRS width does not
    // establish that all repolarization findings are secondary.
    expect(line(read("lbbb"), "T")).toMatch(/prominentes/);
    expect(line(read("lbbb"), "ST/QRS")).toContain("no permite atribuir");
    expect(line(read("posterior"), "ST")).toMatch(/máximo en V[23]/);
    const lcx = leadMeasures(synthesize(preset("inferior_lcx"), 10)), at = (l: string) => lcx.find((m) => m.lead === l)!.j0;
    expect(at("II")).toBeGreaterThanOrEqual(at("III"));
  });
  it("cada línea clínica abre sus criterios, referencias y valores medidos", () => {
    const d = read("old_inferior"), html = structuredDescriptionHtml(d);
    expect(html.match(/data-action="description-info"/g)).toHaveLength(4);
    expect(html).toContain('data-action="st-zoom"');
    expect(html).toContain('data-action="present-30"');
    const axis = descriptionInfoHtml("axis", d.measures, d.axis);
    expect(axis).toContain("<svg class=\"hexaxial\"");
    expect(axis).toContain("De −30° a +90°");
    expect(axis).toContain("10.1161/CIRCULATIONAHA.106.180200");
    const st = descriptionInfoHtml("st", d.measures);
    expect(st).toContain("¿Punto J, J+60 o J+80?");
    expect(st).toContain("10.1161/01.cir.0000034670.06526.15");
    const q = descriptionInfoHtml("q", d.measures);
    expect(q).toContain("Cuarta definición universal");
    expect(q).toContain("https://doi.org/10.1161/CIR.0000000000000617");
    expect(q).toMatch(/<tr class="info-hit"><td>III<\/td>/);
    expect(descriptionInfoHtml("st", d.measures)).toContain("1,5 mm en mujeres");
    expect(descriptionInfoHtml("t", d.measures)).toContain("10.1161/CIRCULATIONAHA.108.191096");
  });
  it("permite una sola lectura desplegable conservando datos y herramientas ST", () => {
    const d = read("old_inferior"), html = structuredDescriptionHtml(d, false, true);
    expect(html).not.toContain("<details");
    expect(html).not.toContain('data-action="description-info"');
    for (const action of ["st-zoom", "st-distribution", "present-30"])
      expect(html).toContain(`data-action="${action}"`);
    expect([...html.matchAll(/<dt>/g)]).toHaveLength(d.lines.length);
    const folded = structuredDescriptionHtml(d, false);
    expect(folded).toContain("<summary>Descripción estructurada</summary>");
    expect(folded).not.toMatch(/<summary>[^]*?<button[^]*?<\/summary>/);
  });
});
