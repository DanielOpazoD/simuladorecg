/** Sample-domain T delineation primitives. No model clocks or diagnostic labels.
 * Filter-bank and peak-prominence approaches follow the independently benchmarked
 * NeuroKit2 0.2.13 algorithms (MIT, Dominique Makowski and contributors).
 * This adaptation does not inherit that library's reported validation claims.
 */
export interface TerminalPoint {
  peak: number;
  end: number;
  requiresUnambiguousTail?: boolean;
}
type Samples = ArrayLike<number>;
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y),
    n = a.length;
  return n ? (a[(n - 1) >> 1] + a[n >> 1]) / 2 : 0;
};
function reflect(x: Samples, pad: number): Float64Array {
  const n = x.length,
    out = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) {
    out[i] = 2 * x[0] - x[pad - i];
    out[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i];
  }
  for (let i = 0; i < n; i++) out[pad + i] = x[i];
  return out;
}
function reverse(x: Float64Array) {
  return Float64Array.from(x).reverse();
}
type Section = { b0: number; b1: number; b2: number; a1: number; a2: number };
function cascade(raw: Float64Array, sections: Section[]): Float64Array {
  let x = raw;
  for (const s of sections) {
    const y = new Float64Array(x.length);
    let z1 = -s.b0 * x[0],
      z2 = s.b2 * x[0];
    for (let i = 0; i < x.length; i++) {
      const out = s.b0 * x[i] + z1;
      z1 = s.b1 * x[i] - s.a1 * out + z2;
      z2 = s.b2 * x[i] - s.a2 * out;
      y[i] = out;
    }
    x = y;
  }
  return x;
}
/** Zero-phase fifth-order 0.5 Hz high-pass, followed by 50 Hz-period smoothing.
 * Works on a private analysis copy; never changes the displayed/acquired samples. */
