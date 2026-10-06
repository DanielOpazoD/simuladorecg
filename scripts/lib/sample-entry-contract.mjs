import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard and zero-information axis retirement, not permission to alter the delineator/quality policy.
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function assertReviewedSampleEntry(source, previous) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '5e5f52b9f454950f60eea984adee5a40f10a2d7c2de35524fba181b9e0138c3b',
    'Unreviewed sample-entry change: acquisition guard or analysis policy differs');
  if (previous !== undefined) {
    const core = source.toString().split('\n/** Engineering acquisition domain')[0]
      .replace("import { LEADS } from './lead-registry';\n", '')
      .replace('  assertSampleInput(input);\n', '')
      .replace('retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))', 'attachMeasurementSupport(next, quality)').trimEnd();
    assert.equal(core, previous.toString().trimEnd(), 'Numerical analysis differs beyond reviewed input guard');
  }
}
