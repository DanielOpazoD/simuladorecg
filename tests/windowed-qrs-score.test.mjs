import {it,expect} from 'vitest';
import {scoreWindowedQrs} from '../scripts/lib/windowed-qrs-score.mjs';
const events=[{time:.1,qrs:.24},{time:9.65,qrs:.165}];
it('does not censor valid fiducials of included boundary complexes',()=>{
 const r=scoreWindowedQrs(events,[.15,9.812]);
 expect(r).toMatchObject({tp:2,fn:0,fp:0});expect(r.rawWindow.fn).toBe(2);
 expect(r.boundaryWitnesses).toHaveLength(2);
});
it('does not admit neighboring outside-window waves beyond actual QRS support',()=>{
 expect(scoreWindowedQrs(events,[.06,9.88])).toMatchObject({tp:0,fn:2,fp:0});
});
it('keeps the same 150 ms tolerance even within an unusually broad source support',()=>{
 expect(scoreWindowedQrs([{time:.1,qrs:.4}],[.1])).toMatchObject({tp:0,fn:1,fp:0});
});
it('still counts unmatched interior candidates as false positives',()=>{
 expect(scoreWindowedQrs(events,[.15,5,9.812])).toMatchObject({tp:2,fn:0,fp:1});
});
it('keeps one-to-one event matching at the boundary',()=>{
 expect(scoreWindowedQrs([events[1]],[9.7,9.812]).tp).toBe(1);
});
