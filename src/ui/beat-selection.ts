import type { Measurement } from "../engine/types";

/** Beat the 12-lead paper highlights: the most typical complex of the trace (QRS and
 * QT nearest the medians, near the middle), or the one under the pointer. */
export function representativeBeat(m: Measurement, before = Infinity): number {
  if (!m.beats.length) return 0;
  let best = 0,
    score = Infinity;
  m.beats.forEach((b, i) => {
    if (b.onset >= before) return;
    const distance =
      Math.abs(b.qrs - (m.qrs ?? b.qrs)) +
      Math.abs((b.qt ?? m.qt ?? 0) - (m.qt ?? b.qt ?? 0)) * 0.5 +
      Math.abs(i - m.beats.length / 2) * 0.1;
    if (distance < score) {
      best = i;
      score = distance;
    }
  });
  return best;
}
export function nearestBeat(m: Measurement, time: number): number {
  let index = 0;
  for (let i = 1; i < m.beats.length; i++)
    if (
      Math.abs(m.beats[i].onset - time) < Math.abs(m.beats[index].onset - time)
    )
      index = i;
  return index;
}
