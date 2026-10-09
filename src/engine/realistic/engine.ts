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
import { addAtrial, addVentricular, beatShapeState, beatTemplate, qrsOnsetLevel, type BeatShapeState } from "./beat";

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
  private templates = new Map<number, Float64Array>();
  /** Inherited Ta level kept in a conducted beat: P gain relative to QRS gain, so
   * atrial repolarization follows the P wave (none without P). */
  private get taKeep() { return this.patient.scales.p / Math.max(1e-9, this.patient.scales.qrs); }
  private conducted = new Set<number>();
  private key = (t: number) => Math.round(t * 1e6);
  /** Ventricular templates are drawn first (in beat order) so a conducted P can
   * end exactly at its QRS-onset level. */
  prepare(beats: readonly Beat[]) {
    for (const b of beats)
      if (b.kind === "normal") this.templates.set(this.key(b.time), beatTemplate(this.patient, this.ventricular, b.time, this.c.respiratoryRate));
  }
  /** Sinus P wave and PQ segment; conducted P waves end exactly at QRS onset. */
  addAtrial(a: AtrialEvent) {
    const p = this.patient;
    let pMs = p.pMs, pqMs = p.pqMs, target: Float64Array | undefined;
    if (a.conducted && a.pr) {
      const pr = a.pr * 1000, beat = this.key(a.time + a.pr), x = this.templates.get(beat);
      pMs = Math.min(pMs, pr - 12);
      pqMs = pr - pMs;
      if (x) {
        target = qrsOnsetLevel(x, p).map((v) => v * this.taKeep);
        this.conducted.add(beat);
      }
    }
    const x = beatTemplate(p, this.atrial, a.time, this.c.respiratoryRate);
    addAtrial(this.acc, this.fs, a.time, pMs, pqMs, x, p, target);
  }
  /** Net-area frontal QRS axis (degrees) of the noise-free learned component over
   * the given conducted beats, from the QRS-onset level: the axis the trace shows. */
  measuredQrsAxis(beats: readonly Beat[]): number | null {
    let i1 = 0, avf = 0;
    for (const b of beats) {
      if (b.kind !== "normal" || b.qrs === undefined) continue;
      // Areas from the end-of-PR level, as electrocardiographs measure the axis.
      const k0 = Math.ceil(b.time * this.fs), pr = (lead: number) => {
        let sum = 0;
        for (let k = k0 - Math.round(0.008 * this.fs); k < k0 - Math.round(0.002 * this.fs); k++) sum += this.acc[lead][k];
        return sum / (Math.round(0.008 * this.fs) - Math.round(0.002 * this.fs));
      };
      const base0 = pr(0), base1 = pr(1);
      for (let k = k0; k < Math.floor((b.time + b.qrs) * this.fs); k++) {
        i1 += this.acc[0][k] - base0;
        avf += this.acc[1][k] - base1 - (this.acc[0][k] - base0) / 2;
      }
    }
    return i1 === 0 && avf === 0 ? null : (Math.atan2(avf, i1) * 180) / Math.PI;
  }
  /** QRS, ST-T and post-T of a normally conducted beat, warped to its QRS and QT. */
  addBeat(b: Beat, qrsSeconds: number) {
    const qrsMs = qrsSeconds * 1000, sttMs = Math.max(80, b.qt! * 1000 - qrsMs);
    const key = this.key(b.time);
    const x = this.templates.get(key) ?? beatTemplate(this.patient, this.ventricular, b.time, this.c.respiratoryRate);
    addVentricular(this.acc, this.fs, b.time, qrsMs, sttMs, x, this.patient, this.conducted.has(key) ? this.taKeep : 0);
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
