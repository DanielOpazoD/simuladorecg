import type { ECGCase, Signal } from "../engine/types";

export interface ModelIntervals {
  pr: number | null;
  /** Present only when the generated conducted PR values differ by at least 10 ms. */
  prRange: readonly [number, number] | null;
  progressivePr: boolean;
  qrs: number | null;
  qt: number | null;
  qtc: number | null;
}

/** The existing model-card contract, shared by the strip and its narrative.
 * These are generated event durations, never estimates from the frozen analyzer.
 * Ectopic/paced complexes keep their own QT but do not supply a conducted QTc.
 */
export function modelIntervals(c: Pick<ECGCase, "rhythm" | "av">, s: Pick<Signal, "events" | "truth">): ModelIntervals {
  const none = c.rhythm === "vf" || c.rhythm === "asystole", beats = s.events.beats;
  const rr = beats.length > 1 ? (beats[beats.length - 1].time - beats[0].time) / (beats.length - 1) : null;
  const conducted = beats.filter(b => b.pr !== undefined).map(b => Math.round(b.pr! * 1000));
  const limits = conducted.length ? [Math.min(...conducted), Math.max(...conducted)] as const : null;
  const prRange = !none && limits !== null && limits[1] - limits[0] >= 10 ? limits : null;
  // Preserve the upper median and arithmetic order of the model cards. In
  // bigeminy, mixing the ventricular premature beats changes the interval.
  const normal = beats.filter(b => b.kind === "normal" && b.qrs !== undefined && b.qt !== undefined);
  const middle = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const qrs = none ? null : normal.length ? middle(normal.map(b => b.qrs! * 1000)) : s.truth.qrs;
  const qt = normal.length ? middle(normal.map(b => b.qt! * 1000)) : null;
  return {
    pr: none ? null : s.truth.pr,
    prRange,
    progressivePr: prRange !== null && c.rhythm === "sinus" && c.av === "mobitz1",
    qrs,
    qt: none ? null : qt,
    qtc: !none && c.rhythm !== "torsades" && qt !== null && rr !== null && rr > 0 ? qt / Math.cbrt(rr) : null,
  };
}
