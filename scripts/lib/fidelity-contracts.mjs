import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

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

/** Exact equality without asking assert to format a diff of 60,000+ samples. */
export function assertExactSignal(before, after, label = 'signal') {
  const {leads: a, ...am} = before, {leads: b, ...bm} = after;
  assert.ok(isDeepStrictEqual(am, bm), `${label}: signal metadata changed`);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `${label}: lead set changed`);
  for (const lead of Object.keys(a)) {
    if (isDeepStrictEqual(a[lead], b[lead])) continue;
    assert.equal(b[lead].length, a[lead].length, `${label}/${lead}: length changed`);
    const i = a[lead].findIndex((value, index) => !Object.is(value, b[lead][index]));
    assert.fail(`${label}/${lead}: first differing sample ${i}; before=${a[lead][i]}, after=${b[lead][i]}`);
  }
}

/** Predict ONLY PR41's common frontal rotation from the frozen PR40 signal.
 * Rotation is computed from frozen kernels, not current kernels or measured axes.
 * Isolated frozen QRS supplies sample-wise I/Y. With Z fixed, invert the frozen
 * I/II projection to obtain dX/dY, then project that delta to all twelve leads.
 * Linear filters commute with this transform. P/T, noise and metadata must remain
 * unchanged. Deliberately restricted to the two sinus RV presets used by this gate.
 */
export function assertFinalQrsAxisChange(reference, before, after, c) {
  assert.ok(['rv_acute', 'rv_chronic'].includes(c.overload) && c.rhythm === 'sinus' &&
    ['normal', 'irbbb'].includes(c.conduction) && c.ectopy === 'none' &&
    c.ischemia === 'none' && ['none', 'lowvoltage'].includes(c.electrolyte) &&
    !c.artifacts.reversed, 'Axis oracle: unsupported case');
  const ks = reference.qrsKernels(c, {time: 0, rr: 1, kind: 'normal'});
  const sum = ks.reduce((v, k) => v.map((x, j) => x + k.v[j] * k.sigma), [0, 0, 0]);
  const d = reference.DOWER, dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
  const iNet = dot(d.I, sum), iiNet = dot(d.II, sum);
  const oldAxis = Math.atan2((2 * iiNet - iNet) / Math.sqrt(3), iNet);
  const rotation = c.axis * Math.PI / 180 - oldAxis;
  assert.ok(Number.isFinite(rotation), 'Axis oracle: nonfinite rotation');
  const co = Math.cos(rotation), si = Math.sin(rotation);
  const determinant = d.I[0] * d.II[1] - d.I[1] * d.II[0];
  assert.ok(Math.abs(determinant) > 1e-9, 'Axis oracle: singular projection');
  const isolated = reference.synthesize({...c, pAmp: 0, tAmp: 0, st: 0,
    artifacts: {...c.artifacts, baseline: 0, muscle: 0, mains: 0, loose: 0}}, before.duration);
  const contract = compareSignalContract(before, after, {label: 'final QRS axis'});
  const {leads: _a, ...am} = before, {leads: _b, ...bm} = after;
  assert.ok(isDeepStrictEqual(am, bm), 'Axis oracle: signal metadata changed');
  let axisOracleErrorMv = 0, expectedAxisChangeMv = 0;
  for (let k = 0; k < isolated.leads.I.length; k++) {
    const i = isolated.leads.I[k], y = (2 * isolated.leads.II[k] - i) / Math.sqrt(3);
    const di = i * (co - 1) - y * si, dy = i * si + y * (co - 1);
    const dii = (di + Math.sqrt(3) * dy) / 2;
    const dx3 = (di * d.II[1] - d.I[1] * dii) / determinant;
    const dy3 = (d.I[0] * dii - di * d.II[0]) / determinant;
    const delta = Object.fromEntries(Object.entries(d).map(([lead, v]) => [lead, v[0] * dx3 + v[1] * dy3]));
    Object.assign(delta, {III: dii-di, aVR: -(di+dii)/2, aVL: di-dii/2, aVF: dii-di/2});
    for (const lead of LEADS) {
      const error = after.leads[lead][k] - before.leads[lead][k] - delta[lead];
      assert.ok(Number.isFinite(error), `Axis oracle/${lead}/${k}: nonfinite residual`);
      axisOracleErrorMv = Math.max(axisOracleErrorMv, Math.abs(error));
      expectedAxisChangeMv = Math.max(expectedAxisChangeMv, Math.abs(delta[lead]));
    }
  }
  assert.ok(expectedAxisChangeMv > 1e-6, 'Axis oracle must not be vacuous');
  assert.ok(axisOracleErrorMv < 1e-10, `Unexpected final-axis sample change: ${axisOracleErrorMv} mV`);
  return {...contract, axisOracleErrorMv, expectedAxisChangeMv,
    rotationDegrees: rotation * 180 / Math.PI, oracle: 'frozen-PR40-QRS-frontal-rotation'};
}
