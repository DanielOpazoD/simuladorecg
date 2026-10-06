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
    'ead5125c0c7d8e2aafcbb6f9cb9f93260e923e831a0b04dd921c3d0860433359',
    'Unreviewed QT initialization or adaptation change');
}
