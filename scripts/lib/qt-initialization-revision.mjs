import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
/** Independent frozen-source prediction for a missing first predecessor.
 * Keeps all subsequent adaptation arithmetic intact; no candidate imports.
 */
export function predictQTInitialization(source) {
  const anchor='    history = adaptRR(history, Math.max(0.22, beat.rr), beat.rr);';
  assert.equal(source.split(anchor).length,2,'Unknown QT history baseline');
  return source.replace(anchor, '    history = beat === beats[0] ? nominalVentricularRR(c) : adaptRR(history, Math.max(0.22, beat.rr), beat.rr);');
}

export function assertReviewedQTInitialization(source) {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '4851f61ec022cd9e2b6310b670a281f368b77203a3739cef21b600f3e554112a',
    'Unreviewed QT initialization or adaptation change');
}
