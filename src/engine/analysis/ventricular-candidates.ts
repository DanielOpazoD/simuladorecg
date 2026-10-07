import type { Signal } from "../types";
type Samples = Pick<Signal, "fs" | "leads">;
/** Ventricular candidate detector — sample-domain detector only. No events, case, labels, truth, or audit input.
 * Internal constants are conservative engineering parameters, not clinical validation limits.
 * Return peaks are sample indices. Detection energy is NOT a calibrated onset/offset signal.
 * The temporary median branch is enabled only when the recording contains impulsive outliers.
 * P/T suppression is intentionally conservative. Remaining ambiguity must stay unavailable.
 */
const names = ["I", "II", "V1", "V5"] as const;
const quant = (a: number[], p: number) =>
  a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] ?? 0;
function shape(s: Samples, i: number) {
  const fs = s.fs,
    n = s.leads.I.length,
    mat = Array.from({ length: 4 }, () => Array(4).fill(0));
  let vel = 0,
    acc = 0;
  const radius = Math.round(0.08 * fs),
    half = Math.max(1, Math.round(0.004 * fs));
  for (
    let j = Math.max(half, i - radius);
    j < Math.min(n - half, i + radius);
    j++
  ) {
    const v = names.map((l) => s.leads[l][j + half] - s.leads[l][j - half]);
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) mat[a][b] += v[a] * v[b];
    vel += Math.hypot(...v);
    acc += Math.hypot(
      ...names.map(
        (l) => s.leads[l][j + half] - 2 * s.leads[l][j] + s.leads[l][j - half],
      ),
    );
  }
  let q = [0.5, 0.5, 0.5, 0.5];
  for (let k = 0; k < 25; k++) {
    let v = mat.map((row) => row.reduce((s, x, j) => s + x * q[j], 0)),
      norm = Math.hypot(...v);
    q = v.map((x) => x / (norm || 1));
  }
  const eigen = q.reduce(
      (s, x, i) => s + x * mat[i].reduce((sum, x, j) => sum + x * q[j], 0),
      0,
    ),
    trace = mat.reduce((s, row, i) => s + row[i], 0);
  if (!trace || !vel) return { rank: 1, rough: Infinity };
  return { rank: 1 - eigen / trace, rough: acc / vel };
}

/** Group opposing slopes only when a recurrent return level is observable and
 * the intervening deflection never returns to it. This is a sample-domain
 * engineering feature, not identification of a clinical isoelectric baseline.
 * Keeping similar repeating shapes separate protects genuine rapid QRS trains.
 */
function groupContinuousCandidates(s: Samples, peaks: number[]): number[] {
  const close = (distance: number) => distance > 0.18 && distance < 0.28;
  if (!peaks.some((peak, i) => i > 0 && close((peak - peaks[i - 1]) / s.fs)))
    return peaks;
  const n = Math.min(s.leads.I.length, 10 * s.fs);
  if (n < 3 * s.fs) return peaks;
  const rows = names.map(lead => Array.from(s.leads[lead].slice(0, n)).sort((a, b) => a - b));
  const middle = rows.map(row => row[Math.floor(n / 2)]);
  const range = Math.max(...rows.map(row =>
    row[Math.floor((n - 1) * 0.98)] - row[Math.floor((n - 1) * 0.02)]));
  if (range <= 0) return peaks;
  const step = range * 0.02;
  const bins = new Map<string, { count: number; sum: number[] }>();
  for (let i = 0; i < n; i++) {
    const values = names.map(lead => s.leads[lead][i]);
    const key = values.map((value, k) => Math.round((value - middle[k]) / step)).join(",");
    let bin = bins.get(key);
    if (!bin) { bin = { count: 0, sum: [0, 0, 0, 0] }; bins.set(key, bin); }
    bin.count++;
    values.forEach((value, k) => { bin!.sum[k] += value; });
  }
  const mode = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (mode.count < n * 0.04) return peaks;
  const returnLevel = mode.sum.map(value => value / mode.count);
  const magnitude = (i: number) => Math.hypot(...names.map((lead, k) => s.leads[lead][i] - returnLevel[k]));
  const keep: number[] = [];
  for (const candidate of peaks) {
    const previous = keep.at(-1);
    if (previous !== undefined && close((candidate - previous) / s.fs)) {
      let maximum = 0, minimum = Infinity;
      for (let i = previous; i <= candidate; i++) maximum = Math.max(maximum, magnitude(i));
      const edge = Math.round(0.024 * s.fs);
      for (let i = previous + edge; i <= candidate - edge; i++) minimum = Math.min(minimum, magnitude(i));
      if (minimum > maximum * 0.12) {
        const radius = Math.round(0.04 * s.fs), a: number[] = [], b: number[] = [];
        for (const lead of names) {
          const first = Array.from(s.leads[lead].slice(previous - radius, previous + radius + 1));
          const second = Array.from(s.leads[lead].slice(candidate - radius, candidate + radius + 1));
          const meanA = first.reduce((sum, value) => sum + value, 0) / first.length;
          const meanB = second.reduce((sum, value) => sum + value, 0) / second.length;
          a.push(...first.map(value => value - meanA));
          b.push(...second.map(value => value - meanB));
        }
        const correlation = a.reduce((sum, value, i) => sum + value * b[i], 0) /
          (Math.hypot(...a) * Math.hypot(...b));
        if (correlation < -0.5) continue;
      }
    }
    keep.push(candidate);
  }
  return keep;
}

