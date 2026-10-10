/**
 * Ventricular fibrillation learned from the MIT-BIH Malignant Ventricular Ectopy
 * and Creighton University Ventricular Tachyarrhythmia databases (PhysioNet vfdb
 * and cudb, ODC-By 1.0; 37 records, 579 four-second windows;
 * scripts/fidelity/build_vf_model.py).
 *
 * Each patient (= seed) draws its spectrum (dominant-frequency peak, width and
 * harmonic) and its amplitude (RMS of lead II-like recordings). The heart vector
 * is three band-limited sources with that spectrum along a random orientation with
 * decreasing weights (1, 0.7, 0.5), scaled so lead II has the patient's RMS. Those
 * databases record one or two leads: the spatial distribution over twelve leads is
 * illustrative, not learned.
 */
import raw from "./vf-model.json";
import { normal, random } from "../random";
import { DOWER } from "../leads";
import type { Vec } from "../leads";
import { filteredSources, peakSpectrumFir, upsampled } from "./spectral";

const FS_MODEL = 100;

function decode(b64: string): Float64Array {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Float64Array.from(new Float32Array(bytes.buffer));
}
const model = (() => {
  let m: { mean: Float64Array; chol: Float64Array; names: string[] } | null = null;
  return () => (m ??= { mean: decode(raw.joint.mean), chol: decode(raw.joint.cholesky), names: raw.joint.names });
})();

export interface VfPatient {
  fir: Float64Array;
  dominantHz: number;
  /** 3 × 3 mixing (row-major) from unit sources to the heart vector, mV. */
  mixing: Float64Array;
  rmsII: number;
}

const patients = new Map<number, VfPatient>();
export function vfPatient(seed: number): VfPatient {
  const hit = patients.get(seed);
  if (hit) return hit;
  const m = model(), M = m.names.length, rng = random(((seed ^ 0x7f1b) * 2654435761) >>> 0);
  const e = Array.from({ length: M }, () => normal(rng)), z = new Float64Array(M);
  for (let a = 0, base = 0; a < M; base += ++a) {
    let v = m.mean[a];
    for (let b = 0; b <= a; b++) v += m.chol[base + b] * e[b];
    z[a] = v;
  }
  const at = (name: string) => z[m.names.indexOf(name)];
  const { fir, dominantHz } = peakSpectrumFir({
    peak: Math.max(0, at("peak")), F: Math.min(9.5, Math.max(2.5, at("dominant_hz"))),
    width: Math.min(2.5, Math.max(0.2, Math.exp(at("log_width")))), harmonic: Math.min(1, Math.max(0, at("harmonic"))),
  }, 2, 14, FS_MODEL);
  // Random orthonormal frame (Gram–Schmidt on Gaussian vectors) with decreasing weights.
  const vecs: Vec[] = [];
  for (let k = 0; k < 3; k++) {
    const v: Vec = [normal(rng), normal(rng), normal(rng)];
    for (const u of vecs) { const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; for (let j = 0; j < 3; j++) v[j] -= d * u[j]; }
    const n = Math.hypot(...v); vecs.push(v.map((x) => x / n) as Vec);
  }
  const weights = [1, 0.7, 0.5], mixing = new Float64Array(9);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) mixing[j * 3 + k] = vecs[k][j] * weights[k];
  // Scale so lead II's variance (unit-variance sources) is the patient's RMS².
  const rmsII = Math.min(1.6, Math.max(0.08, Math.exp(at("log_rms_mv"))));
  let varII = 0;
  for (let k = 0; k < 3; k++) {
    let proj = 0;
    for (let j = 0; j < 3; j++) proj += DOWER.II[j] * mixing[j * 3 + k];
    varII += proj * proj;
  }
  const g = rmsII / Math.sqrt(varII);
  for (let i = 0; i < 9; i++) mixing[i] *= g;
  const p = { fir, dominantHz, mixing, rmsII };
  if (patients.size > 64) patients.clear();
  patients.set(seed, p);
  return p;
}

/** Adds the fibrillating heart vector to x/y/z accumulators sampled at `fs`. */
export function addVentricularFibrillation(xyz: Float64Array[], fs: number, seed: number): void {
  const p = vfPatient(seed), n = xyz[0].length, ratio = fs / FS_MODEL, count = Math.ceil(n / ratio) + 3;
  const src = filteredSources(random(((seed ^ 0x5f3c) * 2246822519) >>> 0), 3, count, p.fir);
  const comp = new Float64Array(count);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < count; i++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += p.mixing[j * 3 + k] * src[k][i];
      comp[i] = v;
    }
    for (let i = 0; i < n; i++) xyz[j][i] += upsampled(comp, i, ratio);
  }
}
