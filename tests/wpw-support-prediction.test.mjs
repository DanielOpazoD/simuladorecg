import {it,expect} from 'vitest';
import {predictWpwSupport} from '../scripts/lib/wpw-support-prediction.mjs';
it('limits frozen-source transformation to one recognized delta and preserves its gain',()=>{
 for(const gain of ['','c.qrsAmp * ','qrsAmplitudeScale(c) * ']){
  const source=`unchanged prefix\n      add(b.time, 0.045, (u) =>\n        scale(frontal(c.axis, 0.25, 0.03), ${gain}Math.sin(Math.PI * u)),\n      );\nunchanged suffix`;
  const after=predictWpwSupport(source);
  expect(after).toContain(`return scale(frontal(c.axis, 0.25, 0.03), ${gain}Math.sin(Math.PI * u));`);
  expect(after.startsWith('unchanged prefix')).toBe(true);expect(after.endsWith('unchanged suffix')).toBe(true);
  expect(after).toContain('if (u <= 0 || u >= 1) return [0, 0, 0]');
  expect(()=>predictWpwSupport(source+source)).toThrow();
  expect(()=>predictWpwSupport(source.replace('0.045','0.046'))).toThrow();
 }
});
