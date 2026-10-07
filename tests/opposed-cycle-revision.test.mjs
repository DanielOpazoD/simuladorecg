import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {OPPOSED_CYCLE_REVISION,assertReviewedOpposedCycle,assertQualityOnlyRevision} from '../scripts/lib/opposed-cycle-revision.mjs';
it('pins exact confidence bytes, not merely a filename',()=>{
 const bytes=readFileSync(OPPOSED_CYCLE_REVISION.file);
 expect(()=>assertReviewedOpposedCycle(bytes)).not.toThrow();
 expect(()=>assertReviewedOpposedCycle(bytes+'\n')).toThrow(/Unreviewed/);
});
const before={hr:200,detectedPeaks:[.3,.6,.9],beats:[],evidence:{hr:{status:'usable'},qt:{status:'unavailable'}},quality:'old'};
const after={...before,evidence:{hr:{status:'review'},qt:{status:'unavailable'}},quality:'ambiguous'};
it('admits review without changing numbers or availability',()=>expect(()=>assertQualityOnlyRevision(before,after)).not.toThrow());
it('rejects guessed rate correction',()=>expect(()=>assertQualityOnlyRevision(before,{...after,hr:100})).toThrow(/numerical/));
it('rejects removing a candidate',()=>expect(()=>assertQualityOnlyRevision(before,{...after,detectedPeaks:[.3,.9]})).toThrow(/numerical/));
it('rejects confidence promotion',()=>expect(()=>assertQualityOnlyRevision(after,before)).toThrow(/promotion/));
it('rejects replacing review with abstention',()=>expect(()=>assertQualityOnlyRevision(before,{...after,evidence:{...after.evidence,hr:{status:'unavailable'}}})).toThrow(/abstention/));

it('rejects fabricated evidence support',()=>expect(()=>assertQualityOnlyRevision(before,{...after,evidence:{...after.evidence,hr:{status:'review',count:99}}})).toThrow(/support/));
