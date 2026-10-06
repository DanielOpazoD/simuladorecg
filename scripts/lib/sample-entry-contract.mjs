import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard, zero-information axis and impulse-confidence retirement.
 * Numerical detection/delineation and earlier quality policy remain frozen.
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function assertReviewedSampleEntry(source, previous) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'fbffdab87df041f5b8d0d89cf37533e085bb21d7e4a2f4bce3a6d1310b332501',
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
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '20a40b8da435c503ea4044919022e5015cae53b818ab283feb158bfeb83055ef', 'Unreviewed impulse-confidence change');
}

export function assertReviewedSampleDependencies(actual,historical,candidate) {
  const expected=candidate?[...historical,'src/engine/analysis/impulse-confidence.ts','src/engine/analysis/alternating-confidence.ts']:historical;
  assert.deepEqual([...actual].sort(),[...expected].sort(),'Unexpected analyzer dependency');
}

export function assertReviewedAlternatingConfidence(source) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '5e28c22f46023905c977d2ce3f6b6a0f22bc4253b65d91e5e2303ba0b2697fbc', 'Unreviewed alternating-confidence change');
}
