import { describe, expect, it } from "vitest";
import { fromPreset, presetById } from "../src/presets/catalog";
import { synthesize } from "../src/engine/signal";
import { LEADS } from "../src/engine/types";
import { descriptionInfoHtml } from "../src/ui/description-info";
import { ST_REFERENCE, stFindings, structuredDescription, tFindings, type LeadMeasure } from "../src/ui/structured-description";

const measures = (j: number): LeadMeasure[] => LEADS.map(lead => ({
  lead, beats: 4, j0: lead === "V2" || lead === "V3" ? j : 0, j60: 0,
  tMax: 0.2, tMin: 0, tPositiveFirst: true, qrs: 1, qDepth: 0, qDur: 0, qs: false,
}));

describe("la descripción comunica una observación, no certeza diagnóstica", () => {
  it("V2–V3: prueba ambos lados de la referencia sin presentarla como umbral individualizado", () => {
    expect(stFindings(measures(0.2 - 0.00001)).meetsCriterion).toBe(false);
    expect(stFindings(measures(0.2)).elevation.map(r => r.lead)).toEqual(["V2", "V3"]);
    expect(stFindings(measures(0.2 + 0.00001)).meetsCriterion).toBe(true);
    const c = fromPreset(presetById("sinus")!), s = synthesize(c, 10);
    const d = structuredDescription(c, s);
    expect(d.lines.find(l => l.key === "Ref. ST")?.text).toBe(ST_REFERENCE);
    expect(ST_REFERENCE).toMatch(/varón ≥40 años/);
    expect(ST_REFERENCE).toMatch(/edad y sexo no configurados/);
    const help = descriptionInfoHtml("st", measures(0.2));
    expect(help).toContain("No es un umbral individualizado");
    expect(help).toContain("no equivale a normalidad ni excluye isquemia");
  });

  it.each(["lbbb", "sgarbossa"])("%s: no oculta una T prominente por la anchura del QRS", id => {
    const c = { ...fromPreset(presetById(id)!), acquisition: "ideal" as const, filter: "off" as const };
    const s = synthesize(c, 10);
    // Inject a large T-window voltage to isolate prose semantics from the model's
    // typical amplitude. This fixture does not claim a physiological phenotype.
    for (const b of s.events.beats) {
      if (b.qrs === undefined || b.qt === undefined) continue;
      const lo = Math.max(0, Math.ceil((b.time + b.qrs + 0.03) * s.fs));
      const hi = Math.min(s.leads.V4.length, Math.floor((b.time + b.qt - 0.02) * s.fs));
      for (let i = lo; i < hi; i++) s.leads.V4[i] += 1.5;
    }
    const before = structuredClone(s), d = structuredDescription(c, s);
    expect(d.lines.find(l => l.key === "T")?.text).toMatch(/T prominentes.*V4/);
    expect(d.lines.find(l => l.key === "ST/QRS")?.text).toContain("no permite atribuir");
    expect(d.summary).not.toContain("Onda T normal");
    expect(s).toEqual(before);
  });

  it("una T alta en términos absolutos no se llama grande respecto de un QRS todavía mayor", () => {
    const c = { ...fromPreset(presetById("lbbb")!), qrsAmp: 3, acquisition: "ideal" as const, filter: "off" as const };
    const d = structuredDescription(c, synthesize(c, 10));
    const prominent = tFindings(d.measures).prominent;
    expect(prominent.some(r => r.tMax >= 1 && r.tMax / r.qrs < 0.8)).toBe(true);
    expect(d.lines.find(l => l.key === "T")?.text).toContain("T prominentes");
    expect(d.lines.find(l => l.key === "T")?.text).not.toContain("grandes para su QRS");
  });
});
