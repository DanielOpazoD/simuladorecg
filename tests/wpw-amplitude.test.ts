import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { LEADS, type ECGCase, type Signal } from '../src/engine/types';

const setup = (filter: ECGCase['filter'] = 'off'): ECGCase => ({
  ...fromPreset(presetById('wpw')!), hr: 60, variability: 0, filter, pAmp: 0, tAmp: 0, st: 0,
});
function scalingError(a: Signal, b: Signal, gain: number) {
  let error = 0;
  for (const lead of LEADS) for (let i = 0; i < a.leads[lead].length; i++)
    error = Math.max(error, Math.abs(b.leads[lead][i] - gain * a.leads[lead][i]));
  return error;
}
describe('WPW delta is part of QRS gain, not a separate fixed-amplitude source', () => {
  for (const filter of ['off', 'diagnostic', 'monitor', 'aggressive'] as const)
    it(`scales the entire isolated complex through ${filter}`, () => {
      const c = setup(filter), unit = synthesize(c, 10);
      for (const qrsAmp of [.1, .5, 2, 3]) {
        const scaled = synthesize({ ...c, qrsAmp }, 10);
        assert.ok(scalingError(unit, scaled, qrsAmp) < 1e-10, `Unscaled WPW delta at gain ${qrsAmp}`);
        assert.deepEqual(scaled.events, unit.events);
        assert.deepEqual(scaled.truth, unit.truth);
      }
    });
  it('scales the WPW-minus-basal initial component in every physical lead', () => {
    const c = setup(), unit = synthesize(c, 10);
    const basal = synthesize({ ...c, conduction: 'normal' }, 10);
    const low = synthesize({ ...c, qrsAmp: .1 }, 10);
    const basalLow = synthesize({ ...c, conduction: 'normal', qrsAmp: .1 }, 10);
    let response = 0;
    for (const lead of LEADS) for (let i = 0; i < unit.leads[lead].length; i++) {
      const delta = unit.leads[lead][i] - basal.leads[lead][i];
      response = Math.max(response, Math.abs(delta));
      assert.ok(Math.abs(low.leads[lead][i] - basalLow.leads[lead][i] - .1 * delta) < 1e-12);
    }
    assert.ok(response > .2, 'The differential test must actually contain a delta component');
  });
  it('leaves P/ST/T and times unchanged outside QRS plus the existing FIR support', () => {
    const c = { ...setup(), pAmp: .15, tAmp: .28, ischemia: 'anterior' as const, st: 2 };
    const a = synthesize({ ...c, qrsAmp: .1 }, 10), b = synthesize({ ...c, qrsAmp: 3 }, 10);
    let checked = 0;
    for (const lead of LEADS) for (let i = a.fs; i < 9 * a.fs; i++) {
      const time = i / a.fs;
      if (a.events.beats.some(x => time >= x.time - .041 && time <= x.time + x.qrs! + .041)) continue;
      assert.equal(a.leads[lead][i], b.leads[lead][i]); checked++;
    }
    assert.ok(checked > 10000);
    assert.deepEqual(a.events, b.events);
    assert.deepEqual(a.truth, b.truth);
  });
  it('preserves deterministic output and electrode-reversal identities', () => {
    const c = { ...setup('monitor'), qrsAmp: .1 }, a = synthesize(c, 10), repeated = synthesize(c, 10);
    const b = synthesize({ ...c, artifacts: { ...c.artifacts, reversed: true } }, 10);
    for (const lead of LEADS) assert.deepEqual(a.leads[lead], repeated.leads[lead]);
    for (let i = 0; i < a.leads.I.length; i++) {
      assert.equal(b.leads.I[i], -a.leads.I[i]);
      assert.equal(b.leads.II[i], a.leads.III[i]);
      assert.equal(b.leads.aVR[i], a.leads.aVL[i]);
      assert.equal(b.leads.V1[i], a.leads.V1[i]);
    }
  });
});

// Reuse the model's existing 0.38 attenuation; this is not a clinical threshold.
describe('WPW low voltage attenuates the delta and QRS together', () => {
  for (const filter of ['off', 'diagnostic', 'monitor', 'aggressive'] as const)
    it(`attenuates every isolated sample at five gains through ${filter}`, () => {
      for (const qrsAmp of [.1, .5, 1, 2, 3]) {
        const c = { ...setup(filter), qrsAmp }, normal = synthesize(c, 10);
        const low = synthesize({ ...c, electrolyte: 'lowvoltage' }, 10);
        assert.ok(scalingError(normal, low, .38) < 1e-10, `Unattenuated WPW component at gain ${qrsAmp}`);
        assert.deepEqual(low.events, normal.events); assert.equal(low.truth.qt, normal.truth.qt);
      }
    });
  it('keeps P/ST/T and timings outside the QRS plus antialias support unchanged', () => {
    const c = { ...setup(), pAmp: .15, tAmp: .28, ischemia: 'anterior' as const, st: 2 };
    const normal = synthesize(c, 10), low = synthesize({ ...c, electrolyte: 'lowvoltage' }, 10);
    let compared = 0;
    for (const lead of LEADS) for (let i = normal.fs; i < 9 * normal.fs; i++) {
      const t = i / normal.fs;
      if (normal.events.beats.some(b => t >= b.time - .041 && t <= b.time + b.qrs! + .041)) continue;
      assert.equal(normal.leads[lead][i], low.leads[lead][i]); compared++;
    }
    assert.ok(compared > 10000); assert.deepEqual(normal.events, low.events);
  });
  it('does not leave a fixed delta when WPW and posterior corrections coexist', () => {
    for (const qrsAmp of [.1, 1, 3]) {
      const c = { ...setup(), ischemia: 'posterior' as const, qrsAmp };
      const normal = synthesize(c, 10), low = synthesize({ ...c, electrolyte: 'lowvoltage' }, 10);
      assert.ok(scalingError(normal, low, .38) < 1e-10);
      assert.deepEqual(normal.events, low.events);
    }
  });
});
