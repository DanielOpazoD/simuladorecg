/** Evaluation only: samples + caller-supplied windows. No generator or detector import.
 * Units: seconds, mV; integrated areas mV.s. Window endpoints are interpolated.
 * This is not an independent ECG delineator: callers must disclose window provenance.
 */
export type Interval = readonly [number, number];
export interface Windows { baseline: Interval; qrs: Interval; t: Interval }
export interface WaveMetrics {
  baselineMv: number; jMv: number; j60Mv: number; stSlopeMvPerS: number;
  qrsPeakToPeakMv: number; tPeakMv: number; tPeakTime: number;
  tSignedAreaMvS: number; tAbsoluteAreaMvS: number;
  tFwhmMs: number | null; tSymmetry: number | null; tToQrs: number | null;
}
export function sampleAt(a: ArrayLike<number>, fs: number, t: number): number {
  if (!(fs > 0) || !Number.isFinite(fs) || !Number.isFinite(t) || t < 0 || t * fs > a.length - 1 + 1e-8)
    throw new RangeError('Window outside finite sampled signal');
  const p = Math.min(a.length - 1, t * fs), i = Math.floor(p), j = Math.min(i + 1, a.length - 1);
  if (!Number.isFinite(a[i]) || !Number.isFinite(a[j])) throw new RangeError('Non-finite sample');
  return a[i] + (a[j] - a[i]) * (p - i);
}
function section(a: ArrayLike<number>, fs: number, w: Interval) {
  if (!(w[1] > w[0])) throw new RangeError('Empty or reversed window');
  const points: [number, number][] = [[w[0], sampleAt(a, fs, w[0])]];
  for (let i = Math.floor(w[0] * fs) + 1; i < w[1] * fs; i++) points.push([i / fs, sampleAt(a, fs, i / fs)]);
  points.push([w[1], sampleAt(a, fs, w[1])]);
  if (points.length < 3) throw new RangeError('Insufficient samples');
  return points;
}
function integral(p: readonly (readonly [number, number])[], absolute = false) {
  let area = 0;
  for (let i = 1; i < p.length; i++) {
    const dt = p[i][0] - p[i - 1][0], a = p[i - 1][1], b = p[i][1];
    // Integrate two triangles exactly when a linear segment crosses zero.
    area += absolute && a * b < 0
      ? dt * (a * a + b * b) / (2 * (Math.abs(a) + Math.abs(b)))
      : dt * (absolute ? Math.abs(a) + Math.abs(b) : a + b) / 2;
  }
  return area;
}
export function morphologyMetrics(a: ArrayLike<number>, fs: number, w: Windows): WaveMetrics {
  if (!(w.baseline[1] < w.qrs[0] && w.qrs[1] <= w.t[0])) throw new RangeError('Overlapping or unordered windows');
  const bp = section(a, fs, w.baseline), base = integral(bp) / (w.baseline[1] - w.baseline[0]);
  const q = section(a, fs, w.qrs).map(p => p[1] - base);
  const t = section(a, fs, w.t).map(([x, y]) => [x, y - base] as [number, number]);
  const span = Math.max(...q) - Math.min(...q);
  let k = 0;
  for (let i = 1; i < t.length; i++) if (Math.abs(t[i][1]) > Math.abs(t[k][1])) k = i;
  const peak = t[k][1], sign = Math.sign(peak), threshold = Math.abs(peak) / 2;
  const crossing = (i: number, j: number) => {
    const a = sign * t[i][1], b = sign * t[j][1];
    return t[i][0] + (threshold - a) * (t[j][0] - t[i][0]) / (b - a);
  };
  let left: number | null = null, right: number | null = null;
  if (Math.abs(peak) > 1e-8) {
    for (let i = k; i > 0; i--) if (sign * t[i - 1][1] <= threshold && sign * t[i][1] > threshold) { left = crossing(i - 1, i); break; }
    for (let i = k; i < t.length - 1; i++) if (sign * t[i + 1][1] <= threshold && sign * t[i][1] > threshold) { right = crossing(i, i + 1); break; }
  }
  const j = sampleAt(a, fs, w.qrs[1]) - base, j60 = sampleAt(a, fs, w.qrs[1] + .06) - base;
  return { baselineMv: base, jMv: j, j60Mv: j60, stSlopeMvPerS: (j60 - j) / .06,
    qrsPeakToPeakMv: span, tPeakMv: peak, tPeakTime: t[k][0],
    tSignedAreaMvS: integral(t), tAbsoluteAreaMvS: integral(t, true),
    tFwhmMs: left !== null && right !== null ? (right - left) * 1000 : null,
    tSymmetry: Math.abs(peak) > 1e-8 && k > 0 && k < t.length - 1 ? (w.t[1] - t[k][0]) / (t[k][0] - w.t[0]) : null,
    tToQrs: span > 1e-6 ? peak / span : null };
}
