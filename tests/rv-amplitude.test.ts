import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { synthesize } from '../src/engine/signal';
import { tWaveSupport } from '../src/engine/constraints';
import { qrsKernels } from '../src/engine/morphology';
import { fromPreset, presetById } from '../src/presets/catalog';
import { LEADS, type ECGCase, type Signal } from '../src/engine/types';
const filters = ['off', 'diagnostic', 'monitor', 'aggressive'] as const;
const gains = [.1, .5, 1, 2, 3];
const setup = (id: string, filter: ECGCase['filter'] = 'off'): ECGCase => ({
  ...fromPreset(presetById(id)!), hr: 60, variability: 0, filter, qrsAmp: 1, pAmp: 0, tAmp: 0, st: 0,
});
function error(a: Signal, b: Signal, factor: number): number {
  let worst = 0;
  for (const l of LEADS) for (let i = 0; i < a.leads[l].length; i++)
    worst = Math.max(worst, Math.abs(b.leads[l][i] - factor * a.leads[l][i]));
  return worst;
}
describe('All right-ventricular QRS components share gain and existing low-voltage attenuation', () => {
  for (const id of ['rv_acute', 'rv_chronic']) for (const filter of filters)
    it(`${id}: proportional samples at five gains, with/without low voltage, ${filter}`, () => {
      const c = setup(id, filter), unit = synthesize(c, 10);
      for (const qrsAmp of gains) for (const electrolyte of ['none', 'lowvoltage'] as const) {
        const s = synthesize({...c, qrsAmp, electrolyte}, 10);
        assert.ok(error(unit, s, qrsAmp * (electrolyte === 'lowvoltage' ? .38 : 1)) < 1e-10);
        assert.deepEqual(s.events, unit.events); assert.deepEqual(s.truth, unit.truth);
      }
    });
  it('scales all three coordinates, including the appended kernel, for every activation kind', () => {
    for (const id of ['rv_acute', 'rv_chronic']) for (const kind of ['normal', 'pvc', 'ventricular', 'paced'] as const) {
      const c = setup(id), beat = {time: 1, rr: 1, kind};
      const reference = qrsKernels(c, beat);
      for (const qrsAmp of gains) for (const electrolyte of ['none', 'lowvoltage'] as const) {
        const actual = qrsKernels({...c, qrsAmp, electrolyte}, beat), factor = qrsAmp * (electrolyte === 'lowvoltage' ? .38 : 1);
        assert.equal(actual.length, reference.length);
        actual.forEach((k, n) => {
          assert.equal(k.mu, reference[n].mu); assert.equal(k.sigma, reference[n].sigma);
          k.v.forEach((v, j) => assert.ok(Math.abs(v - factor * reference[n].v[j]) < 1e-12));
        });
      }
    }
  });
  for (const id of ['rv_acute', 'rv_chronic'])
    it(`${id}: preserves other waves outside QRS and its coupled ST support`, () => {
      const c = {...setup(id), pAmp: .3, tAmp: .28};
      const a = synthesize({...c, qrsAmp: .1}, 10);
      const b = synthesize({...c, qrsAmp: 3, electrolyte: 'lowvoltage'}, 10);
      let checked = 0;
      for (const l of LEADS) for (let i = a.fs; i < 9 * a.fs; i++) {
        const t = i / a.fs;
        if (a.events.beats.some(x => t >= x.time - .041 && t <= x.time + Math.max(x.qrs!,x.qt!-tWaveSupport(c,x.qrs!,x.qt!).duration/2) + .041)) continue;
        assert.ok(Math.abs(a.leads[l][i] - b.leads[l][i]) < 1e-12,
          "Outside-QRS/ST difference exceeds numerical roundoff tolerance"); checked++;
      }
      assert.ok(checked > 10000); assert.deepEqual(a.events, b.events); assert.deepEqual(a.truth, b.truth);
    });
  it('does not leave a fixed RV component alongside WPW and posterior QRS contributions', () => {
    for (const overload of ['rv_acute', 'rv_chronic'] as const) {
      const c = {...setup('wpw'), overload, ischemia: 'posterior' as const};
      const full = synthesize(c, 10);
      for (const qrsAmp of [.1, 1, 3]) {
        const low = synthesize({...c, qrsAmp, electrolyte: 'lowvoltage'}, 10);
        assert.ok(error(full, low, qrsAmp * .38) < 1e-10);
      }
    }
  });
  it('preserves deterministic output and limb-electrode reversal identities', () => {
    const c = {...setup('rv_chronic', 'monitor'), qrsAmp: .1, electrolyte: 'lowvoltage' as const};
    const a = synthesize(c, 10), repeat = synthesize(c, 10);
    const b = synthesize({...c, artifacts: {...c.artifacts, reversed: true}}, 10);
    assert.deepEqual(a, repeat);
    for (let i = 0; i < a.leads.I.length; i++) {
      assert.equal(b.leads.I[i], -a.leads.I[i]); assert.equal(b.leads.II[i], a.leads.III[i]);
      assert.equal(b.leads.aVR[i], a.leads.aVL[i]); assert.equal(b.leads.V1[i], a.leads.V1[i]);
    }
  });
});
