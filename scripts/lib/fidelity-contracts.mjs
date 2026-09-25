import assert from 'node:assert/strict';

// Independent regression contract. Numerical tolerance is NOT clinical accuracy.
export const LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export const ELECTRICAL_TOLERANCE_MV = 1e-9;
export function assertSignal(signal, label = 'signal') {
  assert.ok(Number.isFinite(signal.fs) && signal.fs > 0, `${label}: sample rate`);
  assert.ok(Number.isFinite(signal.duration) && signal.duration > 0, `${label}: duration`);
  assert.deepEqual(Object.keys(signal.leads).sort(), [...LEADS].sort(), `${label}: lead set`);
  const length = Math.floor(signal.fs * signal.duration);
  for (const lead of LEADS) {
    const values = signal.leads[lead];
    assert.equal(values.length, length, `${label}/${lead}: sample count`);
    for (let i=0;i<length;i++) assert.ok(Number.isFinite(values[i]), `${label}/${lead}/${i}: nonfinite sample`);
  }
  for(let i=0;i<length;i++) {
    const l=signal.leads, a=l.I[i], b=l.II[i];
    const expected={III:b-a,aVR:-(a+b)/2,aVL:a-b/2,aVF:b-a/2};
    for(const [lead,value] of Object.entries(expected))
      assert.ok(Math.abs(l[lead][i]-value)<ELECTRICAL_TOLERANCE_MV, `${label}/${lead}/${i}: electrical identity`);
  }
}
export function compareSignalContract(before, after, {exact = false, label = 'comparison'} = {}) {
  assertSignal(before, `${label}/before`); assertSignal(after, `${label}/after`);
  assert.equal(after.fs, before.fs, `${label}: sample rate changed`);
  assert.equal(after.duration, before.duration, `${label}: duration changed`);
  assert.deepEqual(after.events, before.events, `${label}: activation/QRS/QT calendar changed`);
  let maxDifferenceMv=0;
  for(const lead of LEADS) for(let i=0;i<after.leads[lead].length;i++)
    maxDifferenceMv=Math.max(maxDifferenceMv,Math.abs(after.leads[lead][i]-before.leads[lead][i]));
  if(exact) assert.equal(maxDifferenceMv,0,`${label}: protected samples changed`);
  return {maxDifferenceMv, eventsUnchanged:true};
}
export function assertPresetSet(before, after) {
  const ids=presets=>presets.filter(p=>p.strategy!=='pending').map(p=>p.id).sort();
  assert.ok(ids(before).length>0,'empty reference catalog');
  assert.deepEqual(ids(after),ids(before),'active preset set changed: revise the explicit scope before acceptance');
}
