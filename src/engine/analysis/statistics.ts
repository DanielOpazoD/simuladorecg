/** Small, deterministic statistics shared by analysis and model audit. */
export function quantile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lower = Math.floor(position);
  return (
    sorted[lower] +
    (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower)
  );
}
export const median = (values: readonly number[]) => quantile(values, 0.5);
export const mad = (values: readonly number[]) => {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};
export const spread = (values: readonly number[]) =>
  quantile(values, 0.9) - quantile(values, 0.1);
export const circularMedian = (values: readonly number[]) => {
  if (!values.length) return 0;
  const distance = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);
  let anchor = values[0],
    best = Infinity;
  for (const candidate of values) {
    const loss = values.reduce(
      (sum, value) => sum + distance(value, candidate),
      0,
    );
    if (loss < best) {
      anchor = candidate;
      best = loss;
    }
  }
  const center = median(
    values.map((v) => anchor + ((v - anchor + 540) % 360) - 180),
  );
  return ((center + 540) % 360) - 180;
};
export const unwrapAngles = (values: readonly number[]) => {
  const center = circularMedian(values);
  return values.map((v) => center + ((v - center + 540) % 360) - 180);
};
