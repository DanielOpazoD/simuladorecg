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
    '44f4565512c6483b286e2a17e7e4ea19f099b7bf4805ef7807aef8b15bf1d5d5',
    'Unreviewed QT initialization or adaptation change');
}
