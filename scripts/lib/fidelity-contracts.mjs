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

/** Narrow, sample-by-sample oracle for the intended RV QRS gain change.
 * Extract the old RV contribution by subtracting two isolated signals at gain 1.
 * The new signal must equal old + (gain*attenuation - 1)*that contribution.
 * No current kernel constants, updated snapshots or detector outputs enter the oracle.
 * Only normal/IRBBB sinus cases without other lesions are in this contract's scope.
 */
export function assertRvAmplitudeChange(synthesizeBefore, before, after, c) {
  assert.ok(['rv_acute', 'rv_chronic'].includes(c.overload), 'RV oracle: wrong overload');
  assert.ok(c.rhythm === 'sinus' && ['normal', 'irbbb'].includes(c.conduction) &&
    c.ectopy === 'none' && c.ischemia === 'none', 'RV oracle: unsupported combined case');
  assert.ok(['none', 'lowvoltage'].includes(c.electrolyte), 'RV oracle: unsupported electrolyte');
  const isolated = {...c, qrsAmp: 1, electrolyte: 'none', pAmp: 0, tAmp: 0, st: 0};
  const withRV = synthesizeBefore(isolated, before.duration);
  const withoutRV = synthesizeBefore({...isolated, overload: 'none'}, before.duration);
  const factor = c.qrsAmp * (c.electrolyte === 'lowvoltage' ? .38 : 1) - 1;
  assert.ok(Number.isFinite(factor), 'RV oracle: nonfinite scale');
  const contract = compareSignalContract(before, after, {label: 'RV amplitude'});
  assert.deepEqual(after.truth, before.truth, 'RV oracle: truth changed');
  let oracleErrorMv = 0, expectedChangeMv = 0;
  for (const lead of LEADS) for (let i = 0; i < after.leads[lead].length; i++) {
    const delta = factor * (withRV.leads[lead][i] - withoutRV.leads[lead][i]);
    expectedChangeMv = Math.max(expectedChangeMv, Math.abs(delta));
    oracleErrorMv = Math.max(oracleErrorMv, Math.abs(after.leads[lead][i] - before.leads[lead][i] - delta));
  }
  assert.ok(oracleErrorMv < 1e-10, `Unexpected RV sample change: ${oracleErrorMv} mV`);
  if (Math.abs(factor) > .01) assert.ok(expectedChangeMv > .001, 'RV oracle must not be vacuous');
  return {...contract, oracleErrorMv, expectedChangeMv, oracle: 'frozen-signal-difference-at-unit-gain'};
}
