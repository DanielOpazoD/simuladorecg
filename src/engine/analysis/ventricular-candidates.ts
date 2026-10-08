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
  const {I, II, V1, V5} = s.leads;
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
      I[j + half] - 2 * I[j] + I[j - half],
      II[j + half] - 2 * II[j] + II[j - half],
      V1[j + half] - 2 * V1[j] + V1[j - half],
      V5[j + half] - 2 * V5[j] + V5[j - half],
    );
  }
  const trace = mat.reduce((sum, row, i) => sum + row[i], 0);
  if (!trace || !vel) return { rank: 1, rough: Infinity };
  return { rank: covarianceResidual(mat), rough: acc / vel };
}

/** Fraction of a four-channel covariance outside its dominant direction.
 * Symmetric Jacobi rotations avoid a power-iteration seed orthogonal to the
 * principal eigenspace. The stopping bound is floating-point precision, not a
 * physiological or classifier threshold. Never mutates the supplied matrix.
 */
export function covarianceResidual(mat: readonly (readonly number[])[]): number {
  if (mat.length !== 4 || mat.some(row => row.length !== 4))
    throw new Error("Expected four-channel covariance");
  let scale = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (!Number.isFinite(mat[i][j]) || mat[i][j] !== mat[j][i])
      throw new Error("Expected finite symmetric covariance");
    scale = Math.max(scale, Math.abs(mat[i][j]));
  }
  if (scale === 0) return 1;
  const a = mat.map(row => row.map(value => value / scale));
  const trace = a.reduce((sum, row, i) => sum + row[i], 0);
  if (trace <= 0) throw new Error("Expected positive semidefinite covariance");
  for (const row of a) for (let j = 0; j < 4; j++) row[j] /= trace;
  const precision = 16 * Number.EPSILON;
  let converged = false;
  for (let rotation = 0; rotation < 64; rotation++) {
    let p = 0, q = 1, largest = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
      if (Math.abs(a[i][j]) > largest) { p = i; q = j; largest = Math.abs(a[i][j]); }
    if (largest <= precision) { converged = true; break; }
    const off = a[p][q], tau = (a[q][q] - a[p][p]) / (2 * off);
    const t = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
    const c = 1 / Math.hypot(1, t), s = t * c;
    a[p][p] -= t * off; a[q][q] += t * off; a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 4; k++) if (k !== p && k !== q) {
      const first = a[k][p], second = a[k][q];
      a[k][p] = a[p][k] = c * first - s * second;
      a[k][q] = a[q][k] = s * first + c * second;
    }
  }
  if (!converged) throw new Error("Covariance eigensolver did not converge");
  const eigenvalues = a.map((row, i) => row[i]);
  if (Math.min(...eigenvalues) < -precision || Math.max(...eigenvalues) > 1 + precision)
    throw new Error("Expected positive semidefinite covariance");
  return Math.max(0, Math.min(1, 1 - Math.max(...eigenvalues)));
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
        // Candidate times can sit on opposite slopes of two separate QRS.
        // The 280 ms grouping ceiling must also hold at their local apices;
        // otherwise a late first-QRS candidate and early second-QRS candidate
        // falsely resemble the two slopes of one broad deflection.
        const apex = (at: number) => {
          const search = Math.min(Math.round(0.12 * s.fs), Math.floor((candidate - previous) / 2));
          let best = at, value = -Infinity;
          for (let j = Math.max(0, at - search); j <= Math.min(n - 1, at + search); j++) {
            const current = magnitude(j);
            if (current > value) { value = current; best = j; }
          }
          return best;
        };
        const radius = Math.round(0.04 * s.fs);
        const similarity = (firstAt: number, secondAt: number) => {
          const a: number[] = [], b: number[] = [];
          for (const lead of names) {
            const first = Array.from(s.leads[lead].slice(firstAt - radius, firstAt + radius + 1));
            const second = Array.from(s.leads[lead].slice(secondAt - radius, secondAt + radius + 1));
            const meanA = first.reduce((sum, value) => sum + value, 0) / first.length;
            const meanB = second.reduce((sum, value) => sum + value, 0) / second.length;
            a.push(...first.map(value => value - meanA));
            b.push(...second.map(value => value - meanB));
          }
          const correlation = a.reduce((sum, value, i) => sum + value * b[i], 0) /
            (Math.hypot(...a) * Math.hypot(...b));
          return correlation;
        };
        const firstApex = apex(previous), secondApex = apex(candidate);
        // Strong same-shape evidence prevents preserving unrelated artifact lobes.
        if ((secondApex - firstApex) / s.fs >= 0.28 && similarity(firstApex, secondApex) > 0.9) {
          keep.push(candidate);
          continue;
        }
        if (similarity(previous, candidate) < -0.5) continue;
      }
    }
    keep.push(candidate);
  }
  return keep;
}

