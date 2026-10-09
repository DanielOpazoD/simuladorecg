/**
 * Fibrillatory (f) waves and RR irregularity of atrial fibrillation, learned from
 * 963 PTB-XL AFIB recordings (CC BY 4.0; scripts/fidelity/build_atrial_model.py).
 *
 * Each patient (= seed) draws, from one shrunk Gaussian over the population:
 * the spectrum of the atrial activity in V1 (dominant-frequency peak with its
 * width and a harmonic), its covariance
 * across the eight independent leads (3–12 Hz) and the coefficient of variation
 * of the RR. The f waves are a stationary multichannel process with that
 * spectrum and covariance, generated sequentially (a longer buffer never changes
 * an earlier sample). No recording is stored or reproduced.
 */
import raw from "./af-model.json";
import { normal, random } from "../random";

const NL = 8;
const TAPS = 257;

function decode(b64: string): Float64Array {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Float64Array.from(new Float32Array(bytes.buffer));
}
interface AfModel {
  fs: number;
  band: [number, number];
  spatial: { mean: Float64Array; basis: Float64Array; k: number };
  jointMean: Float64Array;
  jointCholesky: Float64Array;
  names: string[];
}
let cached: AfModel | null = null;
function model(): AfModel {
  if (cached) return cached;
  cached = {
    fs: raw.fs, band: [raw.band[0], raw.band[1]],
    spatial: { mean: decode(raw.spatial.mean), basis: decode(raw.spatial.basis), k: raw.spatial.k },
    jointMean: decode(raw.joint.mean), jointCholesky: decode(raw.joint.cholesky), names: raw.joint.names,
  };
  return cached;
}

export interface AfPatient {
  /** Lower-triangular mixing matrix (row-major 8×8): covariance of the f waves, mV². */
  mixing: Float64Array;
  /** Unit-energy FIR at the model rate shaping each independent source. */
  fir: Float64Array;
  /** Coefficient of variation of the RR intervals. */
  rrCv: number;
  /** Dominant frequency of the drawn spectrum (Hz), for reports and tests. */
  dominantHz: number;
}

const patients = new Map<number, AfPatient>();
export function afPatient(seed: number): AfPatient {
  const hit = patients.get(seed);
  if (hit) return hit;
  const m = model(), M = m.names.length, rng = random(((seed ^ 0xaf1b) * 2654435761) >>> 0);
  const e = Array.from({ length: M }, () => normal(rng)), z = new Float64Array(M);
  for (let a = 0, base = 0; a < M; base += ++a) {
    let v = m.jointMean[a];
    for (let b = 0; b <= a; b++) v += m.jointCholesky[base + b] * e[b];
    z[a] = v;
  }
  // Parametric spectrum (log10): background slope + dominant peak + harmonic.
  const at = (name: string) => z[m.names.indexOf(name)];
  const peak = Math.max(0, at("peak")), F = Math.min(9.5, Math.max(3, at("dominant_hz")));
  const width = Math.min(2.5, Math.max(0.2, Math.exp(at("log_width")))), harmonic = Math.min(1, Math.max(0, at("harmonic")));
  const g = (f: number, c: number, w: number) => Math.exp(-0.5 * ((f - c) / w) ** 2);
  const [lo, hi] = m.band;
  const amplitude = (f: number) => {
    // Only the atrial peak and its harmonic, over a small floor (fine AF without an
    // organized peak). The learned background slope is not generated: in the
    // recordings it is mostly QRST-cancellation residue, which the synthetic
    // beats already produce (generating it too lowered the measured dominant
    // frequency from 5.5 to 4.0 Hz).
    const psd = 10 ** (peak * (g(f, F, width) + harmonic * g(f, 2 * F, 1.5 * width))) - 1 + 0.02;
    // Raised-cosine edges, 0.5 Hz wide, around the learned band.
    const edge = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));
    return Math.sqrt(psd) * edge((f - (lo - 0.5)) / 0.5) * edge((hi + 0.5 - f) / 0.5);
  };
  let best = 0, dominantHz = lo;
  for (let f = lo; f <= hi; f += 0.05) if (amplitude(f) > best) { best = amplitude(f); dominantHz = f; }
  const fir = new Float64Array(TAPS), half = (TAPS - 1) / 2, df = 0.05;
  for (let k = 0; k < TAPS; k++) {
    let s = 0;
    for (let f = lo - 0.5; f <= hi + 0.5; f += df) s += amplitude(f) * Math.cos((2 * Math.PI * f * (k - half)) / m.fs);
    fir[k] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (TAPS - 1)));
  }
  const energy = Math.sqrt(fir.reduce((a, v) => a + v * v, 0));
  for (let k = 0; k < TAPS; k++) fir[k] /= energy;
  // Spatial covariance from its log-Cholesky coordinates.
  const kv = m.spatial.k, nv = m.spatial.mean.length, chol = Float64Array.from(m.spatial.mean), v0 = m.names.indexOf("v0");
  for (let i = 0; i < kv; i++) for (let j = 0; j < nv; j++) chol[j] += m.spatial.basis[i * nv + j] * z[v0 + i];
  const mixing = new Float64Array(NL * NL);
  for (let a = 0, p = 0; a < NL; a++)
    for (let b = 0; b <= a; b++, p++) mixing[a * NL + b] = a === b ? Math.exp(chol[p]) : chol[p];
  const rrCv = Math.min(0.4, Math.max(0.08, Math.exp(z[m.names.indexOf("log_rr_cv")])));
  const p: AfPatient = { mixing, fir, rrCv, dominantHz };
  if (patients.size > 64) patients.clear();
  patients.set(seed, p);
  return p;
}

/**
 * Adds f waves to eight independent-lead accumulators sampled at `fs`. Sources
 * are generated at the model rate from the case seed (with a warm-up so the
 * first sample is already stationary) and interpolated to `fs`.
 */
export function addFibrillationWaves(acc: Float64Array[], fs: number, seed: number): void {
  const m = model(), p = afPatient(seed), n = acc[0].length, ratio = fs / m.fs;
  const count = Math.ceil(n / ratio) + 3, warm = TAPS;
  const rng = random(((seed ^ 0xf1b7) * 2246822519) >>> 0);
  const src = Array.from({ length: NL }, () => new Float64Array(count));
  const white = Array.from({ length: NL }, () => new Float64Array(warm + count));
  // Interleaved draws keep each sample's noise independent of the buffer length.
  for (let i = 0; i < warm + count; i++) for (let s = 0; s < NL; s++) white[s][i] = normal(rng);
  for (let s = 0; s < NL; s++)
    for (let i = 0; i < count; i++) {
      let v = 0;
      for (let k = 0; k < TAPS; k++) v += p.fir[k] * white[s][warm + i - k];
      src[s][i] = v;
    }
  const lead = new Float64Array(count);
  for (let a = 0; a < NL; a++) {
    for (let i = 0; i < count; i++) {
      let v = 0;
      for (let b = 0; b <= a; b++) v += p.mixing[a * NL + b] * src[b][i];
      lead[i] = v;
    }
    const out = acc[a];
    for (let i = 0; i < n; i++) {
      // Catmull–Rom from the model rate to fs.
      const x = i / ratio, j = Math.floor(x), f = x - j;
      const p0 = lead[Math.max(0, j - 1)], p1 = lead[j], p2 = lead[j + 1], p3 = lead[j + 2];
      out[i] += 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }
  }
}
