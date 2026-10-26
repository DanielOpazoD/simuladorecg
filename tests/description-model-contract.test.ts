import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { LEADS, type ECGCase } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";
import { modelMetricCards } from "../src/ui/metric-cards";
import { qtModelLimits } from "../src/ui/qt-model-limits";
import { structuredDescription } from "../src/ui/structured-description";

const load = (id: string, patch: Partial<ECGCase> = {}): ECGCase => ({
  ...fromPreset(presetById(id)!), acquisition: "ideal", filter: "off", ...patch,
});

describe("la descripción respeta el dominio de los intervalos del modelo", () => {
  it.each(["vvi", "ddd", "vt", "idioventricular", "aivr", "complete_v"])("%s: no inventa QTc de latidos sin conducción normal", id => {
    const c = load(id), signal = synthesize(c, 10);
    expect(signal.events.beats.some(b => b.kind === "normal")).toBe(false);
    const before = structuredClone(signal), description = structuredDescription(c, signal);
    expect(modelMetricCards(c, signal).find(card => card.key === "qt")!.value).toBe("—");
    expect(description.lines.find(line => line.key === "D")!.text).not.toMatch(/QTc \d+/);
    expect(description.summary).not.toMatch(/QTc de \d+/);
    expect(signal).toEqual(before);
  });

  it("Wenckebach: conserva el rango PR progresivo y lo dice en la presentación", () => {
    const c = load("wenckebach"), signal = synthesize(c, 10);
    expect(signal.truth.pr).toBeNull();
    const description = structuredDescription(c, signal);
    expect(description.lines.find(line => line.key === "D")!.text).toContain("PR 160–280 ms (progresivo)");
    expect(description.summary).toContain("PR progresivo de 160 a 280 ms");
    expect(description.summary).not.toContain("PR no medible");
  });

  it("la variación PR de una ESA no se etiqueta como progresión de Wenckebach", () => {
    const c = load("pac", { pr: 160 }), signal = synthesize(c, 10);
    const description = structuredDescription(c, signal);
    expect(description.lines.find(line => line.key === "D")!.text).toContain("PR 144–160 ms (variable)");
    expect(description.summary).toContain("PR variable de 144 a 160 ms");
    expect(description.summary).not.toContain("PR progresivo");
  });

  it("describe el QT realizado cuando el mínimo del generador recorta la petición", () => {
    const c = load("sinus", { hr: 60, qrs: 240, qtc: 260, variability: 0 });
    const signal = synthesize(c, 10, { learnedBase: false });
    expect(signal.events.beats.every(b => b.qt === 0.36)).toBe(true);
    expect(qtModelLimits(c, signal).join(" ")).toContain("120 ms");
    const description = structuredDescription(c, signal);
    expect(modelMetricCards(c, signal).find(card => card.key === "qt")!.value).toBe("360<small>ms</small>");
    expect(description.lines.find(line => line.key === "D")!.text).toContain("QTc 360 ms");
    expect(description.summary).toContain("QTc de 360 ms");
    expect(c.qtc).toBe(260);
  });

  it("un registro sin eventos no toma el QTc de la configuración ni de truth", () => {
    const c = load("sinus"), signal = synthesize(c, 10);
    signal.events = { beats: [], atria: [], spikes: [] };
    signal.truth.qt = 510;
    const description = structuredDescription(c, signal);
    expect(modelMetricCards(c, signal).find(card => card.key === "qt")!.value).toBe("—");
    expect(description.summary).not.toMatch(/QTc de \d+/);
  });
});

describe("el ancho del QRS no adjudica la causa del ST", () => {
  it.each(["lbbb", "sgarbossa"])("%s: describe la incertidumbre causal, no descarta lesión primaria", id => {
    const c = load(id), signal = synthesize(c, 10), before = structuredClone(signal);
    const description = structuredDescription(c, signal);
    const note = description.lines.find(line => line.key === "ST/QRS")!.text;
    expect(note).not.toContain("Alteraciones del ST secundarias al QRS ancho");
    expect(note).toContain("no permite atribuir");
    expect(description.summary).not.toContain("Alteraciones del ST secundarias al QRS ancho");
    for (const lead of LEADS) expect(signal.leads[lead]).toEqual(before.leads[lead]);
    expect(signal.events).toEqual(before.events);
  });

  it("control negativo: un QRS estrecho no recibe el aviso de QRS ancho", () => {
    const c = load("inferior"), signal = synthesize(c, 10);
    expect(signal.events.beats.every(b => b.qrs! < 0.12)).toBe(true);
    expect(structuredDescription(c, signal).lines.some(line => line.key === "ST/QRS")).toBe(false);
  });
});
