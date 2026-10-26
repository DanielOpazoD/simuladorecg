import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromPreset, PRESETS, presetById } from "../src/presets/catalog";
import { CLINICAL_REVIEW_PENDING, modelProvenance } from "../src/presets/model-provenance";
import { presetEvidence, presetEvidenceMarkdown } from "../src/presets/evidence-matrix";
import type { ECGCase } from "../src/engine/types";
import { LEADS } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";

const load = (id: string, patch: Partial<ECGCase> = {}): ECGCase => ({ ...fromPreset(presetById(id)!), ...patch });

describe("procedencia efectiva, distinta de una etiqueta o validación clínica", () => {
  it("cubre los 63 presets activos y conserva los cinco pendientes", () => {
    const rows = presetEvidence();
    expect(rows.filter(r => r.estado === "aproximado")).toHaveLength(63);
    expect(rows.filter(r => r.estado === "pendiente")).toHaveLength(5);
    expect(rows.map(r => r.id)).toEqual(PRESETS.map(p => p.id));
    expect(rows.every(r => r.validacionClinica === "pendiente")).toBe(true);
    for (const row of rows.filter(r => r.estado === "aproximado")) {
      expect(row.limitacion).toContain(CLINICAL_REVIEW_PENDING);
      expect(row.evidencia).toContain("no acredita plausibilidad clínica");
    }
    expect(rows.find(r => r.id === "sinus")?.mecanismo).toContain("PTB-XL (NORM)");
    expect(rows.find(r => r.id === "lbbb")?.mecanismo).toContain("CLBBB");
    expect(rows.find(r => r.id === "pvc")?.mecanismo).toContain("Ruta de ectopia ventricular: PVC");
    expect(rows.find(r => r.id === "vvi")?.mecanismo).toContain("Ruta de complejos estimulados: VPACE");
    expect(rows.find(r => r.id === "aai")?.mecanismo).not.toContain("VPACE");
  });

  it("cambia la procedencia al modificar la combinación, sin inferirla del presetId", () => {
    const c = load("anterior"), before = structuredClone(c);
    expect(modelProvenance(c).sources).toEqual(["PTB-XL", "STAFF III"]);
    expect(modelProvenance({ ...c, phase: "hyperacute" }).sources).toContain("STAFF III");
    expect(modelProvenance({ ...c, phase: "evolving" }).sources).toEqual([]);
    expect(modelProvenance({ ...c, phase: "chronic" }).summary).toContain("ASMI");
    expect(modelProvenance({ ...c, conduction: "lbbb" }).sources).toEqual([]);
    expect(modelProvenance(load("lbbb", { overload: "lv" })).sources).toEqual([]);
    expect(modelProvenance(load("hyperk")).sources).toEqual([]);
    expect(modelProvenance(load("vt", { ventricularSource: "representative_vt" })).sources).toEqual([]);
    expect(c).toEqual(before);
  });

  it("separa el espectro FV de una distribución espacial aprendida", () => {
    const p = modelProvenance(load("vf"));
    expect(p.sources).toEqual(["vfdb/cudb"]);
    expect(p.limitations.join(" ")).toContain("distribución en doce derivaciones no fue aprendida");
    expect(modelProvenance(load("flutter")).sources).toEqual(["PTB-XL", "Georgia"]);
    expect(modelProvenance(load("asystole")).summary).toContain("Sin actividad cardíaca organizada");
    expect(modelProvenance(load("vvi", { pacingBehavior: "demand-no-capture", intrinsicRate: 0 })).summary).toContain("sin captura");
  });

  it.each([60, 90])("VVI con escape intrínseco a %s/min no atribuye los complejos inhibidos a VPACE", intrinsicRate => {
    const c = load("vvi", { hr: 60, intrinsicRate, pacingBehavior: "demand", acquisition: "ideal", filter: "off" });
    const s = synthesize(c, 10), kernels = synthesize(c, 10, { learnedBase: false });
    expect(s.events.beats.length).toBeGreaterThan(0);
    expect(s.events.beats.every(b => b.kind === "ventricular" && !b.ownDurations)).toBe(true);
    expect(s.events.spikes).toHaveLength(0);
    for (const lead of LEADS) expect(s.leads[lead].every((v, i) => Number.isFinite(v) && v === kernels.leads[lead][i]), lead).toBe(true);
    const provenance = modelProvenance(c);
    expect(provenance.sources).toEqual([]);
    expect(provenance.summary).toContain("escape ventricular paramétricos");
    expect(provenance.summary).not.toMatch(/NORM|VPACE|aprendid/);
  });

  it("VVI a demanda conserva VPACE cuando el calendario sí emite captura estimulada", () => {
    const c = load("vvi", { hr: 60, intrinsicRate: 45, pacingBehavior: "demand", acquisition: "ideal", filter: "off" });
    const s = synthesize(c, 10), provenance = modelProvenance(c);
    expect(s.events.beats.length).toBeGreaterThan(0);
    expect(s.events.beats.every(b => b.kind === "paced" && b.ownDurations)).toBe(true);
    expect(s.events.spikes.length).toBeGreaterThan(0);
    expect(provenance.sources).toEqual(["PTB-XL"]);
    expect(provenance.summary).toContain("VPACE");
  });

  it("impide que una regeneración de evidencias restaure la estrategia histórica", () => {
    expect(JSON.parse(readFileSync("docs/estado-presets.json", "utf8"))).toEqual(presetEvidence());
    expect(readFileSync("docs/estado-presets.md", "utf8").replaceAll("\r\n", "\n")).toBe(presetEvidenceMarkdown());
    expect(presetEvidenceMarkdown()).not.toContain("Morfología paramétrica representativa; sin validación contra ECG de pacientes.");
  });
});
