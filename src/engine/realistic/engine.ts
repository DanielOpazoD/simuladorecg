/**
 * Bridge between the event calendar and the learned beat model. A case uses the
 * realistic base when every supported modifier is representable on it; other
 * cases (and non-sinus atria or non-conducted ventricular beats) keep the
 * historical vector kernels until their own migration stage.
 */
import type { AtrialEvent, Beat, ECGCase } from "../types";
import { random } from "../random";
import { qrsAmplitudeScale, T_REFERENCE_AMPLITUDE } from "../morphology";
import { dipoleOf, reconstruct, samplePatient, transform, type Patient } from "./shape-model";
import { addAtrial, addVentricular, beatShapeState, beatTemplate, type BeatShapeState } from "./beat";

const P_REFERENCE_AMPLITUDE = 0.15;
/** Horizontal heart rotation per unit of the transition control (degrees). */
export const TRANSITION_DEG = 18;
export { usesRealisticBase } from "./scope";

const patients = new Map<string, Patient>();
/** The seed defines the person; case controls act as exact transforms on it
 * (time warping, heart rotation, per-wave gain), so moving one control never
 * reshapes an unrelated wave. */
export function realisticPatient(c: ECGCase): Patient {
  const key = [c.seed, c.axis, c.pAxis, c.tAxis, c.pAmp, qrsAmplitudeScale(c), c.tAmp, c.transition].join("|");
  let p = patients.get(key);
  if (!p) {
    p = samplePatient({
      seed: c.seed, axis: c.axis, pAxis: c.pAxis, tAxis: c.tAxis,
      pScale: c.pAmp / P_REFERENCE_AMPLITUDE, qrsScale: qrsAmplitudeScale(c), tScale: c.tAmp / T_REFERENCE_AMPLITUDE,
      horizontalDeg: TRANSITION_DEG * c.transition,
    });
    if (patients.size > 64) patients.clear();
    patients.set(key, p);
  }
  return p;
}

/** Accumulates realistic components for the eight independent leads at `fs`. */
export class RealisticTrack {
  readonly acc: Float64Array[];
  readonly patient: Patient;
  private atrial: BeatShapeState;
  private ventricular: BeatShapeState;
  constructor(private c: ECGCase, n: number, private fs: number) {
    this.acc = Array.from({ length: 8 }, () => new Float64Array(n));
    this.patient = realisticPatient(c);
    this.atrial = beatShapeState(this.patient, random(((c.seed * 31) ^ 0xa7a1) >>> 0));
    this.ventricular = beatShapeState(this.patient, random(((c.seed * 37) ^ 0x7e57) >>> 0));
  }
  /** Sinus P wave and PQ segment; conducted P waves end exactly at QRS onset. */
  addAtrial(a: AtrialEvent) {
    const p = this.patient;
    let pMs = p.pMs, pqMs = p.pqMs;
    if (a.conducted && a.pr) {
      const pr = a.pr * 1000;
      pMs = Math.min(pMs, pr - 12);
      pqMs = pr - pMs;
    }
    const x = beatTemplate(p, this.atrial, a.time, this.c.respiratoryRate);
    addAtrial(this.acc, this.fs, a.time, pMs, pqMs, x, p);
  }
  /** QRS, ST-T and post-T of a normally conducted beat, warped to its QRS and QT. */
  addBeat(b: Beat, qrsSeconds: number) {
    const qrsMs = qrsSeconds * 1000, sttMs = Math.max(80, b.qt! * 1000 - qrsMs);
    const x = beatTemplate(this.patient, this.ventricular, b.time, this.c.respiratoryRate);
    addVentricular(this.acc, this.fs, b.time, qrsMs, sttMs, x, this.patient);
  }
}

/** Heart vector of the case's learned QRS at fraction u ∈ [0, 1] of the QRS
 * (no respiration or beat jitter): the activation lab's view of this base. The
 * loop is detrended between its endpoints, so it starts and ends at the origin
 * like the kernel loops (the Ta offset and the J-point level are not activation). */
export function realisticQrsVector(c: ECGCase, u: number): [number, number, number] {
  if (!(u > 0 && u < 1)) return [0, 0, 0];
  const p = realisticPatient(c), m = p.model, key = "qrsTemplate";
  const cache = p as Patient & { [key]?: Float64Array };
  // The lab shows activation alone: no hand-over to the repolarization operator.
  const x = cache[key] ?? (cache[key] = transform(m, reconstruct(m, p.z), p.ops, false));
  const q = m.phases.qrs, s = u * (q.points - 1);
  const i = Math.min(q.points - 2, Math.floor(s)), f = s - i;
  const a = dipoleOf(x, (q.offset + i) * 8), b = dipoleOf(x, (q.offset + i + 1) * 8);
  const first = dipoleOf(x, q.offset * 8), last = dipoleOf(x, (q.offset + q.points - 1) * 8);
  return [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * f - (first[j] + (last[j] - first[j]) * u)) as [number, number, number];
}
