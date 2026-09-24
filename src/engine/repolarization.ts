import type { Beat, ECGCase } from "./types";
import { qrsDuration } from "./morphology";

/** Engineering approximation of RR history: 95% adaptation over 120 s (Malik 2018).
 * Not individual cellular restitution; changing case parameters starts a new record.
 */
export const QT_ADAPTATION_SECONDS = -120 / Math.log(0.05);
export function adaptRR(previous: number, rr: number, elapsed: number): number {
  return (
    previous +
    (1 - Math.exp(-Math.max(0, elapsed) / QT_ADAPTATION_SECONDS)) *
      (rr - previous)
  );
}
export function nominalVentricularRR(c: ECGCase): number {
  if (c.rhythm === "flutter") return (60 / c.atrialRate) * c.flutterRatio;
  const ratio =
    c.rhythm === "sinus"
      ? ({ mobitz1: 4 / 3, mobitz2: 4 / 3, two_one: 2, high: 3 }[
          c.av as "mobitz1"
        ] ?? 1)
      : 1;
  return (60 / c.hr) * ratio;
}
export function assignRepolarization(c: ECGCase, beats: Beat[]): void {
  let history = nominalVentricularRR(c);
  for (const beat of beats) {
    history = adaptRR(history, Math.max(0.22, beat.rr), beat.rr);
    beat.adaptedRR = history;
    beat.qrs = qrsDuration(c, beat);
    beat.qt = Math.max(
      qrsDuration(c, beat) + 0.12,
      Math.min(0.9, (c.qtc / 1000) * Math.cbrt(history)),
    );
  }
}
