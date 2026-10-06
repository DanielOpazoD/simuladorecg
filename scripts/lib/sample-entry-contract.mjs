import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard, zero-information axis and impulse-confidence retirement.
 * Numerical detection/delineation and earlier quality policy remain frozen.
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function assertReviewedSampleEntry(source, previous) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '0a074cafb92dc11ea5830830d50f46ea85aeb3ab83e7dfd5d13a272e039ab7c1',
    'Unreviewed sample-entry change: acquisition guard or analysis policy differs');
  if (previous !== undefined) {
    const core = source.toString().split('\n/** Engineering acquisition domain')[0]
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
    '01aba2e47a670e23c18e6bddc712158031d313114b3b7c266d7b01177cb41b55', 'Unreviewed impulse-confidence change');
}

export function assertReviewedSampleDependencies(actual,historical,candidate) {
  const expected=candidate?[...historical,'src/engine/analysis/impulse-confidence.ts']:historical;
  assert.deepEqual([...actual].sort(),[...expected].sort(),'Unexpected analyzer dependency');
}
