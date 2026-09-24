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
