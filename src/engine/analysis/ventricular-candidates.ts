import type { Signal } from "../types";
type Samples = Pick<Signal, "fs" | "leads">;
/** One accepted ventricular observation, in sample coordinates. Support points
 * are observed slopes of this complex, not extra activations or true boundaries. */
export interface VentricularComplexObservation {
  readonly marker: number;
  readonly support: readonly number[];
  readonly recovered: boolean;
  readonly refractoryRestored: boolean;
}

/** Ventricular candidate detector — sample-domain detector only. No events, case, labels, truth, or audit input.
 * Internal constants are conservative engineering parameters, not clinical validation limits.
 * Return peaks are sample indices. Detection energy is NOT a calibrated onset/offset signal.
 * The temporary median branch is enabled only when the recording contains impulsive outliers.
 * P/T suppression is intentionally conservative. Remaining ambiguity must stay unavailable.
 */
const names = ["I", "II", "V1", "V5"] as const;
function dot(first: readonly number[], second: readonly number[]) {
  let sum = 0;
  for (let k = 0; k < first.length; k++) sum += first[k] * second[k];
  return sum;
}
const quant = (a: number[], p: number) =>
  a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] ?? 0;
function shape(s: Samples, i: number) {
  const { I, II, V1, V5 } = s.leads;
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
export function covarianceResidual(
  mat: readonly (readonly number[])[],
): number {
  if (mat.length !== 4 || mat.some((row) => row.length !== 4))
    throw new Error("Expected four-channel covariance");
  let scale = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      if (!Number.isFinite(mat[i][j]) || mat[i][j] !== mat[j][i])
        throw new Error("Expected finite symmetric covariance");
      scale = Math.max(scale, Math.abs(mat[i][j]));
    }
  if (scale === 0) return 1;
  const a = mat.map((row) => row.map((value) => value / scale));
  const trace = a.reduce((sum, row, i) => sum + row[i], 0);
  if (trace <= 0) throw new Error("Expected positive semidefinite covariance");
  for (const row of a) for (let j = 0; j < 4; j++) row[j] /= trace;
  const precision = 16 * Number.EPSILON;
  let converged = false;
  for (let rotation = 0; rotation < 64; rotation++) {
    let p = 0,
      q = 1,
      largest = 0;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        if (Math.abs(a[i][j]) > largest) {
          p = i;
          q = j;
          largest = Math.abs(a[i][j]);
        }
    if (largest <= precision) {
      converged = true;
      break;
    }
    const off = a[p][q],
      tau = (a[q][q] - a[p][p]) / (2 * off);
    const t = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
    const c = 1 / Math.hypot(1, t),
      s = t * c;
    a[p][p] -= t * off;
    a[q][q] += t * off;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 4; k++)
      if (k !== p && k !== q) {
        const first = a[k][p],
          second = a[k][q];
        a[k][p] = a[p][k] = c * first - s * second;
        a[k][q] = a[q][k] = s * first + c * second;
      }
  }
  if (!converged) throw new Error("Covariance eigensolver did not converge");
  const eigenvalues = a.map((row, i) => row[i]);
  if (
    Math.min(...eigenvalues) < -precision ||
    Math.max(...eigenvalues) > 1 + precision
  )
    throw new Error("Expected positive semidefinite covariance");
  return Math.max(0, Math.min(1, 1 - Math.max(...eigenvalues)));
}

/** Group opposing slopes only when a recurrent return level is observable and
 * the intervening deflection never returns to it. This is a sample-domain
 * engineering feature, not identification of a clinical isoelectric baseline.
 * Keeping similar repeating shapes separate protects genuine rapid QRS trains.
 */
