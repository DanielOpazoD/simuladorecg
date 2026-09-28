/** Sample contracts, not a clinical reference. All event times are seconds. */
import assert from 'node:assert/strict';
export const PHYSICAL_LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export function beatWindows(beat) {
  const {time, qrs, qt} = beat;
  assert.ok(Number.isFinite(time) && Number.isFinite(qrs) && Number.isFinite(qt), 'Finite event times required');
  assert.ok(qrs >= .02 && qrs <= .5 && qt > qrs && qt <= 2, 'Event QRS/QT must be seconds, not milliseconds');
  return {pre:[time-.08,time], qrs:[time,time+qrs], postQrs:[time+qrs,time+qt]};
}
export function assertSampleRegion(a,b,start,end,{label='samples',epsilon=0}={}) {
  assert.equal(a.fs,b.fs,`${label}: frequency changed`);
  assert.ok(Number.isFinite(epsilon) && epsilon >= 0, 'Invalid numerical tolerance');
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end > start, `${label}: invalid/empty time window`);
  const lo=Math.ceil(start*a.fs), hi=Math.ceil(end*a.fs);
  assert.ok(lo>=0 && hi>lo, `${label}: empty or negative sample window`);
  let checked=0, maxDifferenceMv=0;
  for(const lead of PHYSICAL_LEADS) {
    assert.ok(a.leads[lead] && b.leads[lead], `${label}: missing ${lead}`);
    assert.equal(a.leads[lead].length,b.leads[lead].length,`${label}: length ${lead}`);
    assert.ok(hi<=a.leads[lead].length, `${label}: window outside ${lead}`);
    for(let i=lo;i<hi;i++) {
      const x=a.leads[lead][i],y=b.leads[lead][i];
      assert.ok(Number.isFinite(x)&&Number.isFinite(y),`${label}: nonfinite ${lead}/${i}`);
      const error=Math.abs(x-y); maxDifferenceMv=Math.max(maxDifferenceMv,error); checked++;
      assert.ok(error<=epsilon,`${label}: ${lead}/${i} difference ${error} mV exceeds ${epsilon}`);
    }
  }
  return {checked,maxDifferenceMv,startSample:lo,endSampleExclusive:hi};
}
export function assertTraceContract(a,b,label='trace',epsilon=0) {
  assert.equal(a.duration,b.duration,`${label}: duration`);
  assert.deepEqual(a.events,b.events,`${label}: events`);
  assert.deepEqual(a.truth,b.truth,`${label}: truth`);
  assert.deepEqual(a.warnings,b.warnings,`${label}: warnings`);
  for(const beat of a.events.beats) beatWindows(beat);
  for(const beat of b.events.beats) beatWindows(beat);
  return assertSampleRegion(a,b,0,a.duration,{label,epsilon});
}
