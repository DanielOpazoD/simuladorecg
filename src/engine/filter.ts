/** Causal IIR sections. Display labels describe nominal cutoffs, not certified response. */
export function highpass(x: Float64Array, fs: number, hz: number) {
  const a = Math.exp((-2 * Math.PI * hz) / fs);
  let y = 0,
    prev = x[0];
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    y = a * (y + v - prev);
    x[i] = y;
    prev = v;
  }
}
export function biquad(
  x: Float64Array,
  fs: number,
  hz: number,
  type: "lowpass" | "notch",
  q = 1 / Math.sqrt(2),
) {
  const w = (2 * Math.PI * hz) / fs,
    co = Math.cos(w),
    si = Math.sin(w),
    al = si / (2 * q),
    a0 = 1 + al;
  let b0, b1, b2;
  if (type === "notch") {
    b0 = 1 / a0;
    b1 = (-2 * co) / a0;
    b2 = 1 / a0;
  } else {
    b0 = (1 - co) / 2 / a0;
    b1 = (1 - co) / a0;
    b2 = b0;
  }
  const a1 = (-2 * co) / a0,
    a2 = (1 - al) / a0;
  let z1 = 0,
    z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + z1;
    z1 = b1 * x[i] - a1 * y + z2;
    z2 = b2 * x[i] - a2 * y;
    x[i] = y;
  }
}

/** Symmetric 81-tap Blackman FIR. Passband through 150 Hz, cutoff 170 Hz;
 * stopband at the 500 Hz output Nyquist. Centered convolution removes delay.
 * The caller supplies real signal guard samples on both sides, not reflections.
 */
export function antialias(x: Float64Array, fs: number): Float64Array {
  const half = 40,
    fc = 170 / fs,
    kernel = new Float64Array(half * 2 + 1);
  let total = 0;
  for (let k = -half; k <= half; k++) {
    const window =
      0.42 +
      0.5 * Math.cos((Math.PI * k) / half) +
      0.08 * Math.cos((2 * Math.PI * k) / half);
    kernel[k + half] =
      (k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k)) *
      window;
    total += kernel[k + half];
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const output = new Float64Array(x.length);
  for (let i = half; i < x.length - half; i++) {
    let value = x[i] * kernel[half];
    for (let j = 1; j <= half; j++)
      value += (x[i - j] + x[i + j]) * kernel[half + j];
    output[i] = value;
  }
  return output;
}

/** Bidirectional Butterworth section, initialized at its DC steady state. */
function butterworthSection(x: Float64Array, fs: number, hz: number, high: boolean) {
  const w = 2 * Math.PI * hz / fs, co = Math.cos(w), al = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + al, b0 = (high ? 1 + co : 1 - co) / (2 * a0);
  const b1 = (high ? -(1 + co) : 1 - co) / a0, b2 = b0;
  const a1 = -2 * co / a0, a2 = (1 - al) / a0;
  const first = x[0], steady = high ? 0 : first;
  let z1 = steady - b0 * first, z2 = b2 * first - a2 * steady;
  for (let i = 0; i < x.length; i++) {
    const sample = x[i], y = b0 * sample + z1;
    z1 = b1 * sample - a1 * y + z2;
    z2 = b2 * sample - a2 * y;
    x[i] = y;
  }
}

/** Offline/replayed-buffer 0.5–40 Hz bandpass; NOT a causal bedside monitor.
 * Forward/reverse filtering removes phase delay, not all amplitude distortion.
 * Odd reflection uses <=4 s at either edge; synthesis also supplies real guards.
 * Cutoffs compensate the squared Butterworth response using bilinear prewarping.
 * No events, clean reference, diagnosis or per-lead normalization are inputs.
 */
export function monitorZeroPhase(x: Float64Array, fs: number): void {
  if (!Number.isFinite(fs) || fs < 100) throw new Error('Monitor requires fs >= 100 Hz');
  if (x.length < 3) throw new Error('Monitor requires at least three samples');
  for (const v of x) if (!Number.isFinite(v)) throw new Error('Nonfinite filter input');
  const pad = Math.min(x.length - 1, Math.ceil(4 * fs));
  const a = new Float64Array(x.length + 2 * pad);
  a.set(x, pad);
  for (let j = 0; j < pad; j++) {
    a[pad - 1 - j] = 2 * x[0] - x[j + 1];
    a[pad + x.length + j] = 2 * x[x.length - 1] - x[x.length - 2 - j];
  }
  const compensation = (Math.SQRT2 - 1) ** 0.25;
  const hp = fs / Math.PI * Math.atan(Math.tan(Math.PI * 0.5 / fs) * compensation);
  const lp = fs / Math.PI * Math.atan(Math.tan(Math.PI * 40 / fs) / compensation);
  for (let pass = 0; pass < 2; pass++) {
    butterworthSection(a, fs, hp, true);
    butterworthSection(a, fs, lp, false);
    a.reverse();
  }
  x.set(a.subarray(pad, pad + x.length));
}

export type AcquisitionFilter = 'off' | 'diagnostic' | 'monitor' | 'aggressive';
/** Shared acquisition operator. Legacy off/diagnostic/aggressive are bit-preserved. */
export function applyAcquisitionFilter(x: Float64Array, fs: number, mode: AcquisitionFilter): void {
  if (mode === 'monitor') { monitorZeroPhase(x, fs); return; }
  if (mode === 'diagnostic') highpass(x, fs, 0.05);
  else if (mode === 'aggressive') { highpass(x, fs, 2); biquad(x, fs, 40, 'lowpass'); }
  else if (mode !== 'off') throw new Error('Unknown acquisition filter');
}
