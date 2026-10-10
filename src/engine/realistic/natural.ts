/**
 * Natural patient (F2.3). On the learned normal base, the seed defines the person
 * with its own QRS axis, wave sizes, PR, QRS and QT. Until a preset or the user sets
 * one of those controls, the case carries the patient's own value in it, so the
 * trace, the measurements, the cards and every other view see the same number.
 *
 * Before F2.3 every learned patient was forced to the default axis (60°), QRS
 * (90 ms), PR and QTc: the population looked alike and the feature bench showed it
 * (QRS slope in I 48 vs 65 mV/s in real records).
 */
import { isNatural, NATURAL_CONTROLS, type ECGCase, type NaturalControl } from "../types";
import { T_REFERENCE_AMPLITUDE } from "../morphology";
import { samplePatient } from "./shape-model";
import { noConductedBeats, realisticModelFor } from "./scope";
import { P_REFERENCE_AMPLITUDE, TRANSITION_DEG } from "./engine";

const cache = new Map<string, Partial<Record<NaturalControl, number>>>();
/** The control values that reproduce the case's learned normal patient. */
export function naturalControlValues(c: ECGCase): Partial<Record<NaturalControl, number>> {
  if (realisticModelFor(c) !== "NORM" || noConductedBeats(c)) return {};
  const key = `${c.seed}|${c.transition}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // The same person the axis control rotates (stable candidate), unrotated and at
  // the population-median gains: its scales give its own sizes relative to them.
  const p = samplePatient({ model: "NORM", seed: c.seed, axis: null, pAxis: null, tAxis: null, pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: TRANSITION_DEG * c.transition, stableCandidate: true });
  const r = (v: number, lo: number, hi: number, step: number) => Math.round(Math.min(hi, Math.max(lo, v)) / step) * step;
  const out = {
    axis: r(p.achievedAxes.qrs, -180, 180, 1),
    pr: r(p.pMs + p.pqMs, 80, 400, 1),
    qrs: r(p.qrsMs, 60, 240, 1),
    qtc: r((p.qrsMs + p.sttMs) / Math.cbrt(p.rrMs / 1000), 260, 650, 1),
    pAmp: r(P_REFERENCE_AMPLITUDE / p.scales.p, 0, 0.5, 0.005),
    qrsAmp: r(1 / p.scales.qrs, 0.1, 3, 0.01),
    tAmp: r(T_REFERENCE_AMPLITUDE / p.scales.t, 0, 1, 0.005),
  };
  if (cache.size > 256) cache.clear();
  cache.set(key, out);
  return out;
}
/** The case with every control that still follows the patient set to its value. */
export function withNaturalControls(c: ECGCase): ECGCase {
  const v = naturalControlValues(c);
  const keys = (Object.keys(NATURAL_CONTROLS) as NaturalControl[]).filter((k) => v[k] !== undefined && isNatural(c, k) && c[k] !== v[k]);
  if (!keys.length) return c;
  const out = { ...c };
  for (const k of keys) out[k] = v[k]!;
  return out;
}
