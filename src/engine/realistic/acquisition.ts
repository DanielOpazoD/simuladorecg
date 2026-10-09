/**
 * Resting acquisition floor, generated per electrode and combined into leads the
 * way a recorder does, so cross-lead correlations look real. Levels and structure
 * were measured in TP segments of 300 PTB-XL NORM recordings (docs/fidelidad.md):
 *  - High-frequency (>25 Hz) noise: arm electrodes carry most of it (I 5.7 µV,
 *    II 3.3, III 4.3; corr I–II +0.59, I–III −0.73); precordial ≈2 µV and
 *    mutually independent (corr V1–V2 0.04).
 *  - Baseline wander: dominated by the leg electrode (corr II–III +0.81), std
 *    27–44 µV; neighbouring chest leads correlate ≈0.5.
 * Each patient (seed) gets its own lognormal noise level, as real records do.
 */
import type { ECGCase } from "../types";
import { normal, random } from "../random";

const UV = 0.001;
// Electrode-level RMS in µV at the median patient.
const EMG = { RA: 5.5, LA: 7.0, LL: 0.8, chest: 3.3, common: 0.7 };
const WANDER = { RA: 30, LA: 30, LL: 52, chestCommon: 33, chestLocal: 39 };
const RESP_SHARE = 0.7;

function onePoleLowpass(x: Float64Array, fs: number, hz: number) {
  const a = Math.exp((-2 * Math.PI * hz) / fs);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y = a * y + (1 - a) * x[i];
}
function onePoleHighpass(x: Float64Array, fs: number, hz: number) {
  const a = Math.exp((-2 * Math.PI * hz) / fs);
  let y = 0, prev = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    y = a * (y + v - prev);
    prev = v;
    x[i] = y;
  }
}
function normalize(x: Float64Array, rms: number) {
  let s = 0;
  for (const v of x) s += v * v;
  const k = rms / Math.sqrt(s / x.length || 1);
  for (let i = 0; i < x.length; i++) x[i] *= k;
}
/** Spectral and temporal shape of muscle noise, measured in TP segments of
 * PTB-XL NORM records: power falls with frequency above ≈20 Hz, and the noise is
 * impulsive (kurtosis ≈8–11) and waxes and wanes between beats (sd of log RMS
 * across TP segments ≈0.3). */
export const EMG_SHAPE = { highpassHz: 15, lowpassHz: 10, whiteShare: 0.05, slowLogSd: 0.2, slowHz: 0.5, fastLogSd: 0.8, fastHz: 30 };

/** Log-normal amplitude envelope: slow (bursts between beats) and fast (motor-unit
 * impulses) components, normalized to unit mean square. */
function envelope(n: number, fs: number, r: () => number) {
  const slow = Float64Array.from({ length: n }, () => normal(r)), fast = Float64Array.from({ length: n }, () => normal(r));
  for (const [x, hz, sd] of [[slow, EMG_SHAPE.slowHz, EMG_SHAPE.slowLogSd], [fast, EMG_SHAPE.fastHz, EMG_SHAPE.fastLogSd]] as const) {
    onePoleLowpass(x, fs, hz);
    onePoleLowpass(x, fs, hz);
    normalize(x, sd);
  }
  const g = new Float64Array(n);
  let ms = 0;
  for (let i = 0; i < n; i++) ms += (g[i] = Math.exp(slow[i] + fast[i])) ** 2;
  const k = 1 / Math.sqrt(ms / n || 1);
  for (let i = 0; i < n; i++) g[i] *= k;
  return g;
}

/** Muscle noise: pink-leaning band from ≈15 Hz with a white floor, modulated by a
 * log-normal envelope so it is impulsive and bursty like real recordings. */
function emg(n: number, fs: number, rms: number, r: () => number) {
  const x = Float64Array.from({ length: n }, () => normal(r)), white = Float64Array.from({ length: n }, () => normal(r));
  onePoleHighpass(x, fs, EMG_SHAPE.highpassHz);
  onePoleLowpass(x, fs, EMG_SHAPE.lowpassHz);
  normalize(x, Math.sqrt(1 - EMG_SHAPE.whiteShare));
  onePoleHighpass(white, fs, EMG_SHAPE.highpassHz);
  normalize(white, Math.sqrt(EMG_SHAPE.whiteShare));
  const g = envelope(n, fs, r);
  for (let i = 0; i < n; i++) x[i] = (x[i] + white[i]) * g[i];
  normalize(x, rms);
  return x;
}

