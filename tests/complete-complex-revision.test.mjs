import {it,expect} from 'vitest';
import {assertCompleteComplexMeasurements} from '../scripts/lib/complete-complex-revision.mjs';
const events=[.4,1.4,2.4].map(time=>({time,qrs:.2,qt:.4}));
const measurement=({qrs=200,qt=400,hr=60}={})=>({hr,
 detectedPeaks:events.map(b=>b.time+.1),
 beats:events.map(b=>({peak:b.time+.1,onset:b.time,offset:b.time+qrs/1000,qrs,qt})),
 evidence:{hr:{status:'usable'},qrs:{status:'usable'},qt:{status:'usable'}},
});
it('accepts correction of truncated boundaries rather than freezing a wrong width',()=>{
 const r=assertCompleteComplexMeasurements(measurement({qrs:80}),measurement(),events);
 expect(r.before.badQrs).toBe(3);expect(r.after.badQrs).toBe(0);
});
it.each([{qrs:80},{qt:500},{hr:120}])('rejects a new falsely usable estimate %j',change=>{
 expect(()=>assertCompleteComplexMeasurements(measurement(),measurement(change),events)).toThrow();
});
it('rejects a new missed activation',()=>{
 const after=measurement();after.detectedPeaks.pop();
 expect(()=>assertCompleteComplexMeasurements(measurement(),after,events)).toThrow();
});
it('rejects internally inconsistent durations',()=>{
 const after=measurement();after.beats[0].qrs=130;
 expect(()=>assertCompleteComplexMeasurements(measurement(),after,events)).toThrow();
});
