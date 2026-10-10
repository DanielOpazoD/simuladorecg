/**
 * Bridge between the event calendar and the learned beat model. A case uses the
 * realistic base when every supported modifier is representable on it; other
 * cases (and non-sinus atria or non-conducted ventricular beats) keep the
 * historical vector kernels until their own migration stage.
 */
import type { AtrialEvent, Beat, ECGCase } from "../types";
import { normal, random } from "../random";
import { qrsAmplitudeScale, T_REFERENCE_AMPLITUDE } from "../morphology";
import { dipoleOf, reconstruct, samplePatient, shapeModel, transform, type Patient } from "./shape-model";
import { addAtrial, addVentricular, beatShapeState, beatTemplate, qrsOnsetLevel, type BeatShapeState } from "./beat";
import { learnedSecondaryRepolarization, noConductedBeats, realisticModelFor } from "./scope";

const P_REFERENCE_AMPLITUDE = 0.15;
/** Horizontal heart rotation per unit of the transition control (degrees). */
export const TRANSITION_DEG = 18;
export { usesRealisticBase } from "./scope";

/** Whether the case's learned T keeps the patient's own axis (not the control). */
export function naturalTAxis(c: ECGCase): boolean {
  const model = realisticModelFor(c);
  return model !== null && (c.naturalTAxis !== false || learnedSecondaryRepolarization(model));
}

const patients = new Map<string, Patient>();
/** The seed defines the person; case controls act as exact transforms on it
 * (time warping, heart rotation, per-wave gain), so moving one control never
 * reshapes an unrelated wave. */
export function realisticPatient(c: ECGCase): Patient {
  const model = realisticModelFor(c);
  if (!model) throw new Error("El caso no usa el modelo aprendido.");
  const pAxis = c.naturalPAxis === false ? c.pAxis : null;
  const tAxis = naturalTAxis(c) ? null : c.tAxis;
  const natural = c.naturalPatient === true && !noConductedBeats(c);
  const key = [model, c.seed, natural, c.axis, pAxis, tAxis, c.pAmp, qrsAmplitudeScale(c), c.tAmp, c.transition].join("|");
  let p = patients.get(key);
  if (!p) {
    p = natural ? samplePatient({
      model, seed: c.seed, axis: null, pAxis: null, tAxis: null, pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: 0, naturalAmplitude: true,
    }) : samplePatient({
      // Without conducted beats (VVI/DDD) the QRS axis control does not apply: the
      // atrial patient keeps its natural axes.
      model, seed: c.seed, axis: noConductedBeats(c) ? null : c.axis, pAxis, tAxis,
      pScale: c.pAmp / P_REFERENCE_AMPLITUDE, qrsScale: qrsAmplitudeScale(c),
      // Secondary repolarization (bundle-branch block, LVH strain) follows the
      // depolarization: the QRS gain scales ST-T (ST/QRS ratios hold) and the T
      // amplitude control, disabled in the interface, does not apply.
      tScale: learnedSecondaryRepolarization(model) ? qrsAmplitudeScale(c) : c.tAmp / T_REFERENCE_AMPLITUDE,
      horizontalDeg: TRANSITION_DEG * c.transition,
    });
    if (patients.size > 64) patients.clear();
    patients.set(key, p);
  }
  return p;
}

/** Ectopic populations (F5.3–F5.4): seeds and plausible width ranges per kind. */
const ECTOPIC = {
  pvc: { model: "PVC", seed: (s: number) => (s * 7919 + 13) >>> 0, state: (s: number) => ((s * 41) ^ 0x9cf) >>> 0, qrs: [0.1, 0.2] },
  paced: { model: "VPACE", seed: (s: number) => (s * 104729 + 29) >>> 0, state: (s: number) => ((s * 43) ^ 0x7ac) >>> 0, qrs: [0.12, 0.24] },
  // A ventricular rhythm is the same focus as the patient's PVC (same seed).
  ventricular: { model: "PVC", seed: (s: number) => (s * 7919 + 13) >>> 0, state: (s: number) => ((s * 47) ^ 0x3e1) >>> 0, qrs: [0.1, 0.2] },
} as const;
export type EctopicKind = keyof typeof ECTOPIC;
const ectopicPatients = new Map<string, Patient>();
/** The case's learned ectopic beat of one kind (ventricular premature beat or
 * ventricular paced beat): its own patient, drawn with the case seed, with its
 * natural axis (no control), its own amplitude and secondary repolarization that
 * follows its QRS gain. */
export function realisticEctopicPatient(c: ECGCase, kind: EctopicKind): Patient {
  const e = ECTOPIC[kind], gain = qrsAmplitudeScale(c), key = [kind, c.seed, gain].join("|");
  let p = ectopicPatients.get(key);
  if (!p) {
    p = samplePatient({
      model: e.model, seed: e.seed(c.seed), axis: null, pAxis: null, tAxis: null,
      pScale: 0, qrsScale: gain, tScale: gain, horizontalDeg: 0, naturalAmplitude: true,
    });
    if (ectopicPatients.size > 64) ectopicPatients.clear();
    ectopicPatients.set(key, p);
  }
  return p;
}
export const realisticPvcPatient = (c: ECGCase) => realisticEctopicPatient(c, "pvc");

/** Learned ectopic beats keep their own QRS width (PVC 106–158 ms, paced
 * ~180 ms in PTB-XL) and ST-T instead of the teaching source's minimum width and
 * the conducted-beat QT model. */