/** Electrode–skin motion in 0.5–3 Hz, µV RMS per electrode at the median patient:
 * it makes the ST level wobble between beats (≈16 µV sd in real V2). */
const MOTION_UV = 6.5;

/** Respiratory sway, slow drift and electrode motion. */
function wander(n: number, fs: number, rms: number, respHz: number, phase: number, r: () => number, motionRms = 0) {
  const x = new Float64Array(n), drift = new Float64Array(n), a2 = 0.3 * normal(r), p2 = 2 * Math.PI * r();
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    x[i] = Math.sin(2 * Math.PI * respHz * t + phase) + a2 * Math.sin(4 * Math.PI * respHz * t + p2);
    drift[i] = normal(r);
  }
  normalize(x, rms * Math.sqrt(RESP_SHARE));
  onePoleLowpass(drift, fs, 0.15);
  onePoleLowpass(drift, fs, 0.15);
  normalize(drift, rms * Math.sqrt(1 - RESP_SHARE));
  for (let i = 0; i < n; i++) x[i] += drift[i];
  if (motionRms > 0) {
    const motion = Float64Array.from({ length: n }, () => normal(r));
    onePoleHighpass(motion, fs, 0.5);
    onePoleLowpass(motion, fs, 3);
    onePoleLowpass(motion, fs, 3);
    normalize(motion, motionRms);
    for (let i = 0; i < n; i++) x[i] += motion[i];
  }
  return x;
}

/** Noise for the eight independent leads (I, II, V1–V6) in mV, or null when the
 * case asks for an ideal (noise-free) acquisition. */
export function acquisitionFloor(c: ECGCase, n: number, fs: number): Float64Array[] | null {
  if (c.acquisition === "ideal") return null;
  const r = random(((c.seed * 2654435761) ^ 0xac9) >>> 0);
  const emgScale = Math.exp(0.6 * normal(r)), wanderScale = Math.exp(0.55 * normal(r));
  const respHz = c.respiratoryRate / 60, respPhase = 2 * Math.PI * r();
  const limbWander = (name: "RA" | "LA" | "LL") => wander(n, fs, WANDER[name] * wanderScale * UV, respHz, respPhase + 0.4 * normal(r), r, MOTION_UV * wanderScale * UV);
  const RA = limbWander("RA"), LA = limbWander("LA"), LL = limbWander("LL");
  // Muscle noise of the arm electrodes reaches I and II but, as measured, not the
  // precordial leads (their HF noise is mutually uncorrelated): keep it out of WCT.
  const emgRA = emg(n, fs, EMG.RA * emgScale * UV, r), emgLA = emg(n, fs, EMG.LA * emgScale * UV, r), emgLL = emg(n, fs, EMG.LL * emgScale * UV, r);
  const common = wander(n, fs, WANDER.chestCommon * wanderScale * UV, respHz, respPhase, r);
  const locals = Array.from({ length: 6 }, () => wander(n, fs, WANDER.chestLocal * wanderScale * UV, respHz, respPhase + 0.8 * normal(r), r, MOTION_UV * wanderScale * UV / 0.7));
  const out = Array.from({ length: 8 }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    out[0][i] = LA[i] + emgLA[i] - RA[i] - emgRA[i];
    out[1][i] = LL[i] + emgLL[i] - RA[i] - emgRA[i];
  }
  // Chest wander: shared chest motion plus locally smoothed components, referred
  // to Wilson's terminal (whose wander is dominated by the leg electrode).
  // A small HF component shared by every lead (recorder reference/amplifier),
  // measured as a mean |r| ≈ 0.09 between independent leads.
  const shared = emg(n, fs, EMG.common * emgScale * UV, r);
  for (let i = 0; i < n; i++) {
    out[0][i] += shared[i];
    out[1][i] += shared[i];
  }
  for (let v = 0; v < 6; v++) {
    const hf = emg(n, fs, EMG.chest * emgScale * UV, r), o = out[2 + v];
    const left = locals[Math.max(0, v - 1)], mid = locals[v], right = locals[Math.min(5, v + 1)];
    for (let i = 0; i < n; i++) {
      const wct = (RA[i] + LA[i] + LL[i]) / 3;
      o[i] = common[i] + 0.25 * left[i] + 0.6 * mid[i] + 0.25 * right[i] - wct + hf[i] + shared[i];
    }
  }
  return out;
}
