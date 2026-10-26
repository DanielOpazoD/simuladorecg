/**
 * Acute coronary occlusion learned from STAFF III (PhysioNet, ODC-By 1.0; balloon
 * angioplasty, scripts/fidelity/build_ischemia_model.py).
 *
 * Per occluded artery (LAD, RCA, LCx) the model holds the change of the beat during
 * occlusion — ischemic minus baseline median beat, in the ventricular phases of the
 * shape model (QRS, ST, T, post-T) and the eight independent leads — for two states:
 * hyperacute (15–45 s of occlusion) and acute (last 30 s). Each patient (= seed)
 * draws one coherent pair from a shrunk Gaussian over the responders; the lesion
 * intensity control scales it (2 = the patient's own change). The engine adds it to
 * the patient's learned beat. No recording is stored or reproduced.
 */
import type { ECGCase } from "../types";
import { normal, random } from "../random";
import { ModelIntegrity, VENTRICULAR_PHASE_LAYOUT } from "./model-integrity";

export type Artery = "LAD" | "RCA" | "LCX";
interface RawArtery { n: number; k: number; mean: string; basis: string; basisScale: string; cholesky: number[] }
export interface RawIschemiaModel { schema: string; phases: { name: string; points: number }[]; leads: string[]; states: string[]; sampleScale?: number; arteries: Partial<Record<Artery, RawArtery>> }
interface ArteryModel { k: number; dim: number; mean: Float64Array; basis: Float64Array; cholesky: Float64Array }

let model: { points: number; scale: number; arteries: Partial<Record<Artery, ArteryModel>> } | null = null;

export function registerIschemiaModel(r: RawIschemiaModel): void {
  const v = new ModelIntegrity("isquemia");
  v.object(r, "raíz");
  v.check(r.schema === "ecg-lab-ischemia-model/1", "schema");
  v.phases(r.phases, VENTRICULAR_PHASE_LAYOUT);
  v.ordered(r.leads, ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"], "leads");
  v.ordered(r.states, ["acute", "hyperacute"], "states");
  v.object(r.arteries, "arteries");
  const names = Object.keys(r.arteries);
  v.check(names.length === 3 && ["LAD", "RCA", "LCX"].every(name => names.includes(name)), "arteries");
  const sampleScale = v.number(r.sampleScale === undefined ? 1 : r.sampleScale, "sampleScale", 0);
  const points = r.phases.reduce((s, p) => s + p.points, 0), arteries: Partial<Record<Artery, ArteryModel>> = {};
  for (const [name, a] of Object.entries(r.arteries) as [Artery, RawArtery][]) {
    v.object(a, `arteries.${name}`);
    v.integer(a.n, `${name}.n`);
    const k = v.integer(a.k, `${name}.k`), dim = 2 * points * 8;
    const mean = v.float32(a.mean, dim, `${name}.mean`), b16 = v.int16(a.basis, k * dim, `${name}.basis`);
    const scale = v.float32(a.basisScale, k, `${name}.basisScale`, 0);
    const cholesky = Float64Array.from(v.numbers(a.cholesky, k * (k + 1) / 2, `${name}.cholesky`));
    v.cholesky(cholesky, k, 1, `${name}.cholesky.diagonal`);
    const basis = new Float64Array(k * dim);
    for (let i = 0; i < k; i++) for (let j = 0; j < dim; j++) basis[i * dim + j] = b16[i * dim + j] * scale[i];
    arteries[name] = { k, dim, mean, basis, cholesky };
  }
  model = { points, scale: sampleScale, arteries };
  deltas.clear();
}
export const hasIschemiaModel = () => model !== null;
/** Tests: drop the loaded model to exercise on-demand loading. */
export function forgetIschemiaModel(): void { model = null; deltas.clear(); }
/** Scripts in Node (not the test runner) read the model from disk, like the class models. */
function fromDisk(): boolean {
  const host = (globalThis as { process?: { env?: Record<string, string | undefined>; cwd?: () => string; getBuiltinModule?: (id: string) => unknown } }).process;
  if (!host?.getBuiltinModule || !host.cwd || host.env?.VITEST) return false;
  const fs = host.getBuiltinModule("node:fs") as { existsSync(p: string): boolean; readFileSync(p: string, e: string): string };
  const file = `${host.cwd()}/src/engine/realistic/ischemia/ischemia-model.json`;
  if (!fs.existsSync(file)) return false;
  registerIschemiaModel(JSON.parse(fs.readFileSync(file, "utf8")) as RawIschemiaModel);
  return true;
}

/** The occluded artery whose learned change the case uses, or null (kernels). */
export function learnedIschemiaArtery(c: Pick<ECGCase, "ischemia" | "phase">): Artery | null {
  if (c.phase !== "acute" && c.phase !== "hyperacute") return null;
  return c.ischemia === "anterior" ? "LAD" : c.ischemia === "inferior_rca" ? "RCA" : c.ischemia === "inferior_lcx" ? "LCX" : null;
}

const deltas = new Map<string, Float64Array>();
/**
 * The patient's change of the beat (ventricular phases × 8 leads, mV) for the
 * case's state, scaled by the lesion intensity (2 = as learned).
 */
export function ischemiaDelta(c: Pick<ECGCase, "ischemia" | "phase" | "seed" | "st">): Float64Array | null {
  const artery = learnedIschemiaArtery(c);
  if (!artery) return null;
  if (!model && !fromDisk()) throw new Error("El modelo aprendido de isquemia aguda no está cargado.");
  const a = model!.arteries[artery];
  if (!a) return null;
  const key = [artery, c.phase, c.seed, c.st].join("|");
  const hit = deltas.get(key);
  if (hit) return hit;
  const rng = random(((c.seed ^ 0x15c4) * 2246822519) >>> 0), e = Array.from({ length: a.k }, () => normal(rng) * model!.scale), z = new Float64Array(a.k);
  for (let i = 0, base = 0; i < a.k; base += ++i) for (let j = 0; j <= i; j++) z[i] += a.cholesky[base + j] * e[j];
  const half = a.dim / 2, off = c.phase === "hyperacute" ? half : 0, gain = Math.max(0, c.st) / 2, out = new Float64Array(half);
  for (let j = 0; j < half; j++) {
    let v = a.mean[off + j];
    for (let i = 0; i < a.k; i++) v += a.basis[i * a.dim + off + j] * z[i];
    out[j] = v * gain;
  }
  if (deltas.size > 64) deltas.clear();
  deltas.set(key, out);
  return out;
}
