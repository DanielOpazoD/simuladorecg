/** Analytic fixtures authored independently from the synthesizer.
 * Piecewise linear landmarks are exact, and do not use model events or kernels.
 */
import type { Lead } from "../src/engine/types";
export type Knot = readonly [number, number];
export const P: Knot[] = [
  [0.2, 0],
  [0.245, 0.15],
  [0.29, 0],
];
export const QRS: Knot[] = [
  [0.36, 0],
  [0.372, -0.12],
  [0.397, 1],
  [0.414, -0.28],
  [0.45, 0],
];
export const T: Knot[] = [
  [0.52, 0],
  [0.615, 0.3],
  [0.76, 0],
];
export const BIPHASIC_T: Knot[] = [
  [0.52, 0],
  [0.615, 0.3],
  [0.68, 0],
  [0.75, -0.2],
  [0.84, 0],
];
export const U: Knot[] = [
  [0.84, 0],
  [0.9, 0.15],
  [0.96, 0],
];
export const NOTCHED_QRS: Knot[] = [
  [0.36, 0],
  [0.39, 0.8],
  [0.408, 0.55],
  [0.445, 0.55],
  [0.48, 1],
  [0.52, 0],
];
const scales: Record<Lead, number> = {
  I: 0.7,
  II: 1,
  III: 0.3,
  aVR: -0.85,
  aVL: 0.2,
  aVF: 0.65,
  V1: -0.8,
  V2: -0.4,
  V3: 0.5,
  V4: 1,
  V5: 1.2,
  V6: 0.9,
};
export function wave(t: number, knots: readonly Knot[]): number {
  if (!knots.length || t < knots[0][0] || t > knots.at(-1)![0]) return 0;
  for (let i = 1; i < knots.length; i++) {
    const [a, b] = [knots[i - 1], knots[i]];
    if (t <= b[0]) return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  }
  return 0;
}
export function fixture(
  options: {
    fs?: number;
    p?: readonly Knot[];
    qrs?: readonly Knot[];
    t?: readonly Knot[];
    u?: readonly Knot[];
    pPeriod?: number;
    noiseOnly?: boolean;
    offset?: boolean;
  } = {},
) {
  const fs = options.fs ?? 500;
  const leads = Object.fromEntries(
    Object.entries(scales).map(([lead, scale], k) => [
      lead,
      Float64Array.from({ length: 10 * fs }, (_, i) => {
        const t = i / fs;
        if (options.noiseOnly)
          return (
            0.07 * Math.sin(2 * Math.PI * (21.7 + k * 0.61) * t) +
            0.03 * Math.sin(2 * Math.PI * (37.1 - k * 0.83) * t)
          );
        return (
          (options.offset
            ? ({ I: 0.7, II: -0.5, V1: 1.2, V5: -0.3 }[lead as "I"] ?? 0.2)
            : 0) +
          scale *
            (wave(t % (options.pPeriod ?? 1), options.p ?? P) +
              wave(t % 1, options.qrs ?? QRS) +
              wave(t % 1, options.t ?? T) +
              wave(t % 1, options.u ?? []))
        );
      }),
    ]),
  ) as Record<Lead, Float64Array>;
  return { fs, leads };
}
