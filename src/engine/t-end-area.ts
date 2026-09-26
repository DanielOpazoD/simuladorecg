import type { Lead, Measurement, Signal } from './types';

/** An engineering review aid, never an automatic QT or a calibrated probability. */
export const T_END_AREA_POLICY = Object.freeze({
  version: 'area-agreement-v1',
  windowsSeconds: [0.096, 0.128] as const,
  smoothingHalfSeconds: 0.004,
  afterPeakSeconds: 0.024,
  beforeNextQrsSeconds: 0.12,
  maximumSearchSeconds: 0.36,
  rrSearchFraction: 0.4,
  minimumSearchSeconds: 0.064,
  maximumNoiseMv: 0.01,
  minimumAreaAmplitudeMv: 0.012,
  noiseMultiplier: 8,
  windowAgreementSeconds: 0.024,
  leadAgreementSeconds: 0.024,
  maximumLeadDisagreementSeconds: 0.08,
  minimumLeads: 3,
  tieEpsilonMv: 1e-9,
});
const LEADS = ['I', 'II', 'V1', 'V5'] as const;
export interface TEndAreaCandidate {
  peak: number;
  time: number;
  method: typeof T_END_AREA_POLICY.version;
  searchWindow: { start: number; end: number };
  supportingLeads: readonly Lead[];
  spreadMs: number;
  leadEstimates: {
    lead: Lead; time: number; windowDifferenceMs: number; areaAmplitudeMv: number;
  }[];
}

/** Uses only physical samples and the existing sample-derived beat locations.
 * A[k] = mean(x[k-w+1..k]) - mean(x[k-p..k+p]). Absolute A handles polarity.
 * Constant offsets cancel. Linear drift is NOT guaranteed to cancel after abs().
 * Agreement at two window widths and >=3 leads is stability, not independent truth.
 * No data labels, diagnosis, synthesis events, QT/QTc or quality states are inputs.
 * Returns one optional suggestion per beat; never mutates either argument.
 */
export function suggestTEnds(
  input: Pick<Signal, 'fs' | 'leads'>,
  measurement: Pick<Measurement, 'beats' | 'detectedPeaks' | 'window'>,
): (TEndAreaCandidate | null)[] {
  const empty = () => measurement.beats.map(() => null);
  const fs = input.fs, p = T_END_AREA_POLICY;
  if (!Number.isFinite(fs) || fs < 100 || fs > 4000 ||
      !Number.isFinite(measurement.window.end) || measurement.window.end <= 0) return empty();
  const n = Math.min(Math.floor(measurement.window.end * fs), Math.round(10 * fs));
  const half = Math.max(1, Math.round(p.smoothingHalfSeconds * fs));
  if (n < fs || LEADS.some(l => !input.leads[l] || input.leads[l].length < n)) return empty();
  const prefix = new Map<Lead, Float64Array>();
  for (const lead of LEADS) {
    const sums = new Float64Array(n + 1), raw = input.leads[lead];
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(raw[i])) return empty();
      sums[i + 1] = sums[i] + raw[i];
    }
    prefix.set(lead, sums);
  }
  const byPeak = new Map(measurement.beats.map(b => [b.peak, b]));
  return measurement.beats.map(b => {
    if (b.tPeak === null || !Number.isFinite(b.tPeak) || !Number.isFinite(b.rr) || b.rr <= 0 ||
        !Number.isFinite(b.offset) || !Number.isFinite(b.noise) || b.noise < 0 || b.noise > p.maximumNoiseMv) return null;
    const at = measurement.detectedPeaks.indexOf(b.peak);
    const next = at >= 0 ? byPeak.get(measurement.detectedPeaks[at + 1]) : undefined;
    if (!next || !Number.isFinite(next.onset)) return null;
    const tp = Math.round(b.tPeak * fs);
    // The longest integration window must start after QRS, not include its energy.
    const lo = Math.max(tp + Math.round(p.afterPeakSeconds * fs),
      Math.ceil((b.offset + p.windowsSeconds[1]) * fs));
    const hi = Math.min(Math.round((next.onset - p.beforeNextQrsSeconds) * fs),
      tp + Math.round(Math.min(p.maximumSearchSeconds, p.rrSearchFraction * b.rr) * fs));
    if (lo < Math.round(p.windowsSeconds[1] * fs) || hi + half >= n ||
        hi - lo < Math.round(p.minimumSearchSeconds * fs)) return null;
    const estimates: TEndAreaCandidate['leadEstimates'] = [];
    for (const lead of LEADS) {
      const sums = prefix.get(lead)!;
      const smooth = (i: number) => (sums[i + half + 1] - sums[i - half]) / (2 * half + 1);
      const windows: { time: number; score: number }[] = [];
      for (const seconds of p.windowsSeconds) {
        const w = Math.round(seconds * fs);
        const scores: number[] = [];
        for (let i = lo; i < hi; i++)
          scores.push(Math.abs((sums[i + 1] - sums[i - w + 1]) / w - smooth(i)));
        const maximum = Math.max(...scores);
        // Latest numerical tie prevents DC offsets/roundoff choosing arbitrary points on a plateau.
        let index = scores.length - 1;
        while (index >= 0 && scores[index] < maximum - p.tieEpsilonMv) index--;
        const location = lo + index;
        if (location < lo + half || location > hi - half ||
            maximum < Math.max(p.minimumAreaAmplitudeMv, p.noiseMultiplier * b.noise)) continue;
        windows.push({ time: location / fs, score: maximum });
      }
      if (windows.length !== 2 || Math.abs(windows[0].time - windows[1].time) > p.windowAgreementSeconds) continue;
      estimates.push({ lead, time: windows[1].time,
        windowDifferenceMs: (windows[0].time - windows[1].time) * 1000, areaAmplitudeMv: windows[1].score });
    }
    estimates.sort((a, b) => a.time - b.time);
    let cluster: typeof estimates = [];
    for (const candidate of estimates) {
      const group = estimates.filter(e => e.time >= candidate.time && e.time - candidate.time <= p.leadAgreementSeconds);
      if (group.length > cluster.length) cluster = group;
    }
    if (cluster.length < p.minimumLeads ||
        estimates.at(-1)!.time - estimates[0].time > p.maximumLeadDisagreementSeconds) return null;
    return { peak: b.tPeak, time: Math.max(...cluster.map(e => e.time)), method: p.version,
      searchWindow: { start: lo / fs, end: hi / fs }, supportingLeads: cluster.map(e => e.lead),
      spreadMs: (cluster.at(-1)!.time - cluster[0].time) * 1000, leadEstimates: estimates };
  });
}
