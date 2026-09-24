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
  return { peaks, leads, energy, threshold, high, candidates };
}
