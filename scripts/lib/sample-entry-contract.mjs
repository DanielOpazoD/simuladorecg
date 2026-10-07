import {assertReviewedQrsTFile} from './qrs-t-revision.mjs';
import {assertReviewedOpposedCycle} from './opposed-cycle-revision.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard, wave-specific zero-information axis and impulse-confidence retirement.
 * The localized QRS retirement evidence is in docs/qrs-axis-observability.md.
 * Numerical QRS/T revisions are pinned separately. The rate-confidence screen
 * is reviewed with the complete LPFB source repair (docs/lpfb-resolution.md).
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function restoreHistoricalRateScreen(source) {
  return source.toString()
    .replace('  maximumRateDisagreementBpm: 5,\n','')
    .replace('  majorCandidateDisagreement: .4,\n','')
    .replace('detectVentricularCandidates, candidateShape','detectVentricularCandidates')
    .replace(/  \/\/ A single extra candidate[\s\S]*?(?=  return { requiresReview,)/,
      '  const requiresReview = backgroundRatio !== null &&\n    backgroundRatio > HR_QUALITY_POLICY.backgroundRatio &&\n    unmatched >= HR_QUALITY_POLICY.minimumUnmatched &&\n    unmatchedFraction >= HR_QUALITY_POLICY.unmatchedFraction;\n')
    .replace('Frecuencia sensible al umbral de detección:', 'Frecuencia sensible al umbral de detección y actividad de fondo elevada:');
}

export function assertReviewedSampleEntry(source, previous) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '845b22742cb314b61de97e7d538f2b1e267c955cf6f09aa7bff3a0eb70d9973a',
    'Unreviewed sample-entry change: acquisition guard or analysis policy differs');
  if (previous !== undefined) {
    const restored = restoreHistoricalRateScreen(source);
    const core = restored.split('\n/** Engineering acquisition domain')[0]
      .replace("import {reviewAlternatingCandidates} from './analysis/alternating-confidence';\n", '')
      .replace('reviewAlternatingCandidates(input, withholdImpulseDominatedMeasurements(input, retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))))', 'withholdImpulseDominatedMeasurements(input, retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality)))')
      .replace("import {withholdImpulseDominatedMeasurements} from './analysis/impulse-confidence';\n", '')
      .replace('withholdImpulseDominatedMeasurements(input, retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality)))', 'retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))')
      .replace("import { LEADS } from './lead-registry';\n", '')
      .replace('  assertSampleInput(input);\n', '')
      .replace('retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))', 'attachMeasurementSupport(next, quality)').trimEnd();
    assert.equal(core, previous.toString().trimEnd(), 'Numerical analysis differs beyond reviewed input guard');
  }
}

export function assertReviewedImpulseConfidence(source) {
  assertReviewedQrsTFile('src/engine/analysis/impulse-confidence.ts', source);
}

export function assertReviewedSampleDependencies(actual,historical,candidate) {
  const expected=candidate?[...historical,'src/engine/analysis/impulse-confidence.ts','src/engine/analysis/alternating-confidence.ts']:historical;
  assert.deepEqual([...actual].sort(),[...expected].sort(),'Unexpected analyzer dependency');
}

export function assertReviewedAlternatingConfidence(source) {
  assertReviewedOpposedCycle(source);
}