/** Confirm repeated late-wave morphology using only waves already rejected by
 * the strict shape rule. Three separate preceding complexes must support the
 * same contour and delay; a repeated QRS-like contour is protected. This makes
 * an isolated noise fluctuation unable to turn the same T into another beat.
 * This is an engineering discriminator, not a clinical wave classification. */
export function rejectRepeatedTerminalWaves(
  s: Samples,
  all: readonly number[],
  retained: number[],
): number[] {
  const rejected = all.filter((i) => !retained.includes(i));
  if (rejected.length < 3) return retained;
  const { fs } = s,
    n = Math.min(s.leads.I.length, 10 * fs),
    radius = Math.round(0.08 * fs);
  const cache = new Map<number, number[]>();
  const signature = (i: number) => {
    let v = cache.get(i);
    if (v) return v;
    v = [];
    for (const lead of names) {
      const x = Array.from(
          s.leads[lead].slice(
            Math.max(0, i - radius),
            Math.min(n, i + radius + 1),
          ),
        ),
        mean = x.reduce((a, b) => a + b, 0) / x.length;
      v.push(...x.map((y) => y - mean));
    }
    const norm = Math.hypot(...v);
    if (norm) v = v.map((x) => x / norm);
    cache.set(i, v);
    return v;
  };
  const similarity = (a: number, b: number) => {
    const x = signature(a),
      y = signature(b);
    return x.length === y.length
      ? x.reduce((sum, v, i) => sum + v * y[i], 0)
      : -1;
  };
  const templates = rejected
    .map((i) => ({ i, prior: retained.filter((p) => p < i).at(-1) }))
    .filter((t) => t.prior !== undefined);
  const result: number[] = [];
  for (const i of retained) {
    const p = result.at(-1),
      delay = p === undefined ? Infinity : (i - p) / fs;
    if (
      p !== undefined &&
      delay >= 0.2 &&
      delay <= 0.4 &&
      similarity(i, p) < 0.9
    ) {
      const support = new Set(
        templates
          .filter(
            (t) =>
              Math.abs((t.i - t.prior!) / fs - delay) <= 0.03 &&
              similarity(i, t.i) >= 0.98,
          )
          .map((t) => t.prior),
      );
      if (support.size >= 3) continue;
    }
    result.push(i);
  }
  return result;
}

export function detectVentricularCandidates(
  s: Samples,
  { medianWidth = 0.014, candidateFraction = 0.35, tReject = true } = {},
) {
  const {I, II, V1, V5} = s.leads;
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
        ((I[j + f] - I[j - f]) * fs) / (2 * f),
        ((II[j + f] - II[j - f]) * fs) / (2 * f),
        ((V1[j + f] - V1[j - f]) * fs) / (2 * f),
        ((V5[j + f] - V5[j - f]) * fs) / (2 * f),
      )),
    );
    long = Math.max(
      long,
      (longSlope[j] = Math.hypot(
        ((I[j + b] - I[j - b]) * fs) / (2 * b),
        ((II[j + b] - II[j - b]) * fs) / (2 * b),
        ((V1[j + b] - V1[j - b]) * fs) / (2 * b),
        ((V5[j + b] - V5[j - b]) * fs) / (2 * b),
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
        ? Math.hypot(
            (leads.I[i] - leads.I[i - 1]) * fs,
            (leads.II[i] - leads.II[i - 1]) * fs,
            (leads.V1[i] - leads.V1[i - 1]) * fs,
            (leads.V5[i] - leads.V5[i - 1]) * fs,
          )
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
    peaks = groupContinuousCandidates(s, rejectRepeatedTerminalWaves(smoothed, peaks, refined));
  }
  return { peaks, boundaryCandidates, leads, energy, threshold, high, candidates };
}

// Shared with the confidence screen; exporting this feature changes no detections.
export { shape as candidateShape };
