import {assertReviewedQrsTFile} from './qrs-t-revision.mjs';
import {assertReviewedOpposedCycle} from './opposed-cycle-revision.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard, wave-specific zero-information axis and impulse-confidence retirement.
 * The localized QRS retirement evidence is in docs/qrs-axis-observability.md.
 * Numerical detection/delineation and earlier quality policy remain frozen.
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function assertReviewedSampleEntry(source, previous) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'dcd405a514640570768eba5b5790cba1122d9ee1d240290fd89cd2e0c00d1fc3',
    'Unreviewed sample-entry change: acquisition guard or analysis policy differs');
  if (previous !== undefined) {
    const core = source.toString().split('\n/** Engineering acquisition domain')[0]
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