export function terminalAnalysisCopy(raw: Samples, fs: number): Float64Array {
  const k = Math.tan((Math.PI * 0.5) / fs),
    gain = 1 / (1 + k);
  const sections: Section[] = [
    { b0: gain, b1: -gain, b2: 0, a1: (k - 1) / (k + 1), a2: 0 },
  ];
  for (const q of [
    1 / (2 * Math.sin((3 * Math.PI) / 10)),
    1 / (2 * Math.sin(Math.PI / 10)),
  ]) {
    const b0 = 1 / (1 + k / q + k * k);
    sections.push({
      b0,
      b1: -2 * b0,
      b2: b0,
      a1: 2 * (k * k - 1) * b0,
      a2: (1 - k / q + k * k) * b0,
    });
  }
  const hpPad = Math.min(18, raw.length - 1),
    padded = reflect(raw, hpPad);
  let x: Float64Array = reverse(
    cascade(reverse(cascade(padded, sections)), sections),
  ).slice(hpPad, hpPad + raw.length);
  const width = Math.max(2, Math.floor(fs / 50)),
    pad = Math.min(3 * width, x.length - 1);
  const smooth = (a: Float64Array) => {
    const ring = new Float64Array(width).fill(a[0]),
      out = new Float64Array(a.length);
    let sum = width * a[0];
    for (let i = 0; i < a.length; i++) {
      const j = i % width;
      sum += a[i] - ring[j];
      ring[j] = a[i];
      out[i] = sum / width;
    }
    return out;
  };
  x = reflect(x, pad);
  return reverse(smooth(reverse(smooth(x)))).slice(pad, pad + raw.length);
}
function extrema(x: Samples, sign = 1): number[] {
  const out: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (sign * x[i] <= sign * x[i - 1]) continue;
    let j = i;
    while (j + 1 < x.length && x[j + 1] === x[i]) j++;
    if (j < x.length - 1 && sign * x[j] > sign * x[j + 1])
      out.push(Math.floor((i + j) / 2));
    i = j;
  }
  return out;
}
function prominence(x: Samples, at: number, sign: number, radius = Infinity) {
  const height = sign * x[at],
    lo = Math.max(0, at - radius),
    hi = Math.min(x.length - 1, at + radius);
  let left = at,
    right = at,
    lv = height,
    rv = height;
  for (let i = at; i >= lo && sign * x[i] <= height; i--)
    if (sign * x[i] < lv) {
      lv = sign * x[i];
      left = i;
    }
  for (let i = at; i <= hi && sign * x[i] <= height; i++)
    if (sign * x[i] < rv) {
      rv = sign * x[i];
      right = i;
    }
  return { value: height - Math.max(lv, rv), left, right };
}
function argmax(x: Samples, lo: number, hi: number) {
  let best = lo;
  for (let i = lo + 1; i < Math.min(hi, x.length); i++)
    if (x[i] > x[best]) best = i;
  return best;
}
/** Signed prominence handles positive and inverted T without a diagnosis input. */
export function prominenceTerminals(
  x: Float64Array,
  rpeaks: number[],
  fs: number,
): (TerminalPoint | null)[] {
  if (rpeaks.length < 2) return rpeaks.map(() => null);
  const rr = rpeaks.slice(1).map((p, i) => p - rpeaks[i]);
  rr.unshift(Math.min(rr[0], 2 * rpeaks[0]));
  rr.splice(rr.length - 1, 0, Math.min(rr.at(-1)!, 2 * rpeaks.at(-1)!));
  return rpeaks.map((r, index) => {
    const pos = Math.min(r, Math.floor(rr[index] / 2)),
      left = r - pos,
      right = Math.min(x.length, r + Math.floor(rr[index + 1] / 2)),
      s = x.slice(left, right);
    if (pos <= 0 || pos >= s.length - 1) return null;
    const maxima = extrema(s),
      minima = extrema(s, -1),
      positive = new Float64Array(s.length),
      negative = new Float64Array(s.length);
    for (const i of maxima) positive[i] = prominence(s, i, 1).value;
    for (const i of minima) negative[i] = prominence(s, i, -1).value;
    positive[pos] = 0;
    negative[pos] = 0;
    const q = argmax(negative, Math.max(0, pos - Math.floor(0.12 * fs)), pos),
      sBound = Math.min(s.length, q + Math.floor(0.18 * fs));
    if (sBound <= pos) return null;
    let sp = pos;
    for (let i = pos; i < sBound; i++)
      if (negative[i] > 0) {
        sp = i;
        break;
      }
    if (sp === pos)
      for (let i = pos + 1; i < sBound; i++) if (s[i] < s[sp]) sp = i;
    const candidates = [...maxima, ...minima].filter(
      (i) => i >= sp + Math.floor(0.15 * fs),
    );
    if (!candidates.length) return null;
    let tp = candidates[0];
    for (const i of candidates)
      if (positive[i] + negative[i] > positive[tp] + negative[tp]) tp = i;
    const sign = minima.includes(tp) ? -1 : 1,
      base = prominence(s, tp, sign, Math.floor(Math.floor(0.2 * fs) / 2));
    return base.right > tp
      ? { peak: (left + tp) / fs, end: (left + base.right) / fs }
      : null;
  });
}
function resampleLinear(x: Float64Array, length: number) {
  const out = new Float64Array(length),
    scale = (x.length - 1) / (length - 1);
  for (let i = 0; i < length; i++) {
    const at = i * scale,
      j = Math.floor(at),
      f = at - j;
    out[i] = x[j] * (1 - f) + x[Math.min(j + 1, x.length - 1)] * f;
  }
  return out;
}
function multiscale(x: Float64Array, count: number) {
  const scales: Float64Array[] = [];
  let current = x;
  for (let degree = 0; degree < count; degree++) {
    const step = 2 ** degree,
      n = current.length,
      filtered = new Float64Array(n + 3 * step),
      wave = new Float64Array(n + step),
      at = (i: number) => (i >= 0 && i < n ? current[i] : 0);
    for (let i = 0; i < wave.length; i++) wave[i] = 2 * (at(i + step) - at(i));
    for (let i = 0; i < filtered.length; i++)
      filtered[i] =
        (at(i + step) + 3 * at(i) + 3 * at(i - step) + at(i - 2 * step)) / 8;
    scales.push(wave.slice(0, x.length));
    current = filtered;
  }
  return scales;
}
function waveletWorkspace(input: Float64Array, fs: number) {
  const x = resampleLinear(input, Math.round((input.length * 2000) / fs));
  return { x, scales: multiscale(x, 9) };
}
/** Stationary spline wavelet peak and terminal-slope estimates. */
export function waveletTerminals(
  input: Float64Array,
  rpeaks: number[],
  fs: number,
  offsets?: readonly (number | null)[],
): (TerminalPoint | null)[] {
  return signedWaveletTerminals(
    waveletWorkspace(input, fs),
    rpeaks,
    fs,
    offsets,
    1,
  );
}
function signedWaveletTerminals(
  workspace: ReturnType<typeof waveletWorkspace>,
  rpeaks: number[],
  fs: number,
  offsets: readonly (number | null)[] | undefined,
  polarity: 1 | -1,
): (TerminalPoint | null)[] {
  if (rpeaks.length < 2) return rpeaks.map(() => null);
  const afs = 2000,
    { x, scales } = workspace,
    rp = rpeaks.map((p) => Math.floor((p * afs) / fs));
  const periods = rp.slice(1).map((p, i) => (p - rp[i]) / afs);
  periods.unshift(periods.reduce((a, b) => a + b, 0) / periods.length);
  const rate = median(periods.map((p) => 60 / p));
  if (!Number.isFinite(rate) || rate <= 0) return rp.map(() => null);
  const extra = Math.trunc(Math.log2(afs / 250 / (rate / 60))),
    peakScale = 3 + extra,
    endScale = 2 + extra;
  if (peakScale < 0 || peakScale >= 9 || endScale < 0 || endScale >= 9)
    return rp.map(() => null);
  const rt = Math.round(((0.25 * 60) / rate) * 1000) / 1000,
    duration = Math.round(((0.3 * 60) / rate) * 1000) / 1000,
    bound = Math.floor(0.065 * afs);
  return rp.map((r, index) => {
    const start = Math.max(
        r + bound,
        offsets?.[index] != null
          ? Math.ceil((offsets[index]! + 0.02) * afs)
          : 0,
      ),
      end = Math.min(x.length, r + 2 * Math.floor(rt * afs));
    if (end <= start) return null;
    const w = Float64Array.from(
        scales[peakScale].subarray(start, end),
        (v) => polarity * v,
      ),
      ecg = x.slice(start, end),
      absolute = Float64Array.from(w, Math.abs),
      height =
        0.25 * Math.sqrt(w.reduce((sum, v) => sum + v * v, 0) / w.length),
      mx = Math.max(...w);
    const peaks = extrema(absolute).filter(
      (p) => absolute[p] >= height && absolute[p] > 0.025 * mx,
    );
    if (w[0] > 0) peaks.unshift(0);
    let tp = -1,
      score = -Infinity;
    for (let i = 0; i < peaks.length - 1; i++) {
      const a = peaks[i],
        b = peaks[i + 1];
      if (w[a] <= 0 || w[b] >= 0) continue;
      let z = a;
      while (z < b - 1 && Math.sign(w[z]) === Math.sign(w[z + 1])) z++;
      const value = polarity * ecg[z] - (z / afs - (rt - 0.065));
      if (value > score) {
        score = value;
        tp = start + z;
      }
    }
    if (tp < 0) return null;
    const hi = Math.min(x.length, tp + Math.floor(duration * afs)),
      local = scales[endScale].slice(tp, hi),
      down = Float64Array.from(local, (v) => -polarity * v),
      slopePeaks = extrema(down);
    if (!slopePeaks.length) return null;
    const first = slopePeaks[0],
      threshold = 0.4 * down[first];
    for (let j = first; j < down.length; j++)
      if (down[j] < threshold)
        return {
          peak: Math.floor((tp * fs) / afs) / fs,
          end: Math.floor(((tp + j) * fs) / afs) / fs,
        };
    return null;
  });
}

