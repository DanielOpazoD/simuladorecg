import { attachMeasurementSupport } from './measurement-support';
import type { Measurement, Signal } from './types';
import { measure } from './measure';
import { detectVentricularCandidates } from './analysis/ventricular-candidates';

type Samples = Pick<Signal, 'fs' | 'leads'>;

/** Detection-sensitivity screen, NOT a probability or a second independent detector.
 * Engineering constants selected on the exposed PR19 stress set. Irregular RR,
 * diagnosis, generator events and delineation success are not inputs.
 */
export const HR_QUALITY_POLICY = Object.freeze({
  candidateFraction: 0.6,
  matchSeconds: 0.04,
  backgroundRatio: 0.1,
  unmatchedFraction: 0.075,
  minimumUnmatched: 2,
});

export function heartRateDetectionQuality(input: Samples, peaksSeconds: readonly number[]) {
  const { peaks: challenged, energy } = detectVentricularCandidates(input, {
    candidateFraction: HR_QUALITY_POLICY.candidateFraction,
  });
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const upper = quantile(0.98);
  const backgroundRatio = upper > 0 ? quantile(0.5) / upper : null;
  // Ordered one-to-one matching also notices replacements with unchanged counts.
  let i = 0, j = 0, matched = 0;
  while (i < peaksSeconds.length && j < challenged.length) {
    const delta = peaksSeconds[i] - challenged[j] / input.fs;
    if (Math.abs(delta) <= HR_QUALITY_POLICY.matchSeconds) { matched++; i++; j++; }
    else if (delta < 0) i++;
    else j++;
  }
  const largest = Math.max(peaksSeconds.length, challenged.length);
  const unmatched = largest - matched;
  const unmatchedFraction = largest ? unmatched / largest : 0;
  const requiresReview = backgroundRatio !== null &&
    backgroundRatio > HR_QUALITY_POLICY.backgroundRatio &&
    unmatched >= HR_QUALITY_POLICY.minimumUnmatched &&
    unmatchedFraction >= HR_QUALITY_POLICY.unmatchedFraction;
  return { requiresReview, backgroundRatio, unmatchedFraction, unmatched, matched,
    nominalCount: peaksSeconds.length, challengedCount: challenged.length, challengedPeaksSeconds: challenged.map(p=>p/input.fs) };
}

/** Public sample-only pipeline used by the worker, BEFORE model audit.
 * The frozen measure() primitive still supplies all candidates and numeric values.
 * HR has its own screen; interval summaries receive candidate-specific support.
 * Never correct a rate, remove candidate peaks, promote a status or use truth.
 */
export function analyzeSamples(input: Samples): Measurement {
  const measurement = measure(input);
  const quality = measurement.detectedPeaks.length >= 3 ? heartRateDetectionQuality(input, measurement.detectedPeaks) : null;
  const next:Measurement = measurement.hr !== null && measurement.evidence.hr.status === 'usable' && quality?.requiresReview ?
    { ...measurement, evidence: { ...measurement.evidence,
      hr: { ...measurement.evidence.hr, status: 'review',
        reason: 'Frecuencia sensible al umbral de detección y actividad de fondo elevada: pueden existir detecciones extra u omitidas. Verifica con calibres.' } } } : measurement;
  return attachMeasurementSupport(next, quality);
}
