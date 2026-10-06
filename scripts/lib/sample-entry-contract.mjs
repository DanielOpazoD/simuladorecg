import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Reviewed acquisition guard, not permission to alter the delineator/quality policy.
 * Future revisions must supply new evidence; a filename-only allowlist is unsafe.
 */
export function assertReviewedSampleEntry(source) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '092f31292a9582a0f4a6d32427019dca7772e871576596e80428c5b21ccc4818',
    'Unreviewed sample-entry change: acquisition guard or analysis policy differs');
}
