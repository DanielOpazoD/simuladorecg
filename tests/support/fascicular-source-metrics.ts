/** Isolated synthetic source probe, not a clinical ECG classifier. */
export function sourcePolarity(samples: ArrayLike<number>, fs: number, startSeconds: number,
  endSeconds: number, relativeThreshold: number) {
  if (!Number.isFinite(fs) || fs <= 0 || !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) || endSeconds <= startSeconds ||
    relativeThreshold <= 0 || relativeThreshold >= 1 || !Number.isFinite(relativeThreshold))
    throw new Error('Invalid source-probe coordinates');
  const start = Math.ceil(startSeconds * fs), end = Math.floor(endSeconds * fs);
  if (start < 0 || end >= samples.length || end <= start) throw new Error('Missing source window');
  let maximum = -Infinity, minimum = Infinity, positive = start, negative = start;
  for (let i = start; i <= end; i++) {
    const value = samples[i]; if (!Number.isFinite(value)) throw new Error('Nonfinite source sample');
    if (value > maximum) { maximum = value; positive = i; }
    if (value < minimum) { minimum = value; negative = i; }
  }
  const amplitude = Math.max(Math.abs(maximum), Math.abs(minimum));
  let first = -1;
  for (let i = start; i <= end; i++) if (Math.abs(samples[i]) > amplitude * relativeThreshold) { first = i; break; }
  return {initialPolarity: first < 0 ? 0 : Math.sign(samples[first]),
    dominantPolarity: amplitude === 0 ? 0 : Math.abs(maximum) > Math.abs(minimum) ? 1 : -1,
    maximumMv: maximum, minimumMv: minimum,
    firstMs: first < 0 ? null : (first / fs - startSeconds) * 1000,
    positivePeakMs: amplitude === 0 ? null : (positive / fs - startSeconds) * 1000,
    negativePeakMs: amplitude === 0 ? null : (negative / fs - startSeconds) * 1000};
}
export function hasInitialAndDominantPolarity(result: ReturnType<typeof sourcePolarity>, pattern: 'qR'|'rS') {
  return result.initialPolarity === (pattern === 'qR' ? -1 : 1) &&
    result.dominantPolarity === (pattern === 'qR' ? 1 : -1);
}
