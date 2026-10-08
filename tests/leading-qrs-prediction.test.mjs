import {it,expect} from 'vitest';
import {predictLeadingQrs} from '../scripts/lib/leading-qrs-prediction.mjs';
it('adds boundary provenance only at the one frozen event-return anchor',()=>{
 const prefix='unchanged samples\n',tail='    truth: original\n',anchor='    events: visible,\n';
 const next=predictLeadingQrs(prefix+anchor+tail);
 expect(next.startsWith(prefix+anchor)).toBe(true);expect(next.endsWith(tail)).toBe(true);
 expect(next).toContain('beat.time >= WARM');expect(next).toContain('beat.time + beat.qrs <= WARM');
 expect(next).toContain('time: beat.time - WARM');
 for(const source of [prefix+tail,prefix+anchor+anchor+tail,next])expect(()=>predictLeadingQrs(source)).toThrow();
});
