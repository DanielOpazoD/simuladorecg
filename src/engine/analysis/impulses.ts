import type { Signal } from "../types";
import { median } from "./statistics";
/** Neutralize only detected brief impulses and their ringing on an analysis copy.
 * Visible/exported samples are never modified. This does not reconstruct hidden activation. */
export function suppressImpulses(s: Pick<Signal, "fs" | "leads">): {
  signal: Pick<Signal, "fs" | "leads">;
  masks: { start: number; end: number }[];
} {
  const fs = s.fs,
    n = Math.min(s.leads.I.length, Math.round(10 * fs)),
    names = ["I", "II", "V1", "V5"] as const;
  const short = new Float64Array(n),
    long = new Float64Array(n),
    h = Math.max(1, Math.round(0.002 * fs)),
    k = Math.max(1, Math.round(0.008 * fs));
  for (let i = k; i < n - k; i++) {
    short[i] = Math.hypot(
      ...names.map(
        (l) => ((s.leads[l][i + h] - s.leads[l][i - h]) * fs) / (2 * h),
      ),
    );
    long[i] = Math.hypot(
      ...names.map(
        (l) => ((s.leads[l][i + k] - s.leads[l][i - k]) * fs) / (2 * k),
      ),
    );
  }
  const globalShort = Math.max(...short),
    globalLong = Math.max(...long);
  if (globalShort <= 3.5 * globalLong) return { signal: s, masks: [] };
  const outliers: number[] = [],
    radius = Math.round(0.02 * fs);
  for (let i = radius; i < n - radius; i++) {
    if (short[i] < short[i - 1] || short[i] <= short[i + 1]) continue;
    let broad = 0;
    for (let j = i - radius; j <= i + radius; j++)
      broad = Math.max(broad, long[j]);
    if (short[i] < Math.max(2, globalShort * 0.25, 3.5 * broad)) continue;
    const prev = outliers.at(-1);
    if (prev === undefined || i - prev > 0.06 * fs) outliers.push(i);
    else if (short[i] > short[prev]) outliers[outliers.length - 1] = i;
  }
  if (!outliers.length) return { signal: s, masks: [] };
  const leads = { ...s.leads };
  for (const l of names) leads[l] = s.leads[l].slice();
  const masks: { start: number; end: number }[] = [];
  for (const index of outliers) {
    const base = names.map((l) =>
      median(
        Array.from(
          s.leads[l].slice(
            Math.max(0, index - Math.round(0.05 * fs)),
            Math.max(1, index - Math.round(0.035 * fs)),
          ),
        ),
      ),
    );
    const magnitude = (j: number) =>
      Math.hypot(...names.map((l, k) => s.leads[l][j] - base[k]));
    let center = index;
    for (
      let j = Math.max(0, index - Math.round(0.008 * fs));
      j < Math.min(n, index + Math.round(0.008 * fs));
      j++
    )
      if (magnitude(j) > magnitude(center)) center = j;
    const start = Math.max(0, center - Math.round(0.034 * fs)),
      end = Math.min(n - 1, center + Math.round(0.008 * fs));
    masks.push({ start: start / fs, end: end / fs });
    for (let l = 0; l < names.length; l++)
      for (let j = start; j <= end; j++) leads[names[l]][j] = base[l];
  }
  return { signal: { fs, leads }, masks };
}