export function learnedEctopicQrsSeconds(c: ECGCase, kind: EctopicKind): number {
  const [lo, hi] = ECTOPIC[kind].qrs;
  return Math.min(hi, Math.max(lo, realisticEctopicPatient(c, kind).qrsMs / 1000));
}
export const learnedPvcQrsSeconds = (c: ECGCase) => learnedEctopicQrsSeconds(c, "pvc");
/** Natural patient (F2.3): conducted beats take the patient's own QRS and its ST-T
 * adapted to each cycle with the cube root of RR (measured at its own RR). */
export function learnNaturalDurations(c: ECGCase, beats: Beat[]): void {
  const p = realisticPatient(c), qrs = p.qrsMs / 1000;
  for (const b of beats) if (b.kind === "normal") {
    const stt = (p.sttMs / 1000) * Math.cbrt(Math.max(0.3, b.adaptedRR ?? 60 / c.hr) / (p.rrMs / 1000));
    b.qrs = qrs; b.qt = qrs + Math.min(0.5, Math.max(0.12, stt)); b.ownDurations = true;
  }
}
export function learnEctopicDurations(c: ECGCase, beats: Beat[], kinds: readonly EctopicKind[]): void {
  for (const kind of kinds) {
    const qrs = learnedEctopicQrsSeconds(c, kind), own = realisticEctopicPatient(c, kind).sttMs / 1000;
    for (const b of beats) if (b.kind === kind) {
      // A ventricular rhythm repolarizes at its own rate: the patient's ST-T (seen
      // after a ~0.8 s cycle) scales with the cube root of the adapted RR.
      const stt = kind === "ventricular" ? own * Math.cbrt(Math.max(0.25, b.adaptedRR ?? 0.8) / 0.8) : own;
      b.qrs = qrs; b.qt = qrs + Math.min(0.5, Math.max(0.12, stt)); b.ownDurations = true;
    }
  }
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
  private ectopic = new Map<EctopicKind, { patient: Patient; state: BeatShapeState }>();
  /** A learned ectopic beat (PVC or ventricular paced), warped to the event's QRS
   * and QT (the patient's own durations, set on the events by `learnEctopicDurations`). */
  addEctopic(b: Beat & { kind: EctopicKind }) {
    if (!b.qrs || !b.qt) throw new Error("Latido ectópico sin duraciones propias.");
    let e = this.ectopic.get(b.kind);
    if (!e) {
      const patient = realisticEctopicPatient(this.c, b.kind);
      e = { patient, state: beatShapeState(patient, random(ECTOPIC[b.kind].state(this.c.seed))) };
      this.ectopic.set(b.kind, e);
    }
    const qrsMs = b.qrs! * 1000, sttMs = Math.max(80, b.qt! * 1000 - qrsMs);
    addVentricular(this.acc, this.fs, b.time, qrsMs, sttMs, beatTemplate(e.patient, e.state, b.time, this.c.respiratoryRate), e.patient, 0);
  }
  private spikeVector: Float64Array | null = null;
  /** A pacing spike as recorded (F5.4): the learned filtered waveform (±10 ms)
   * along this patient's spike vector (ventricular spikes only). */
  addSpike(t: number) {
    const m = shapeModel("VPACE"), sp = m.spike!;
    if (!this.spikeVector) {
      const rng = random(((this.c.seed * 53) ^ 0x5b1c) >>> 0), size = Math.exp(sp.logNormMean + sp.logNormSd * normal(rng));
      this.spikeVector = Float64Array.from(sp.unit, (u) => u * size);
    }
    const shape = sp.shape500Hz, half = 0.01, n = shape.length - 1;
    const lo = Math.max(0, Math.ceil((t - half) * this.fs)), hi = Math.min(this.acc[0].length - 1, Math.floor((t + half) * this.fs));
    for (let i = lo; i <= hi; i++) {
      const x = ((i / this.fs - (t - half)) / (2 * half)) * n, j = Math.min(n - 1, Math.floor(x)), f = x - j;
      const w = shape[j] + (shape[j + 1] - shape[j]) * f;
      for (let l = 0; l < 8; l++) this.acc[l][i] += this.spikeVector[l] * w;
    }
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
export function realisticQrsVector(c: ECGCase, u: number, kind: "normal" | EctopicKind = "normal"): [number, number, number] {
  if (!(u > 0 && u < 1)) return [0, 0, 0];
  const p = kind === "normal" ? realisticPatient(c) : realisticEctopicPatient(c, kind), m = p.model, key = "qrsTemplate";
  const cache = p as Patient & { [key]?: Float64Array };
  // The lab shows activation alone: no hand-over to the repolarization operator.
  const x = cache[key] ?? (cache[key] = transform(m, reconstruct(m, p.z), p.ops, false));
  const q = m.phases.qrs, s = u * (q.points - 1);
  const i = Math.min(q.points - 2, Math.floor(s)), f = s - i;
  const a = dipoleOf(x, (q.offset + i) * 8), b = dipoleOf(x, (q.offset + i + 1) * 8);
  const first = dipoleOf(x, q.offset * 8), last = dipoleOf(x, (q.offset + q.points - 1) * 8);
  return [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * f - (first[j] + (last[j] - first[j]) * u)) as [number, number, number];
}
