import assert from 'node:assert/strict';
/** Add only clipped-boundary provenance to frozen generators. Original sample
 * loops, visible event calendar and truth remain byte-for-byte untouched. */
export function predictLeadingQrs(source){
 const anchor='    events: visible,\n';
 assert.equal(source.split(anchor).length,2,'Unrecognized or duplicated frozen event-return anchor');
 assert.ok(!source.includes('leadingQrs:'),'Boundary provenance already present');
 return source.replace(anchor,anchor+`    leadingQrs: events.beats.flatMap((beat) => {
      if (beat.time >= WARM || beat.qrs === undefined || beat.time + beat.qrs <= WARM) return [];
      return [{ ...beat, time: beat.time - WARM }];
    }),\n`);
}
