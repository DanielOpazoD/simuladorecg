/**
 * Places realistic atrial and ventricular components of one beat into
 * eight independent-lead accumulators, warping each phase to the event's
 * actual durations. Beat-to-beat life comes from two sources measured in real
 * recordings: respiratory rotation/gain of the heart vector and a small
 * autocorrelated morphological jitter.
 */
import { leadOperator, reconstruct, rotation, transform, type Patient, type PhaseName } from "./shape-model";
import { normal } from "../random";

const NL = 8;
/** Respiratory modulation of the heart vector (degrees and fractional gain). */
const RESP_FRONTAL_DEG = 1.5, RESP_HORIZONTAL_DEG = 6, RESP_GAIN = 0.025;
/** Per-beat morphology jitter in standardized mode units, AR(1). */
const JITTER_SD = 0.05, JITTER_RHO = 0.6;

export interface BeatShapeState { jitter: Float64Array; rng: () => number }
export function beatShapeState(p: Patient, rng: () => number): BeatShapeState {
  return { jitter: new Float64Array(p.model.k), rng };
}

/** Template for one beat at time `t` (s) given the respiratory rate (breaths/min). */
export function beatTemplate(p: Patient, state: BeatShapeState, t: number, respiratoryRate: number): Float64Array {
  const m = p.model, z = new Float64Array(m.k), innov = Math.sqrt(1 - JITTER_RHO ** 2);
  for (let i = 0; i < m.k; i++) {
    state.jitter[i] = JITTER_RHO * state.jitter[i] + innov * JITTER_SD * normal(state.rng);
    z[i] = p.z[i] + state.jitter[i];
  }
  const phi = (2 * Math.PI * respiratoryRate * t) / 60;
  const resp = rotation(RESP_FRONTAL_DEG * Math.sin(phi), RESP_HORIZONTAL_DEG * Math.sin(phi + 0.6));
  const gain = 1 + RESP_GAIN * Math.sin(phi + 1.2);
  // Respiration acts on the already axis-corrected heart vector: R_resp · R_phase.
  const ops = {} as Record<PhaseName, Float64Array>;
  for (const ph of Object.keys(p.scales) as PhaseName[]) {
    const r = p.rotations[ph], rr = new Array(9).fill(0) as typeof r;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let q = 0; q < 3; q++) rr[i * 3 + j] += resp[i * 3 + q] * r[q * 3 + j];
    ops[ph] = leadOperator(rr, p.scales[ph] * (ph === "p" || ph === "pq" ? 1 : gain));
  }
  return transform(m, reconstruct(m, z), ops);
}

/** Catmull–Rom value of one lead along a phase, u ∈ [0, 1]. */
function phaseValue(x: Float64Array, offset: number, points: number, lead: number, u: number): number {
  const s = Math.min(points - 1, Math.max(0, u * (points - 1))), i = Math.min(points - 2, Math.floor(s)), f = s - i;
  const at = (k: number) => x[(offset + Math.min(points - 1, Math.max(0, k))) * NL + lead];
  const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

interface Segment { phase: PhaseName; ms: number }
/** Atrial repolarization (Ta) decay after the PQ segment, ms. */
export const TA_DECAY_MS = 80;

/**
 * Adds consecutive warped phases starting at `start` (s). Templates are referred
 * to the TP line before P, so the PQ segment ends below it (Ta). That offset is
 * carried by the atrial component as an exponential tail and removed from the
 * ventricular one, so a conducted beat reproduces the learned waveform exactly
 * while dissociated P waves and atrium-less beats stay physiological.
 */
function place(acc: Float64Array[], fs: number, start: number, x: Float64Array, p: Patient, segs: Segment[], mode: "atrial" | "ventricular") {
  const m = p.model, phasesMs = segs.reduce((s, g) => s + g.ms, 0);
  const tailMs = mode === "atrial" ? 5 * TA_DECAY_MS : 0, totalMs = phasesMs + tailMs;
  const first = m.phases[segs[0].phase], last = m.phases[segs[segs.length - 1].phase];
  const lo = Math.max(0, Math.ceil(start * fs)), hi = Math.min(acc[0].length - 1, Math.floor(start * fs + (totalMs * fs) / 1000));
  const lastStartMs = phasesMs - segs[segs.length - 1].ms;
  for (let lead = 0; lead < NL; lead++) {
    const v0 = x[first.offset * NL + lead], vEnd = x[(last.offset + last.points - 1) * NL + lead];
    const out = acc[lead];
    for (let i = lo; i <= hi; i++) {
      const elapsed = (i / fs - start) * 1000;
      let v: number;
      if (elapsed > phasesMs) {
        v = vEnd * Math.exp(-(elapsed - phasesMs) / TA_DECAY_MS); // Ta tail
      } else {
        let tms = elapsed, k = 0;
        while (k < segs.length - 1 && tms > segs[k].ms) tms -= segs[k++].ms;
        const ph = m.phases[segs[k].phase], u = Math.min(1, Math.max(0, tms / segs[k].ms));
        v = phaseValue(x, ph.offset, ph.points, lead, u);
        if (mode === "atrial") {
          // Start exactly on the TP line: fade the tiny residual over the P wave.
          if (k === 0) v -= v0 * (1 - u);
        } else {
          // Remove the inherited Ta offset; end exactly on the TP line.
          v -= v0 * Math.exp(-elapsed / TA_DECAY_MS);
          if (k === segs.length - 1) {
            const w = (elapsed - lastStartMs) / segs[k].ms;
            v -= vEnd * w;
            if (w > 0.6) v *= 0.5 * (1 + Math.cos((Math.PI * (w - 0.6)) / 0.4));
          }
        }
      }
      out[i] += v;
    }
  }
}

export function addAtrial(acc: Float64Array[], fs: number, start: number, pMs: number, pqMs: number, x: Float64Array, p: Patient) {
  place(acc, fs, start, x, p, [{ phase: "p", ms: pMs }, { phase: "pq", ms: pqMs }], "atrial");
}
export function addVentricular(acc: Float64Array[], fs: number, start: number, qrsMs: number, sttMs: number, x: Float64Array, p: Patient) {
  const st = sttMs * p.tApexFraction;
  place(acc, fs, start, x, p, [{ phase: "qrs", ms: qrsMs }, { phase: "st", ms: st }, { phase: "t", ms: sttMs - st }, { phase: "post", ms: p.model.postMs }], "ventricular");
}
