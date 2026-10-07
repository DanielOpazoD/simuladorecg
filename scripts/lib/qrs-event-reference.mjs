import assert from 'node:assert/strict';
/** Evaluator-only event coordinates/duration are seconds. The <1s sanity bound
 * belongs to this engine, not a physiological limit. No detector/model input. */
export function qrsMidpointSeconds(beat){
 assert.ok(Number.isFinite(beat.time),'Reference onset must be seconds');
 assert.ok(Number.isFinite(beat.qrs)&&beat.qrs>0&&beat.qrs<1,'Reference QRS must be in seconds');
 return beat.time+beat.qrs/2;
}
