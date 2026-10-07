import assert from 'node:assert/strict';
/** Synthesized event time and duration are seconds, never requested-case milliseconds. */
export function qrsMidpointSeconds(beat){
 assert.ok(Number.isFinite(beat.time)&&beat.time>=0,'Reference onset must be seconds');
 assert.ok(Number.isFinite(beat.qrs)&&beat.qrs>0&&beat.qrs<1,'Reference QRS must be in seconds');
 return beat.time+beat.qrs/2;
}
