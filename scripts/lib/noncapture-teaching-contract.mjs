import assert from 'node:assert/strict';
/** Only the explicit no-activation warning omission is admitted; original prose
 * and every other condition remain exact against the frozen source. */
export function assertNoncaptureTeachingScope(current, historical) {
 const imported='import { isVviNoncapture } from "../engine/vvi-demand";\n';
 const guard=' || isVviNoncapture(c)';
 assert.equal(current.split(imported).length,2,'Noncapture teaching import changed');
 assert.equal(current.split(guard).length,2,'Noncapture teaching guard changed');
 assert.equal(current.replace(imported,'').replace(guard,''),historical,
   'Unreviewed teaching-limit change');
}
