/**
 * Flutter (F) waves learned from 28 patients of the Georgia 12-lead database and
 * PTB-XL (CC BY 4.0; scripts/fidelity/build_flutter_model.py).
 *
 * Each patient (= seed) draws one F-wave cycle in the eight independent leads (a
 * point of a shrunk Gaussian over the population's cycle templates, aligned by
 * circular correlation) and the phase of that cycle at which the QRS energy peak
 * arrives (a circular distribution learned from patients with fixed conduction).
 * The case keeps its atrial rate (the learned range is 171–330/min) and conduction
 * ratio; the cycle is stretched to the case's atrial cycle and anchored at the
 * middle of each conducted QRS. No recording is stored or reproduced.
 */
import raw from "./flutter-model.json";
import { normal, random } from "../random";

const NL = 8;

function decode(b64: string): Float64Array {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Float64Array.from(new Float32Array(bytes.buffer));
}
let cached: { bins: number; mean: Float64Array; basis: Float64Array; k: number; jointMean: Float64Array; jointCholesky: Float64Array; names: string[]; scale: number; phase: { mean: number; sd: number } } | null = null;
function model() {
  if (!cached) {
    cached = {
      bins: raw.bins, mean: decode(raw.template.mean), basis: decode(raw.template.basis), k: raw.template.k,
      jointMean: decode(raw.joint.mean), jointCholesky: decode(raw.joint.cholesky), names: raw.joint.names,
      scale: (raw as { sampleScale?: number }).sampleScale ?? 1, phase: raw.qrsPhase,
    };
  }
  return cached;
}

export interface FlutterPatient {
  /** One F-wave cycle, bins × 8 leads (mV), phase 0 at the nadir of lead II. */
  cycle: Float64Array;
  /** Phase of the cycle (0–1) at the energy peak (≈ middle) of a conducted QRS. */
  qrsPhase: number;
}

const patients = new Map<number, FlutterPatient>();
export function flutterPatient(seed: number): FlutterPatient {
  const hit = patients.get(seed);
  if (hit) return hit;
  const m = model(), M = m.names.length, rng = random(((seed ^ 0xf1a7) * 2654435761) >>> 0);
  const e = Array.from({ length: M }, () => normal(rng) * m.scale), z = new Float64Array(M);
  for (let a = 0, base = 0; a < M; base += ++a) {
    let v = m.jointMean[a];
    for (let b = 0; b <= a; b++) v += m.jointCholesky[base + b] * e[b];
    z[a] = v;
  }
  const dim = m.mean.length, cycle = Float64Array.from(m.mean);
  for (let i = 0; i < m.k; i++) for (let j = 0; j < dim; j++) cycle[j] += m.basis[i * dim + j] * z[i];
  // Keep the cycle zero-mean per lead (a periodic wave has no DC offset).
  for (let l = 0; l < NL; l++) {
    let s = 0;
    for (let b = 0; b < m.bins; b++) s += cycle[b * NL + l];
    for (let b = 0; b < m.bins; b++) cycle[b * NL + l] -= s / m.bins;
  }
  const phase = m.phase.mean + m.phase.sd * normal(rng);
  const p: FlutterPatient = { cycle, qrsPhase: ((phase % 1) + 1) % 1 };
  if (patients.size > 64) patients.clear();
  patients.set(seed, p);
  return p;
}

/**
 * Adds F waves at the case's atrial rate to eight independent-lead accumulators
 * (sampled at `fs`, sample 0 = time 0). `qrsMiddle` is the middle (energy peak) of
 * a conducted QRS: the cycle is anchored so it falls at the patient's phase.
 */
export function addFlutterWaves(acc: Float64Array[], fs: number, seed: number, atrialRate: number, qrsMiddle: number): void {
  const m = model(), p = flutterPatient(seed), cl = 60 / atrialRate, n = acc[0].length, B = m.bins;
  const t0 = qrsMiddle - p.qrsPhase * cl;
  for (let i = 0; i < n; i++) {
    const phase = ((((i / fs - t0) / cl) % 1) + 1) % 1, x = phase * B, j = Math.floor(x) % B, f = x - Math.floor(x);
    const at = (k: number, l: number) => p.cycle[(((k % B) + B) % B) * NL + l];
    for (let l = 0; l < NL; l++) {
      // Periodic Catmull–Rom over the cycle.
      const p0 = at(j - 1, l), p1 = at(j, l), p2 = at(j + 1, l), p3 = at(j + 2, l);
      acc[l][i] += 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }
  }
}
