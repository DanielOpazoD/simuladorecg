/// <reference types="vite/client" />
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

export type Artery = "LAD" | "RCA" | "LCX";
interface RawArtery { n: number; k: number; mean: string; basis: string; basisScale: string; cholesky: number[] }
export interface RawIschemiaModel { phases: { name: string; points: number }[]; leads: string[]; states: string[]; arteries: Partial<Record<Artery, RawArtery>> }
interface ArteryModel { k: number; dim: number; mean: Float64Array; basis: Float64Array; cholesky: Float64Array }

const LOADERS = import.meta.glob<RawIschemiaModel>("./ischemia/*.json", { import: "default" });
let model: { points: number; arteries: Partial<Record<Artery, ArteryModel>> } | null = null;

function decodeF32(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Float64Array.from(new Float32Array(bytes.buffer));
}
function decodeI16(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return new Int16Array(bytes.buffer);
}
export function registerIschemiaModel(r: RawIschemiaModel): void {
  const points = r.phases.reduce((s, p) => s + p.points, 0), arteries: Partial<Record<Artery, ArteryModel>> = {};
  for (const [name, a] of Object.entries(r.arteries) as [Artery, RawArtery][]) {
    const mean = decodeF32(a.mean), dim = mean.length, b16 = decodeI16(a.basis), scale = decodeF32(a.basisScale);
    if (dim !== 2 * points * 8) throw new Error(`Modelo de isquemia ${name} inconsistente.`);
    const basis = new Float64Array(a.k * dim);
    for (let i = 0; i < a.k; i++) for (let j = 0; j < dim; j++) basis[i * dim + j] = b16[i * dim + j] * scale[i];
    arteries[name] = { k: a.k, dim, mean, basis, cholesky: Float64Array.from(a.cholesky) };
  }
  model = { points, arteries };
  deltas.clear();
}
export const hasIschemiaModel = () => model !== null;
export async function ensureIschemiaModel(): Promise<void> {
  if (model) return;
  const load = LOADERS["./ischemia/ischemia-model.json"];
  if (!load) throw new Error("No existe el modelo aprendido de isquemia aguda.");
  registerIschemiaModel(await load());
}
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
  const rng = random(((c.seed ^ 0x15c4) * 2246822519) >>> 0), e = Array.from({ length: a.k }, () => normal(rng)), z = new Float64Array(a.k);
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