export interface TerminalConsensus extends TerminalPoint {
  leads: {
    lead: string;
    waveletEnd: number;
    prominenceEnd: number;
    end: number;
  }[];
}
/** One terminal result supported by distinct sample-domain methods.
 * Baseline return requires three leads (two when other projections are exactly flat);
 * a tangent needs four agreeing leads. Prominence/wavelet agreement needs three.
 * Agreement is an engineering consistency condition, not clinical validation. */
export function terminalConsensus(
  input: { fs: number; leads: Record<string, Samples> },
  rpeaks: number[],
  offsets: readonly (number | null)[],
  direct: readonly (readonly TerminalPoint[])[] = [],
): (TerminalConsensus | null)[] {
  const fs = input.fs,
    n = Math.min(input.leads.I.length, Math.round(10 * fs));
  if (
    !Number.isFinite(fs) ||
    fs < 100 ||
    fs > 4000 ||
    n < fs ||
    rpeaks.length < 3
  )
    return rpeaks.map(() => null);
  const names = ["I", "II", "V1", "V5"],
    clean: Record<string, Float64Array> = {},
    methods: Record<
      string,
      {
        wave: (TerminalPoint | null)[];
        inverse: (TerminalPoint | null)[];
        prom: (TerminalPoint | null)[];
      }
    > = {};
  for (const lead of names) {
    const x = Float64Array.from({ length: n }, (_, i) => input.leads[lead][i]);
    if (x.some((v) => !Number.isFinite(v))) return rpeaks.map(() => null);
    clean[lead] = terminalAnalysisCopy(x, fs);
    const workspace = waveletWorkspace(clean[lead], fs);
    methods[lead] = {
      wave: signedWaveletTerminals(workspace, rpeaks, fs, offsets, 1),
      inverse: signedWaveletTerminals(workspace, rpeaks, fs, offsets, -1),
      prom: prominenceTerminals(clean[lead], rpeaks, fs),
    };
  }
  return rpeaks.map((_r, i) => {
    if (offsets[i] === null || offsets[i] === undefined) return null;
    for (const candidate of direct[i] ?? []) {
      const corroborated = names.filter(
        (lead) =>
          (!candidate.requiresUnambiguousTail ||
            ![methods[lead].wave[i], methods[lead].inverse[i]].some(
              (v) => v && v.peak > candidate.end + 0.02,
            )) &&
          [methods[lead].wave[i], methods[lead].inverse[i]].some(
            (v) =>
              v &&
              Math.abs(v.peak - candidate.peak) <= 0.04 &&
              Math.abs(v.end - candidate.end) <=
                (candidate.requiresUnambiguousTail ? 0.02 : 0.04),
          ),
      );
      // Exact lack of a T projection is absence of information, not a vote
      // against the boundary. Two observable leads can corroborate a directly
      // observed return when the remaining channels are exactly constant here.
      const flat = names.filter((lead) => {
        const raw = input.leads[lead],
          lo = Math.ceil((offsets[i]! + 0.02) * fs),
          hi = Math.min(n, Math.ceil((candidate.end + 0.04) * fs));
        if (hi <= lo) return false;
        for (let j = lo + 1; j < hi; j++) if (raw[j] !== raw[lo]) return false;
        return true;
      });
      const accepted = candidate.requiresUnambiguousTail
        ? corroborated.length === 4
        : corroborated.length >= 3 ||
          (corroborated.length >= 2 &&
            new Set([...corroborated, ...flat]).size >= 3);
      if (accepted) {
        const waveletEnds = corroborated.map(
          (lead) =>
            [methods[lead].wave[i], methods[lead].inverse[i]].find(
              (v) =>
                v &&
                Math.abs(v.peak - candidate.peak) <= 0.04 &&
                Math.abs(v.end - candidate.end) <=
                  (candidate.requiresUnambiguousTail ? 0.02 : 0.04),
            )!.end,
        );
        return {
          ...candidate,
          end: candidate.requiresUnambiguousTail
            ? (candidate.end + median(waveletEnds)) / 2
            : candidate.end,
          leads: [],
        };
      }
    }
    const leads: TerminalConsensus["leads"] = [],
      peaks: number[] = [];
    for (const lead of names) {
      const b = methods[lead].prom[i];
      if (!b) continue;
      const options = [methods[lead].wave[i], methods[lead].inverse[i]].filter(
        (v): v is TerminalPoint => v !== null && v.peak > offsets[i]!,
      );
      const a = options.sort(
        (x, y) => Math.abs(x.peak - b.peak) - Math.abs(y.peak - b.peak),
      )[0];
      if (
        !a ||
        Math.abs(a.peak - b.peak) > 0.04 + 1e-9 ||
        Math.abs(a.end - b.end) > 0.04 + 1e-9
      )
        continue;
      if (options.some((v) => v.peak > a.end + 0.02)) continue;
      const end = (a.end + b.end) / 2,
        peak = b.peak;
      if (
        end <= peak ||
        peak <= offsets[i]! ||
        end >= (rpeaks[i + 1] ?? n) / fs
      )
        continue;
      leads.push({ lead, waveletEnd: a.end, prominenceEnd: b.end, end });
      peaks.push(peak);
    }
    if (leads.length < 3) return null;
    const peak = median(peaks),
      end = Math.max(...leads.map((x) => x.end)),
      index = Math.round(peak * fs);
    if (end <= peak || index < 0 || index >= n) return null;
    return { peak, end, leads };
  });
}
