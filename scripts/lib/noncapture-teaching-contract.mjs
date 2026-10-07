import {OLD_SECONDARY_SCOPE,CURRENT_SECONDARY_SCOPE} from './teaching-scope-revision.mjs';
import assert from 'node:assert/strict';
/** Only the explicit no-activation warning omission is admitted; the declared absence disclosure is normalized back,
 * and every other condition remains exact against the frozen source. */
export function assertNoncaptureTeachingScope(current, historical) {
 assert.equal(current.split(CURRENT_SECONDARY_SCOPE).length,2,'Secondary-ST absence disclosure changed');
 const normalized=current.replace(CURRENT_SECONDARY_SCOPE,OLD_SECONDARY_SCOPE);
 const imported='import { isVviNoncapture } from "../engine/vvi-demand";\n';
 const guard=' || isVviNoncapture(c)';
 assert.equal(current.split(imported).length,2,'Noncapture teaching import changed');
 assert.equal(current.split(guard).length,2,'Noncapture teaching guard changed');
 assert.equal(normalized.replace(imported,'').replace(guard,''),historical,
   'Unreviewed teaching-limit change');
}
