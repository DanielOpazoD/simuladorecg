/**
 * Band-limited stationary sources with a learned peak spectrum (atrial and
 * ventricular fibrillation): an FIR at a low model rate shaped by the parametric
 * spectrum, white sources generated sequentially (a longer buffer never changes
 * an earlier sample) and Catmull–Rom interpolation to the output rate.
 */
import { normal } from "../random";

export const TAPS = 257;

export interface PeakSpectrum { peak: number; F: number; width: number; harmonic: number }

/** Unit-energy linear-phase FIR (Hann window) whose amplitude response is the
 * square root of the peak spectrum (log10: peak·[g(F, w) + harmonic·g(2F, 1.5w)]),
 * over a small floor, with 0.5 Hz raised-cosine edges around [lo, hi]. */
export function peakSpectrumFir(sp: PeakSpectrum, lo: number, hi: number, fs: number): { fir: Float64Array; dominantHz: number } {
  const g = (f: number, c: number, w: number) => Math.exp(-0.5 * ((f - c) / w) ** 2);
  const amplitude = (f: number) => {
    const psd = 10 ** (sp.peak * (g(f, sp.F, sp.width) + sp.harmonic * g(f, 2 * sp.F, 1.5 * sp.width))) - 1 + 0.02;
    const edge = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));
    return Math.sqrt(psd) * edge((f - (lo - 0.5)) / 0.5) * edge((hi + 0.5 - f) / 0.5);
  };
  let best = 0, dominantHz = lo;
  for (let f = lo; f <= hi; f += 0.05) if (amplitude(f) > best) { best = amplitude(f); dominantHz = f; }
  const fir = new Float64Array(TAPS), half = (TAPS - 1) / 2, df = 0.05;
  for (let k = 0; k < TAPS; k++) {
    let s = 0;
    for (let f = lo - 0.5; f <= hi + 0.5; f += df) s += amplitude(f) * Math.cos((2 * Math.PI * f * (k - half)) / fs);
    fir[k] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (TAPS - 1)));
  }
  const energy = Math.sqrt(fir.reduce((a, v) => a + v * v, 0));
  for (let k = 0; k < TAPS; k++) fir[k] /= energy;
  return { fir, dominantHz };
}

/** `count` unit-variance sources of `length` samples filtered by `fir`, drawn
 * interleaved from `rng` after a warm-up of TAPS samples. */
export function filteredSources(rng: () => number, count: number, length: number, fir: Float64Array): Float64Array[] {
  const warm = TAPS, src = Array.from({ length: count }, () => new Float64Array(length));
  const white = Array.from({ length: count }, () => new Float64Array(warm + length));
  for (let i = 0; i < warm + length; i++) for (let s = 0; s < count; s++) white[s][i] = normal(rng);
  for (let s = 0; s < count; s++)
    for (let i = 0; i < length; i++) {
      let v = 0;
      for (let k = 0; k < TAPS; k++) v += fir[k] * white[s][warm + i - k];
      src[s][i] = v;
    }
  return src;
}

/** Catmull–Rom value at output sample i of a sequence sampled `ratio` times slower. */
export function upsampled(x: Float64Array, i: number, ratio: number): number {
  const t = i / ratio, j = Math.floor(t), f = t - j;
  const p0 = x[Math.max(0, j - 1)], p1 = x[j], p2 = x[j + 1], p3 = x[j + 2];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}