/** Delineation support metadata never adds or removes a detected beat. */
type MergeSink = (first: number, last: number) => void;
function prepareContinuousGrouping(
  s: Samples,
  recenterReturnLevel = false,
): (peaks: number[], merged?: MergeSink, minimumGap?: number) => number[] {
  const n = Math.min(s.leads.I.length, 10 * s.fs);
  if (n < 3 * s.fs) return (peaks) => peaks;
  const rows = names.map((lead) =>
    Array.from(s.leads[lead].slice(0, n)).sort((a, b) => a - b),
  );
  const middle = rows.map((row) => row[Math.floor(n / 2)]);
  const range = Math.max(
    ...rows.map(
      (row) =>
        row[Math.floor((n - 1) * 0.98)] - row[Math.floor((n - 1) * 0.02)],
    ),
  );
  if (range <= 0) return (peaks) => peaks;
  const step = range * 0.02;
  const bins = new Map<string, { count: number; sum: number[] }>();
  for (let i = 0; i < n; i++) {
    const values = names.map((lead) => s.leads[lead][i]);
    const key = values
      .map((value, k) => Math.round((value - middle[k]) / step))
      .join(",");
    let bin = bins.get(key);
    if (!bin) {
      bin = { count: 0, sum: [0, 0, 0, 0] };
      bins.set(key, bin);
    }
    bin.count++;
    values.forEach((value, k) => {
      bin!.sum[k] += value;
    });
  }
  let mode = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  // A fixed bin edge can split one noisy recurrent return level. Recenter the
  // same-width window on its observed mean, requiring strictly more samples
  // at each step. Neither the density threshold nor its spatial width changes.
  while (recenterReturnLevel && mode.count < n * 0.04) {
    const center = mode.sum.map((value) => value / mode.count);
    const next = { count: 0, sum: [0, 0, 0, 0] };
    for (let i = 0; i < n; i++)
      if (
        names.every(
          (lead, k) => Math.abs(s.leads[lead][i] - center[k]) <= step / 2,
        )
      ) {
        next.count++;
        names.forEach((lead, k) => (next.sum[k] += s.leads[lead][i]));
      }
    if (next.count <= mode.count) break;
    mode = next;
  }
  if (mode.count < n * 0.04) return (peaks) => peaks;
  const returnLevel = mode.sum.map((value) => value / mode.count);
  const magnitude = (i: number) =>
    Math.hypot(...names.map((lead, k) => s.leads[lead][i] - returnLevel[k]));
  return (peaks: number[], merged?: MergeSink, minimumGap = 0.18) => {
    const keep: number[] = [];
    for (const candidate of peaks) {
      const previous = keep.at(-1);
      if (
        previous !== undefined &&
        (candidate - previous) / s.fs > minimumGap &&
        (candidate - previous) / s.fs < 0.28
      ) {
        let maximum = 0,
          minimum = Infinity;
        for (let i = previous; i <= candidate; i++)
          maximum = Math.max(maximum, magnitude(i));
        const edge = Math.round(0.024 * s.fs);
        for (let i = previous + edge; i <= candidate - edge; i++)
          minimum = Math.min(minimum, magnitude(i));
        if (minimum > maximum * 0.12) {
          // Candidate times can sit on opposite slopes of two separate QRS.
          // The 280 ms grouping ceiling must also hold at their local apices;
          // otherwise a late first-QRS candidate and early second-QRS candidate
          // falsely resemble the two slopes of one broad deflection.
          const apex = (at: number) => {
            const search = Math.min(
              Math.round(0.12 * s.fs),
              Math.floor((candidate - previous) / 2),
            );
            let best = at,
              value = -Infinity;
            for (
              let j = Math.max(0, at - search);
              j <= Math.min(n - 1, at + search);
              j++
            ) {
              const current = magnitude(j);
              if (current > value) {
                value = current;
                best = j;
              }
            }
            return best;
          };
          const radius = Math.round(0.04 * s.fs);
          const similarity = (firstAt: number, secondAt: number) => {
            const a: number[] = [],
              b: number[] = [];
            for (const lead of names) {
              const first = Array.from(
                s.leads[lead].slice(firstAt - radius, firstAt + radius + 1),
              );
              const second = Array.from(
                s.leads[lead].slice(secondAt - radius, secondAt + radius + 1),
              );
              const meanA =
                first.reduce((sum, value) => sum + value, 0) / first.length;
              const meanB =
                second.reduce((sum, value) => sum + value, 0) / second.length;
              a.push(...first.map((value) => value - meanA));
              b.push(...second.map((value) => value - meanB));
            }
            const correlation =
              a.reduce((sum, value, i) => sum + value * b[i], 0) /
              (Math.hypot(...a) * Math.hypot(...b));
            return correlation;
          };
          const firstApex = apex(previous),
            secondApex = apex(candidate);
          // Strong same-shape evidence prevents preserving unrelated artifact lobes.
          if (
            (secondApex - firstApex) / s.fs >= 0.28 &&
            similarity(firstApex, secondApex) > 0.9
          ) {
            keep.push(candidate);
            continue;
          }
          if (similarity(previous, candidate) < -0.5) {
            merged?.(previous, candidate);
            continue;
          }
        }
      }
      keep.push(candidate);
    }
    return keep;
  };
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

/** Maximum-score subset of observed maxima with a fixed minimum separation.
 * Unlike a moving greedy anchor, an intermediate slope cannot transitively
 * suppress two mutually compatible maxima. No interpolation or model clock. */
export function selectRefractoryMaxima(
  maxima: readonly number[],
  energy: ArrayLike<number>,
  separation: number,
): number[] {
  const best = new Float64Array(maxima.length + 1);
  const previous = new Int32Array(maxima.length);
  let left = -1;
  for (let k = 0; k < maxima.length; k++) {
    while (left + 1 < k && maxima[k] - maxima[left + 1] > separation) left++;
    previous[k] = left;
    best[k + 1] = Math.max(best[k], energy[maxima[k]] + best[left + 1]);
  }
  const selected: number[] = [];
  for (let k = maxima.length - 1; k >= 0; ) {
    if (energy[maxima[k]] + best[previous[k] + 1] > best[k]) {
      selected.push(maxima[k]);
      k = previous[k];
    } else k--;
  }
  return selected.reverse();
}

function smoothAnalysisSamples(s: Samples): Samples {
  const fs = s.fs;
  const halfWindow = Math.max(1, Math.round(0.01 * fs));
  return {
    fs,
    leads: Object.fromEntries(
      names.map((name) => {
        const a = s.leads[name],
          out = new Float64Array(a.length);
        let sum = 0,
          left = 0,
          right = -1;
        for (let i = 0; i < a.length; i++) {
          const end = Math.min(a.length - 1, i + halfWindow);
          while (right < end) sum += a[++right];
          while (left < Math.max(0, i - halfWindow)) sum -= a[left++];
          out[i] = sum / (right - left + 1);
        }
        return [name, out];
      }),
    ),
  } as Samples;
}

export function detectVentricularCandidates(
  s: Samples,
  { medianWidth = 0.014, candidateFraction = 0.35, tReject = true } = {},
) {
  const { I, II, V1, V5 } = s.leads;
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
  let smoothedCache: Samples | undefined;
  const smoothedForAnalysis = () =>
    (smoothedCache ??= smoothAnalysisSamples(s));
  let grouper:
    | ((peaks: number[], merged?: MergeSink, minimumGap?: number) => number[])
    | undefined;
  const groupContinuousCandidates = (
    _s: Samples,
    peaks: number[],
    merged?: MergeSink,
    minimumGap = 0.18,
  ) => {
    if (
      !peaks.some(
        (p, k) =>
          k > 0 &&
          (p - peaks[k - 1]) / fs > minimumGap &&
          (p - peaks[k - 1]) / fs < 0.28,
      )
    )
      return peaks;
    return (grouper ??= prepareContinuousGrouping(s))(
      peaks,
      merged,
      minimumGap,
    );
  };
  const scoreCache = new Map<number, number>();
  const excursionScore = (i: number) => {
    let cached = scoreCache.get(i);
    if (cached !== undefined) return cached;
    const half = Math.round(0.08 * fs),
      a = Math.max(0, i - half),
      b = Math.min(n - 1, i + half);
    let square = 0;
    for (const name of names) {
      let lo = Infinity,
        hi = -Infinity;
      for (let j = a; j <= b; j++) {
        lo = Math.min(lo, leads[name][j]);
        hi = Math.max(hi, leads[name][j]);
      }
      square += (hi - lo) ** 2;
    }
    cached = Math.sqrt(square);
    scoreCache.set(i, cached);
    return cached;
  };
  const threshold = Math.max(1.9, quant(Array.from(energy), 0.98) * 0.2),
    candidates: number[] = [],
    allMaxima: number[] = [],
    supportMaxima: number[] = [];
  for (let i = Math.max(1, win); i < n - 1; i++) {
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
    supportMaxima.push(i);
    if (i < Math.round(0.15 * fs)) continue;
    allMaxima.push(i);
    let p = candidates.at(-1);
    if (p === undefined || i - p > 0.18 * fs) candidates.push(i);
    else if (energy[i] > energy[p]) candidates[candidates.length - 1] = i;
  }
  const restoredByRefractorySelection = new Set<number>();
  const recoverySignatures = new Map<number, number[] | null>();
  const recoverySignature = (i: number) => {
    if (recoverySignatures.has(i)) return recoverySignatures.get(i)!;
    const radius = Math.round(0.08 * fs);
    if (i < radius || i + radius >= n) {
      recoverySignatures.set(i, null);
      return null;
    }
    const values: number[] = [];
    for (const lead of names) {
      const row = Array.from(leads[lead].slice(i - radius, i + radius + 1));
      const mean = row.reduce((a, b) => a + b, 0) / row.length;
      values.push(...row.map((value) => value - mean));
    }
    const norm = Math.hypot(...values);
    const signature = norm ? values.map((value) => value / norm) : null;
    recoverySignatures.set(i, signature);
    return signature;
  };
  const recoverySimilarity = (first: number, second: number) => {
    const a = recoverySignature(first),
      b = recoverySignature(second);
    return a && b ? dot(a, b) : -1;
  };
  const recurrentMorphology = (train: number[], opposingSlopes = false) => {
    const complete = train.filter((i) => recoverySignature(i) !== null);
    if (complete.length < 6) return false;
    let same = 0;
    for (let k = 1; k < complete.length; k++)
      if (
        recoverySimilarity(complete[k], complete[k - 1]) > 0.9 ||
        (opposingSlopes &&
          recoverySimilarity(complete[k], complete[k - 1]) < -0.9)
      )
        same++;
    return same >= 0.8 * (complete.length - 1);
  };
  const dominantContour = (train: number[]) => {
    const complete = train.filter((i) => recoverySignature(i) !== null);
    return (
      complete.length >= 6 &&
      complete.some(
        (anchor) =>
          complete.filter((i) => recoverySimilarity(i, anchor) > 0.9).length >=
          0.8 * complete.length,
      )
    );
  };
  // Experimental non-transitive selection: a stronger intermediate maximum
  // cannot erase two mutually compatible observed candidates merely by moving
  // the refractory anchor. Scores and the existing 180 ms separation are unchanged.
  if (
    tReject &&
    allMaxima.length &&
    candidates.length >= 6 &&
    quant(
      candidates.slice(1).map((p, k) => (p - candidates[k]) / fs),
      0.75,
    ) <= 0.36 &&
    dominantContour(candidates)
  ) {
    const groupedInitial = prepareContinuousGrouping(s, true)(candidates);
    const duplicates = new Set(
      candidates.filter((i) => !groupedInitial.includes(i)),
    );
    const supported = allMaxima.filter(
      (i) =>
        !duplicates.has(i) &&
        (candidates.includes(i) ||
          candidates.filter(
            (p) =>
              Math.abs(p - i) > 0.18 * fs && recoverySimilarity(i, p) > 0.9,
          ).length >= 3),
    );
    const selected = selectRefractoryMaxima(supported, energy, 0.18 * fs);
    if (
      groupContinuousCandidates(s, selected).length > groupedInitial.length &&
      recurrentMorphology(selected)
    ) {
      for (const i of selected)
        if (!candidates.includes(i)) restoredByRefractorySelection.add(i);
      candidates.splice(0, candidates.length, ...selected);
    }
  }
  const recovered = new Set<number>();
  const selectionStrength = new Map<number, number>();
  if (tReject) {
    const proposed: number[] = [];
    for (const i of allMaxima) {
      const p = proposed.at(-1);
      if (p === undefined || i - p > 0.18 * fs) proposed.push(i);
      else if (
        (i - p > 0.08 * fs ? excursionScore(i) : energy[i]) >
        (i - p > 0.08 * fs ? excursionScore(p) : energy[p])
      )
        proposed[proposed.length - 1] = i;
    }
    const signatureCache = new Map<number, number[]>();
    const signature = (i: number) => {
      let v = signatureCache.get(i);
      if (v) return v;
      v = [];
      const radius = Math.round(0.08 * fs);
      for (const lead of names) {
        const row = Array.from(
            leads[lead].slice(
              Math.max(0, i - radius),
              Math.min(n, i + radius + 1),
            ),
          ),
          mean = row.reduce((a, b) => a + b, 0) / row.length;
        v.push(...row.map((x) => x - mean));
      }
      const norm = Math.hypot(...v);
      if (norm) v = v.map((x) => x / norm);
      signatureCache.set(i, v);
      return v;
    };
    const similarity = (a: number, b: number) => {
      const x = signature(a),
        y = signature(b);
      return x.length === y.length
        ? x.reduce((sum, v, k) => sum + v * y[k], 0)
        : -1;
    };
    const isolated = (old: number) => {
      const k = candidates.indexOf(old),
        lastSupported = n - 0.18 * fs;
      return (
        (k === 0 || old - candidates[k - 1] > 0.36 * fs) &&
        (k === candidates.length - 1 ||
          candidates[k + 1] > lastSupported ||
          candidates[k + 1] - old > 0.36 * fs)
      );
    };
    const pairs = proposed
      .filter((i) => !candidates.includes(i))
      .map((i) => ({
        i,
        old: candidates.reduce(
          (best, p) => (Math.abs(p - i) < Math.abs(best - i) ? p : best),
          Infinity,
        ),
      }))
      .filter(
        (p) =>
          p.old - p.i > 0.08 * fs &&
          p.old - p.i <= 0.18 * fs &&
          p.i <= n - 0.18 * fs &&
          isolated(p.old),
      );
    const confirmed = pairs.filter((p) => {
      const compatible = pairs.filter(
        (q) =>
          Math.abs(p.i - p.old - (q.i - q.old)) <= 0.03 * fs &&
          similarity(p.i, q.i) >= 0.98 &&
          similarity(p.old, q.old) >= 0.98,
      );
      return new Set(compatible.map((q) => q.old)).size >= 3;
    });
    const substitutions = new Map(
      confirmed
        .filter((p) => confirmed.filter((q) => q.old === p.old).length === 1)
        .map((p) => [p.old, p.i]),
    );
    // Opposite 160 ms contours with strong existing same-shape evidence can
    // be two slopes of one QRS. Preserve its fiducial if moving only some
    // instances would add RR dispersion beyond the existing 30 ms agreement.
    const rrSpread = (train: number[]) => {
      const rr = train.slice(1).map((p, k) => p - train[k]);
      return quant(rr, 0.9) - quant(rr, 0.1);
    };
    if (
      rrSpread(candidates.map((p) => substitutions.get(p) ?? p)) >
      rrSpread(candidates) + 0.03 * fs
    ) {
      for (const [old, next] of substitutions)
        if (
          similarity(next, old) < -0.9 &&
          groupContinuousCandidates(s, [next, old], undefined, 0.08).length ===
            1
        )
          substitutions.delete(old);
    }
    let conflicts = true;
    while (conflicts) {
      conflicts = false;
      for (let k = 1; k < candidates.length; k++) {
        const a = candidates[k - 1],
          b = candidates[k];
        if (
          (substitutions.get(b) ?? b) - (substitutions.get(a) ?? a) <=
          0.18 * fs
        ) {
          conflicts = substitutions.delete(a) || conflicts;
          conflicts = substitutions.delete(b) || conflicts;
        }
      }
    }
    for (let k = 0; k < candidates.length; k++) {
      const old = candidates[k],
        next = substitutions.get(old) ?? old;
      selectionStrength.set(next, Math.max(energy[old], energy[next]));
      if (next !== old) recovered.add(next);
      candidates[k] = next;
    }
  }
  // Development prototype: temporal bandwidth is normalized by the observed
  // deflection energy, so a larger atrial/repolarization wave cannot win by
  // amplitude alone. Constants are exposed engineering choices, not validation.
  const bandwidthCache = new Map<number, number>();
  const bandwidth = (at: number) => {
    const cached = bandwidthCache.get(at);
    if (cached !== undefined) return cached;
    const h = Math.max(1, Math.round(0.004 * fs));
    const radius = Math.round(0.08 * fs);
    let first = 0,
      third = 0;
    for (
      let j = Math.max(2 * h, at - radius);
      j < Math.min(n - 2 * h, at + radius);
      j++
    ) {
      for (const lead of names) {
        const row = leads[lead];
        const v = row[j + h] - row[j - h];
        const t =
          row[j + 2 * h] - 2 * row[j + h] + 2 * row[j - h] - row[j - 2 * h];
        first += v * v;
        third += t * t;
      }
    }
    const result = first > 0 ? Math.sqrt(third / first) : Infinity;
    bandwidthCache.set(at, result);
    return result;
  };

  const high = quant(
    candidates.map((i) => selectionStrength.get(i) ?? energy[i]),
    0.8,
  );
  let peaks = candidates.filter(
    (i) =>
      (selectionStrength.get(i) ?? energy[i]) >
      Math.max(1.9, high * candidateFraction),
  );
  const components = new Map<number, number[]>();
  for (let k = 1; k < peaks.length; k++) {
    const p = peaks[k - 1],
      i = peaks[k];
    if (tReject && groupContinuousCandidates(s, [p, i]).length === 1)
      components.set(i, [...(components.get(p) ?? [p]), i]);
  }
  // A qualified second slope hidden inside NMS can still supply morphology
  // evidence for the same continuous complex. Look in both time directions;
  // this does not add a detected activation or use the generator's boundaries.
  if (tReject) {
    const ownership = new Map<
      number,
      { marker: number; distance: number; tied: boolean }
    >();
    for (const marker of peaks) {
      const hidden = supportMaxima.filter(
        (p) =>
          Math.abs(p - marker) > 0.08 * fs &&
          Math.abs(p - marker) < 0.18 * fs &&
          energy[p] > Math.max(1.9, high * candidateFraction) &&
          !peaks.some(
            (q) =>
              q !== marker &&
              q >= Math.min(p, marker) &&
              q <= Math.max(p, marker),
          ) &&
          groupContinuousCandidates(
            s,
            [Math.min(p, marker), Math.max(p, marker)],
            undefined,
            0.08,
          ).length === 1,
      );
      for (const p of hidden) {
        const distance = Math.abs(p - marker),
          previous = ownership.get(p);
        if (!previous || distance < previous.distance)
          ownership.set(p, { marker, distance, tied: false });
        else if (distance === previous.distance) previous.tied = true;
      }
    }
    for (const [p, owner] of ownership)
      if (!owner.tied) {
        components.set(owner.marker, [
          ...new Set([...(components.get(owner.marker) ?? [owner.marker]), p]),
        ]);
      }
  }
  const complexShapes = (samples: Samples, i: number) =>
    (components.get(i) ?? [i]).map((p) => shape(samples, p));
  const complexEnergy = (i: number) =>
    Math.max(...(components.get(i) ?? [i]).map((p) => energy[p]));
  if (tReject) {
    const accepted: number[] = [];
    for (const i of peaks) {
      const p = accepted.at(-1),
        d =
          p === undefined
            ? 9
            : (i - Math.min(...(components.get(p) ?? [p]))) / fs;
      if (
        p !== undefined &&
        d >= 0.2 &&
        d <= 0.4 &&
        energy[i] < 0.72 * complexEnergy(p)
      ) {
        const f = shape(s, i);
        if (
          complexShapes(s, p).some(
            (g) => f.rank < 0.001 && g.rank > 0.005 && f.rough < 0.7 * g.rough,
          )
        )
          continue;
      }
      accepted.push(i);
    }
    peaks = accepted;
  }
  if ((peaks.at(-1) ?? 0) > n - 0.18 * fs) peaks.pop();
  const boundaryCandidates = peaks;
  let waveformRejected = new Set<number>();
  // Classification changes activation identity, not the observed geometric
  // landmarks already used to delineate QRS. Keep that evidence immutable.
  if (tReject) {
    const recurrentCache = new Map<number, boolean>();
    const recurrent = (at: number) => {
      if (recurrentCache.has(at)) return recurrentCache.get(at)!;
      const result =
        peaks.filter(
          (other) =>
            Math.abs(other - at) > 0.4 * fs &&
            recoverySimilarity(at, other) >= 0.9,
        ).length >= 3;
      recurrentCache.set(at, result);
      return result;
    };
    const completeBandwidth = (at: number) =>
      Math.max(...(components.get(at) ?? [at]).map(bandwidth));
    const completeRank = (at: number) =>
      Math.max(...complexShapes(s, at).map((observation) => observation.rank));
    waveformRejected = new Set(
      peaks.filter(
        (at) =>
          completeBandwidth(at) < 0.18 &&
          recurrent(at) &&
          peaks.some(
            (other) =>
              Math.abs(other - at) > 0.08 * fs &&
              Math.abs(other - at) < 0.4 * fs &&
              recoverySimilarity(at, other) < 0.9 &&
              recurrent(other) &&
              ((completeRank(at) < 0.01 &&
                (completeBandwidth(other) > 0.25 ||
                  (completeRank(other) > 0.01 &&
                    completeRank(at) < 0.1 * completeRank(other)))) ||
                (components.get(other) ?? [other]).some(
                  (component) =>
                    completeRank(at) > 5 * shape(s, component).rank &&
                    completeBandwidth(at) < 0.6 * bandwidth(component),
                )),
          ),
      ),
    );
  }

  const mergedComponents = new Map<number, number[]>();
  const ensembleDisambiguated = new Set<number>();
  if (tReject) {
    // Experimental analysis-only 20 ms moving average. Original samples and
    // exported candidate positions are never resampled or overwritten.
    const smoothed = smoothedForAnalysis();
    // Repeated, closely matching observed contours can supply a lower-noise
    // descriptor without changing any recorded sample or candidate timestamp.
    const ensembleCache = new Map<number, ReturnType<typeof shape> | null>();
    const frameCache = new Map<string, number[] | null>();
    const normCache = new WeakMap<number[], number>();
    const frameNorm = (values: number[]) => {
      let norm = normCache.get(values);
      if (norm === undefined) {
        norm = Math.hypot(...values);
        normCache.set(values, norm);
      }
      return norm;
    };
    const alignment = Math.round(0.03 * fs),
      alignmentStep = Math.max(1, Math.round(0.004 * fs));
    const alignmentOffsets = [0];
    for (let offset = -alignment; offset <= alignment; offset += alignmentStep)
      if (offset !== 0) alignmentOffsets.push(offset);
    const frameRadius =
      Math.round(0.08 * fs) + Math.max(1, Math.round(0.004 * fs));
    const frame = (at: number, left = frameRadius, right = frameRadius) => {
      const key = `${at}:${left}:${right}`;
      if (frameCache.has(key)) return frameCache.get(key)!;
      if (at < left || at + right >= n) {
        frameCache.set(key, null);
        return null;
      }
      const out: number[] = [];
      for (const lead of names) {
        const row = Array.from(
          smoothed.leads[lead].slice(at - left, at + right + 1),
        );
        const mean = row.reduce((sum, v) => sum + v, 0) / row.length;
        out.push(...row.map((v) => v - mean));
      }
      frameCache.set(key, out);
      return out;
    };
    // A complex can have several eligible slopes. Shared support belongs to
    // one group and contributes at most one aligned observation, never several
    // supposedly independent votes from the same physical deflection.
    let ensembleGroups: Set<number>[] = [];
    for (const peak of peaks) {
      const support = components.get(peak) ?? [peak];
      const shared = ensembleGroups.filter((group) =>
        support.some((p) => group.has(p)),
      );
      const merged = new Set([
        ...support,
        ...shared.flatMap((group) => [...group]),
      ]);
      ensembleGroups = ensembleGroups.filter(
        (group) => !shared.includes(group),
      );
      ensembleGroups.push(merged);
    }
    const ensembleShape = (at: number) => {
      if (ensembleCache.has(at)) return ensembleCache.get(at)!;
      const a = frame(at);
      if (!a) {
        ensembleCache.set(at, null);
        return null;
      }
      const normA = frameNorm(a);
      const matches: number[][] = [];
      for (const group of ensembleGroups) {
        if (group.has(at)) continue;
        let best: number[] | null = null,
          bestCorrelation = 0.98;
        for (const p of group) {
          if (Math.abs(p - at) <= 0.18 * fs) continue;
          for (const offset of alignmentOffsets) {
            const b = frame(p + offset);
            if (!b) continue;
            const normB = frameNorm(b);
            const correlation =
              normA > 0 && normB > 0 ? dot(a, b) / (normA * normB) : -1;
            if (correlation >= bestCorrelation) {
              bestCorrelation = correlation;
              best = b;
            }
          }
        }
        if (best) matches.push(best);
      }
      if (matches.length < 3) {
        ensembleCache.set(at, null);
        return null;
      }
      const frames = [a, ...matches],
        length = 2 * frameRadius + 1;
      const averaged = { ...smoothed.leads };
      names.forEach((lead, k) => {
        averaged[lead] = Float64Array.from(
          { length },
          (_, j) =>
            frames.reduce((sum, v) => sum + v[k * length + j], 0) /
            frames.length,
        );
      });
      const result = shape({ fs, leads: averaged }, frameRadius);
      ensembleCache.set(at, result);
      return result;
    };
    const refined: number[] = [];
    for (const i of peaks) {
      const p = refined.at(-1),
        d =
          p === undefined
            ? 9
            : (i - Math.min(...(components.get(p) ?? [p]))) / fs;
      if (p !== undefined && d >= 0.2 && d <= 0.4) {
        // Strict clean-shape evidence does not require T energy below QRS.
        const raw = shape(s, i);
        if (
          complexShapes(s, p).some(
            (prior) =>
              raw.rank < 0.00001 &&
              prior.rank > 0.005 &&
              raw.rough < 0.7 * prior.rough,
          )
        )
          continue;
        const f = shape(smoothed, i);
        if (
          complexShapes(smoothed, p).some(
            (g) =>
              f.rank < 0.003 &&
              g.rank > 0.01 &&
              f.rank < 0.1 * g.rank &&
              f.rough < 0.85 * g.rough,
          )
        )
          continue;
        // Compare the whole observed prior complex, not only its early slope.
        // The latter can resemble a T wave even when its later trajectory does not.
        const priorSupport = components.get(p) ?? [p];
        const left = frameRadius + p - Math.min(...priorSupport);
        const right = frameRadius + Math.max(...priorSupport) - p;
        const currentFrame = frame(i, left, right),
          priorFrame = frame(p, left, right);
        const sameContour =
          currentFrame &&
          priorFrame &&
          dot(currentFrame, priorFrame) /
            (frameNorm(currentFrame) * frameNorm(priorFrame)) >=
            0.9;
        const ef = sameContour ? null : ensembleShape(i);
        if (
          ef &&
          ef.rank < 0.003 &&
          !(components.get(i) ?? [i]).some((component) => {
            const candidate = ensembleShape(component);
            return candidate && candidate.rank > 0.01;
          }) &&
          (components.get(p) ?? [p]).some((component) => {
            const eg = ensembleShape(component);
            return eg && eg.rank > 0.01 && ef.rank < 0.1 * eg.rank;
          })
        ) {
          ensembleDisambiguated.add(p);
          continue;
        }
      }
      refined.push(i);
    }
    peaks = groupContinuousCandidates(
      s,
      rejectRepeatedTerminalWaves(smoothed, peaks, refined),
      (first, last) =>
        mergedComponents.set(first, [
          ...(mergedComponents.get(first) ?? [first]),
          last,
        ]),
    );
    // The same analysis-only denoising that disambiguated terminal waves can
    // establish continuous support obscured by noise in an individual beat.
    // It contributes boundaries only; rate fiducials remain observed maxima.
    const smoothGrouping = ensembleDisambiguated.size
      ? prepareContinuousGrouping(smoothed, true)
      : null;
    if (smoothGrouping)
      for (const marker of peaks) {
        const markerFrame = frame(marker);
        const repeatedSupport =
          markerFrame &&
          [...ensembleDisambiguated].filter((p) => {
            if (Math.abs(p - marker) <= 0.18 * fs) return false;
            const anchor = frame(p);
            return (
              anchor &&
              dot(markerFrame, anchor) /
                (frameNorm(markerFrame) * frameNorm(anchor)) >=
                0.98
            );
          }).length >= 3;
        if (
          (!ensembleDisambiguated.has(marker) && !repeatedSupport) ||
          mergedComponents.has(marker)
        )
          continue;
        const earlier = supportMaxima
          .filter(
            (p) =>
              marker - p > 0.08 * fs &&
              marker - p < 0.28 * fs &&
              energy[p] > Math.max(1.9, high * candidateFraction) &&
              !peaks.some((q) => q !== marker && q >= p && q < marker),
          )
          .sort((a, b) => energy[b] - energy[a]);
        const first = earlier.find(
          (p) => smoothGrouping([p, marker], undefined, 0.08).length === 1,
        );
        if (first !== undefined) mergedComponents.set(marker, [first, marker]);
      }
    // Raw slopes suppressed inside the 180 ms NMS interval can still support
    // delineation. This 80 ms contour query does not change event grouping,
    // whose original 180–280 ms limits and continuity safeguards stay intact.
    for (const marker of peaks) {
      if (mergedComponents.has(marker)) continue;
      const earlier = supportMaxima
        .filter(
          (p) =>
            marker - p > 0.08 * fs &&
            marker - p < 0.28 * fs &&
            energy[p] > Math.max(1.9, high * candidateFraction) &&
            !peaks.some((q) => q !== marker && q >= p && q < marker),
        )
        .sort((a, b) => energy[b] - energy[a]);
      const first = earlier.find(
        (p) =>
          groupContinuousCandidates(s, [p, marker], undefined, 0.08).length ===
          1,
      );
      if (first !== undefined) mergedComponents.set(marker, [first, marker]);
    }
  }
  // Evaluate exclusions on the immutable observed population. Apply them only
  // after the existing support and template stages have finished, so removing a
  // wave cannot change another candidate's classification context.
  if (waveformRejected.size)
    peaks = peaks.filter(
      (marker) =>
        !waveformRejected.has(marker) ||
        (mergedComponents.get(marker) ?? [marker]).some(
          (component) => bandwidth(component) >= 0.18,
        ),
    );
  const complexes: VentricularComplexObservation[] = peaks.map((marker) => ({
    marker,
    support: [...new Set(mergedComponents.get(marker) ?? [marker])].sort(
      (a, b) => a - b,
    ),
    recovered: recovered.has(marker),
    refractoryRestored: restoredByRefractorySelection.has(marker),
  }));
  return {
    complexes,
    peaks,
    boundaryCandidates,
    leads,
    energy,
    threshold,
    high,
    candidates,
    recovered,
    mergedComponents,
    restoredByRefractorySelection,
  };
}

// Shared with the confidence screen; exporting this feature changes no detections.
export { shape as candidateShape };
