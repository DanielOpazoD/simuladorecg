import {describe, it} from 'vitest';
import assert from 'node:assert/strict';
import {assertRvAmplitudeChange} from '../scripts/lib/fidelity-contracts.mjs';
const c = {rhythm:'sinus', conduction:'normal', ectopy:'none', ischemia:'none', overload:'rv_chronic', electrolyte:'none', qrsAmp:1.2};
// Analytic test double: distinct core/RV support, known amplitude, and all limb identities.
function signal(config, corrected = false) {
  const scale = config.qrsAmp * (config.electrolyte === 'lowvoltage' ? .38 : 1);
  const x = Float64Array.from({length:64}, (_, i) => i < 20 ? scale * Math.sin(i / 6) : 0);
  if (config.overload !== 'none') for (let i=8; i<24; i++) x[i] += .2 * (corrected ? scale : 1);
  const leads = {};
  for (const [l,k] of Object.entries({I:1,II:2,III:1,aVR:-1.5,aVL:0,aVF:1.5,V1:.7,V2:.8,V3:.9,V4:1,V5:1.1,V6:1.2}))
    leads[l] = Float64Array.from(x, v => v*k);
  return {fs:64,duration:1,leads,events:{beats:[]},truth:{qt:.4}};
}
const run = (after, config=c, beforeFn=signal) => assertRvAmplitudeChange(beforeFn, signal(config), after, config);
describe('The RV default exception requires a discriminative frozen-sample oracle', () => {
  it('accepts only the prescribed component delta, preserving metadata', () => {
    const result=run(signal(c,true)); assert.ok(result.expectedChangeMv>.01); assert.ok(result.oracleErrorMv<1e-10);
  });
  it('rejects leaving the original defect unchanged', () => assert.throws(()=>run(signal(c)), /Unexpected RV sample/));
  it('rejects unrelated ST/T or lead changes', () => {
    const after=signal(c,true); after.leads.V5[45]=.02;
    assert.throws(()=>run(after), /Unexpected RV sample/);
  });
  it('rejects altered electrical timing and nonfinite samples', () => {
    const after=signal(c,true); after.events.beats.push({time:.5});
    assert.throws(()=>run(after), /calendar changed/);
    const invalid=signal(c,true); invalid.leads.V1[2]=NaN;
    assert.throws(()=>run(invalid), /nonfinite sample/);
  });
  it('does not license other presets or mixed activation patterns', () => {
    for(const config of [{...c,overload:'lv'},{...c,rhythm:'vt'},{...c,ischemia:'anterior'}])
      assert.throws(()=>run(signal(config,true),config), /RV oracle/);
  });
  it('rejects an empty difference oracle even when signals match', () => {
    const old=signal(c); assert.throws(()=>run(old,c,()=>old), /must not be vacuous/);
  });
});
