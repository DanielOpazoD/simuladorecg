import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { registerShapeModel, shapeModel, hasShapeModel, forgetClassShapeModels, type ModelCode, type RawShapeModel } from "../src/engine/realistic/shape-model";
import { registerIschemiaModel, hasIschemiaModel, forgetIschemiaModel, ischemiaDelta, type RawIschemiaModel } from "../src/engine/realistic/ischemia";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../src/engine/realistic/${file}.json`, import.meta.url), "utf8"));
const raw = () => read("models/IRBBB") as RawShapeModel;
const ischemia = () => read("ischemia/ischemia-model") as RawIschemiaModel;
function changeFloat32(encoded: string, index: number, value: number): string {
  const bytes = Buffer.from(encoded, "base64");
  bytes.writeFloatLE(value, index * 4);
  return bytes.toString("base64");
}
const lesion = { ischemia: "anterior", phase: "acute", seed: 36, st: 2 } as const;

beforeEach(() => { forgetClassShapeModels(); forgetIschemiaModel(); });

describe("integridad antes de publicar una población aprendida", () => {
  // Adversarial mutations are independent of the decoder's implementation:
  // each would otherwise pass missing/incorrect numeric input to synthesis.
  const malformed: [string, (r: RawShapeModel) => void][] = [
    ["base truncada", r => { r.basis = ""; }],
    ["base con bytes sobrantes", r => { r.basis += "AAAA"; }],
    ["base64 inválido", r => { r.mean = "no es base64"; }],
    ["infinito en la media", r => { r.mean = changeFloat32(r.mean, 0, Infinity); }],
    ["NaN en una escala", r => { r.basisScale = changeFloat32(r.basisScale, 0, NaN); }],
    ["escala de base negativa", r => { r.basisScale = changeFloat32(r.basisScale, 0, -1); }],
    ["componentes fraccionarios", r => { r.components = 1.5; }],
    ["derivaciones intercambiadas", r => { [r.leads[0], r.leads[1]] = [r.leads[1], r.leads[0]]; }],
    ["fase duplicada", r => { r.phases[3].name = "p"; }],
    ["rejilla de fase incompatible", r => { r.phases[3].points--; }],
    ["nombre escalar ausente", r => { r.joint.names[r.joint.names.indexOf("log_qrs")] = "otro"; }],
    ["nombres duplicados", r => { r.joint.names[1] = r.joint.names[0]; }],
    ["covarianza truncada", r => { r.joint.cov.pop(); }],
    ["varianza negativa", r => { r.joint.cov[0] = -1; }],
    ["covarianza asimétrica", r => { r.joint.cov[1]++; }],
    ["coeficiente no numérico", r => { (r.joint.mean as unknown[])[0] = "0"; }],
    ["peso negativo", r => { r.mixture.weights[0] = -1; }],
    ["mezcla sin masa", r => { r.mixture.weights.fill(0); }],
    ["mezcla sin normalizar", r => { r.mixture.weights[0] += 0.1; }],
    ["mezcla vacía", r => { r.mixture.weights = []; }],
    ["medias de mezcla truncadas", r => { r.mixture.means = ""; }],
    ["Cholesky de mezcla truncada", r => { r.mixture.cholesky = ""; }],
    ["Cholesky de mezcla no finita", r => { r.mixture.cholesky = changeFloat32(r.mixture.cholesky, 1, Infinity); }],
    ["diagonal Cholesky negativa", r => { r.mixture.cholesky = changeFloat32(r.mixture.cholesky, 0, -1); }],
    ["entrada pre-P vacía", r => { r.preMs = 0; }],
    ["salida no finita", r => { r.postMs = NaN; }],
    ["amplitud QRS de referencia cero", r => { r.population.magnitudesP50[1] = 0; }],
    ["duración de referencia inválida", r => { r.population.durationsMsP50[0] = -1; }],
    ["población equivocada", r => { r.diagnosis = "CLBBB"; }],
  ];
  it.each(malformed)("rechaza %s sin dejar una población cargada", (_name, mutate) => {
    const r = raw(); mutate(r);
    expect(() => registerShapeModel("IRBBB", r)).toThrow(/Modelo aprendido IRBBB inconsistente/);
    expect(hasShapeModel("IRBBB")).toBe(false);
  });
  it.each([null, -1, NaN, "1"])("rechaza sampleScale=%s", sampleScale => {
    const r = { ...raw(), sampleScale } as unknown as RawShapeModel;
    expect(() => registerShapeModel("IRBBB", r)).toThrow(/sampleScale/);
    expect(hasShapeModel("IRBBB")).toBe(false);
  });
  it("un rechazo admite después el modelo válido y una señal finita", () => {
    expect(() => registerShapeModel("IRBBB", { ...raw(), basis: "" })).toThrow();
    registerShapeModel("IRBBB", raw());
    expect(hasShapeModel("IRBBB")).toBe(true);
    const c = { ...fromPreset(presetById("irbbb")!), seed: 77816, acquisition: "ideal" as const };
    const signal = synthesize(c, 10);
    for (const samples of Object.values(signal.leads)) expect(samples.every(Number.isFinite)).toBe(true);
  });
  it("un segundo intento no invalida la clase ya cargada", () => {
    registerShapeModel("IRBBB", raw());
    const loaded = shapeModel("IRBBB");
    registerShapeModel("IRBBB", { ...raw(), basis: "" }); // existing first-load-wins contract
    expect(shapeModel("IRBBB")).toBe(loaded);
    expect(loaded.basis.every(Number.isFinite)).toBe(true);
  });
  it("mutar el objeto de entrada tras validar no altera la población publicada", () => {
    const r = raw(); registerShapeModel("IRBBB", r);
    const loaded = shapeModel("IRBBB"), oldWeight = loaded.mixture.weights[0], oldName = loaded.names[0];
    r.mixture.weights[0] = 0; r.joint.names[0] = "corrupto"; r.population.magnitudesP50[1] = 0;
    expect(loaded.mixture.weights[0]).toBe(oldWeight);
    expect(loaded.names[0]).toBe(oldName);
    expect(loaded.population.magnitudesP50[1]).toBeGreaterThan(0);
  });
  it.each(["NORM", "CLBBB", "CRBBB", "IRBBB", "LAFB", "LVH", "IMI", "ASMI", "PVC", "VPACE"] as ModelCode[])("carga los coeficientes distribuidos de %s sin transformarlos", code => {
    const r = read(code === "NORM" ? "normal-shape-model" : `models/${code}`) as RawShapeModel;
    registerShapeModel(code, r);
    const m = shapeModel(code), decoded = (b64: string) => {
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      return new Float32Array(bytes.buffer);
    };
    const base = new Int16Array(Uint8Array.from(Buffer.from(r.basis, "base64")).buffer), scales = decoded(r.basisScale);
    expect(m.mean).toEqual(Float64Array.from(decoded(r.mean)));
    expect(m.basis.every((n, i) => n === base[i] * scales[Math.floor(i / m.dim)])).toBe(true);
  });
  it("VPACE requiere su espiga completa y finita", () => {
    const r = read("models/VPACE");
    delete r.spike;
    expect(() => registerShapeModel("VPACE", r)).toThrow(/spike/);
    expect(hasShapeModel("VPACE")).toBe(false);
    const s = read("models/VPACE"); s.spike.shape500Hz[3] = NaN;
    expect(() => registerShapeModel("VPACE", s)).toThrow(/spike.shape500Hz/);
  });
});

describe("integridad atómica del modelo de isquemia", () => {
  const malformed: [string, (r: RawIschemiaModel) => void][] = [
    ["base LCX truncada tras dos arterias válidas", r => { r.arteries.LCX!.basis = ""; }],
    ["escala LAD no finita", r => { r.arteries.LAD!.basisScale = changeFloat32(r.arteries.LAD!.basisScale, 0, Infinity); }],
    ["media RCA no finita", r => { r.arteries.RCA!.mean = changeFloat32(r.arteries.RCA!.mean, 0, NaN); }],
    ["Cholesky truncada", r => { r.arteries.LAD!.cholesky.pop(); }],
    ["Cholesky no numérica", r => { (r.arteries.LAD!.cholesky as unknown[])[0] = "1"; }],
    ["modos fraccionarios", r => { r.arteries.RCA!.k = 2.5; }],
    ["arteria ausente", r => { delete r.arteries.RCA; }],
    ["fases intercambiadas", r => { [r.phases[0], r.phases[1]] = [r.phases[1], r.phases[0]]; }],
    ["estados intercambiados", r => { r.states.reverse(); }],
    ["derivaciones intercambiadas", r => { r.leads.reverse(); }],
    ["escala negativa", r => { r.sampleScale = -1; }],
  ];
  it.each(malformed)("rechaza %s antes de publicar", (_name, mutate) => {
    const r = ischemia(); mutate(r);
    expect(() => registerIschemiaModel(r)).toThrow(/Modelo aprendido isquemia inconsistente/);
    expect(hasIschemiaModel()).toBe(false);
  });
  it("un fallo en la última arteria conserva el modelo anterior y sus deltas cacheados", () => {
    registerIschemiaModel(ischemia());
    const previous = ischemiaDelta(lesion)!;
    expect(previous.every(Number.isFinite)).toBe(true);
    const bad = ischemia(); bad.arteries.LCX!.basis = "";
    expect(() => registerIschemiaModel(bad)).toThrow(/LCX.basis/);
    expect(hasIschemiaModel()).toBe(true);
    expect(ischemiaDelta(lesion)).toBe(previous);
  });
  it("puede cargar el modelo válido después del rechazo", () => {
    const bad = ischemia(); bad.arteries.LCX!.basis = "";
    expect(() => registerIschemiaModel(bad)).toThrow();
    registerIschemiaModel(ischemia());
    expect(hasIschemiaModel()).toBe(true);
    expect(ischemiaDelta(lesion)!.every(Number.isFinite)).toBe(true);
  });
});
