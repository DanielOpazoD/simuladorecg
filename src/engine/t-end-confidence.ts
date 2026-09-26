import type { TEndAreaCandidate } from './t-end-area';

export const T_END_CONFIDENCE_POLICY = Object.freeze({
  version: 'agreement-strata-v1',
  highMaximumSpreadMs: 6,
  highMaximumAreaAmplitudeRatio: 3,
});
export type TEndReviewStratum = 'high-agreement' | 'review';
export interface TEndReviewConfidence {
  stratum: TEndReviewStratum; reason: string; spreadMs: number; areaAmplitudeRatio: number;
}
/** Retrospective development stratum only: not probability, clinical confidence, QT gate or validation. */
export function classifyTEndReviewCandidate(candidate: TEndAreaCandidate): TEndReviewConfidence {
  const amplitudes = candidate.leadEstimates.map(e => e.areaAmplitudeMv).filter(v => Number.isFinite(v) && v > 0);
  const ratio = amplitudes.length === candidate.leadEstimates.length && amplitudes.length > 0
    ? Math.max(...amplitudes) / Math.min(...amplitudes) : Number.POSITIVE_INFINITY;
  const high = candidate.spreadMs <= T_END_CONFIDENCE_POLICY.highMaximumSpreadMs + 1e-9 &&
    ratio <= T_END_CONFIDENCE_POLICY.highMaximumAreaAmplitudeRatio + 1e-9;
  return { stratum: high ? 'high-agreement' : 'review',
    reason: high ? 'Alta concordancia interna en desarrollo; sigue siendo revisión manual.'
      : 'Fuera del estrato retrospectivo de alta concordancia; revisar manualmente.',
    spreadMs: candidate.spreadMs, areaAmplitudeRatio: ratio };
}