export function detectVentricularCandidates(
  s: Samples,
  { medianWidth = 0.014, candidateFraction = 0.35, tReject = true } = {},
) {
  const fs = s.fs,
    n = Math.min(s.leads.I.length, Math.round(10 * fs));
  let short = 0,
    long = 0;
  const shortSlope = new Float64Array(n),
    longSlope = new Float64Array(n);
  for (let j = Math.round(0.02 * fs); j < n - Math.round(0.02 * fs); j++) {
    const f = Math.max(1, Math.round(0.002 * fs)),
      b = Math.max(1, Math.round(0.008 * fs));
    short = Math.max(
      short,
      (shortSlope[j] = Math.hypot(
        ...names.map(
          (l) => ((s.leads[l][j + f] - s.leads[l][j - f]) * fs) / (2 * f),
        ),
      )),
    );
    long = Math.max(
      long,
      (longSlope[j] = Math.hypot(
        ...names.map(
          (l) => ((s.leads[l][j + b] - s.leads[l][j - b]) * fs) / (2 * b),
        ),
      )),
    );
  }
  const r = short > 3.5 * long ? Math.round(medianWidth * fs) : 0;
  const leads = Object.fromEntries(
    names.map((l) => [
      l,
      r
        ? Float64Array.from(s.leads[l].subarray(0, n), (_, i) =>
            quant(
              Array.from(
                s.leads[l].slice(Math.max(0, i - r), Math.min(n, i + r + 1)),
              ),
              0.5,
            ),
          )
        : s.leads[l],
    ]),
  );
  const slope = Float64Array.from({ length: n }, (_, i) =>
      i
        ? Math.hypot(...names.map((l) => (leads[l][i] - leads[l][i - 1]) * fs))
        : 0,
    ),
    energy = new Float64Array(n),
    win = Math.round(0.018 * fs);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += slope[i];
    if (i >= win) sum -= slope[i - win];
    energy[i] = sum / win;
  }
  const threshold = Math.max(1.9, quant(Array.from(energy), 0.98) * 0.2),
    candidates: number[] = [];
  for (let i = Math.round(0.15 * fs); i < n - 1; i++) {
    if (
      energy[i] <= threshold ||
      energy[i] < energy[i - 1] ||
      energy[i] <= energy[i + 1]
    )
      continue;
    if (r) {
      let f = 0,
        b = 0;
      const h = Math.round(0.03 * fs);
      for (let j = Math.max(0, i - h); j < Math.min(n, i + h); j++) {
        f = Math.max(f, shortSlope[j]);
        b = Math.max(b, longSlope[j]);
      }
      if (f > 3.5 * b) continue;
    }
    let p = candidates.at(-1);
    if (p === undefined || i - p > 0.18 * fs) candidates.push(i);
    else if (energy[i] > energy[p]) candidates[candidates.length - 1] = i;
  }
  const high = quant(
    candidates.map((i) => energy[i]),
    0.8,
  );
  let peaks = candidates.filter(
    (i) => energy[i] > Math.max(1.9, high * candidateFraction),
  );
  if (tReject) {
    const accepted: number[] = [];
    for (const i of peaks) {
      const p = accepted.at(-1),
        d = p === undefined ? 9 : (i - p) / fs;
      if (
        p !== undefined &&
        d >= 0.2 &&
        d <= 0.4 &&
        energy[i] < 0.72 * energy[p]
      ) {
        const f = shape(s, i),
          g = shape(s, p);
        if (f.rank < 0.001 && g.rank > 0.005 && f.rough < 0.7 * g.rough)
          continue;
      }
      accepted.push(i);
    }
    peaks = accepted;
  }
  if ((peaks.at(-1) ?? 0) > n - 0.18 * fs) peaks.pop();
  const boundaryCandidates = peaks;
  if(tReject) {
    // Experimental analysis-only 20 ms moving average. Original samples and
    // exported candidate positions are never resampled or overwritten.
    const halfWindow = Math.max(1, Math.round(0.01 * fs));
    const smoothed = {fs, leads: Object.fromEntries(names.map(name => {
      const a = s.leads[name], out = new Float64Array(a.length);
      let sum = 0, left = 0, right = -1;
      for (let i = 0; i < a.length; i++) {
        const end = Math.min(a.length - 1, i + halfWindow);
        while (right < end) sum += a[++right];
        while (left < Math.max(0, i - halfWindow)) sum -= a[left++];
        out[i] = sum / (right - left + 1);
      }
      return [name, out];
    }))} as Samples;
    const refined: number[] = [];
    for(const i of peaks) {
      const p=refined.at(-1),d=p===undefined?9:(i-p)/fs;
      if (p !== undefined && d >= 0.2 && d <= 0.4) {
        // Strict clean-shape evidence does not require T energy below QRS.
        const raw = shape(s, i), prior = shape(s, p);
        if (raw.rank < 0.00001 && prior.rank > 0.005 && raw.rough < 0.7 * prior.rough) continue;
        const f = shape(smoothed, i), g = shape(smoothed, p);
        if (f.rank < 0.003 && g.rank > 0.01 && f.rank < 0.1 * g.rank && f.rough < 0.85 * g.rough)
          continue;
      }
      refined.push(i);
    }
    peaks = groupContinuousCandidates(s, refined);
  }
  return { peaks, boundaryCandidates, leads, energy, threshold, high, candidates };
}
