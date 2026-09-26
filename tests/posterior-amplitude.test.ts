import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { LEADS, type ECGCase, type Signal } from '../src/engine/types';

function setup(filter: ECGCase['filter'] = 'off'): ECGCase {
  const c = fromPreset(presetById('posterior')!);
  return { ...c, filter, hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0 };
}
function scalingError(reference: Signal, scaled: Signal, factor: number): number {
  let error = 0;
  for (const l of LEADS) for (let i = 0; i < reference.leads[l].length; i++)
    error = Math.max(error, Math.abs(scaled.leads[l][i] - reference.leads[l][i] * factor));
  return error;
}
describe('Posterior local R follows QRS gain, not lesion or T amplitude', () => {
  for (const filter of ['off', 'diagnostic', 'monitor', 'aggressive'] as const) {
    it(`scales the complete isolated QRS at 0.1, 0.5, 2 and 3 with ${filter}`, () => {
      const c = setup(filter), full = synthesize(c, 10);
      for (const qrsAmp of [.1, .5, 2, 3]) {
        const scaled = synthesize({ ...c, qrsAmp }, 10);
        assert.ok(scalingError(full, scaled, qrsAmp) < 1e-10, `Unscaled QRS component at gain ${qrsAmp}`);
        assert.deepEqual(scaled.events, full.events);
        assert.equal(scaled.truth.qt, full.truth.qt);
      }
    });
  }
  it('changes only QRS plus declared antialias support on the unfiltered complete trace', () => {
    const c = { ...setup(), pAmp: .15, tAmp: .28, st: 2 };
    const low = synthesize({ ...c, qrsAmp: .1 }, 10), high = synthesize({ ...c, qrsAmp: 3 }, 10);
    let checked = 0;
    for (const l of LEADS) for (let i = Math.ceil(high.fs); i < 9 * high.fs; i++) {
      const time = i / high.fs;
      if (high.events.beats.some(b => time >= b.time - .041 && time <= b.time + b.qrs! + .041)) continue;
      assert.equal(low.leads[l][i], high.leads[l][i]); checked++;
    }
    assert.ok(checked > 10000);
    assert.deepEqual(low.events, high.events);
  });
  it('scales the posterior-minus-basal correction and preserves all other leads', () => {
    const c = setup();
    const a = synthesize(c, 10), baseA = synthesize({ ...c, ischemia: 'none' }, 10);
    const b = synthesize({ ...c, qrsAmp: .1 }, 10), baseB = synthesize({ ...c, qrsAmp: .1, ischemia: 'none' }, 10);
    let localResponse = 0;
    for (const l of LEADS) for (let i = 0; i < a.leads[l].length; i++) {
      const full = a.leads[l][i] - baseA.leads[l][i], tenth = b.leads[l][i] - baseB.leads[l][i];
      assert.ok(Math.abs(tenth - full * .1) < 1e-12);
      if (!['V1', 'V2', 'V3'].includes(l)) assert.equal(full, 0);
      else localResponse = Math.max(localResponse, Math.abs(full));
    }
    assert.ok(localResponse > .7);
  });
  it('preserves limb identities, reversal and deterministic output', () => {
    const c = setup('monitor'); c.qrsAmp = .1;
    const s = synthesize(c, 10), repeated = synthesize(c, 10);
    const r = synthesize({ ...c, artifacts: { ...c.artifacts, reversed: true } }, 10);
    for (const l of LEADS) assert.deepEqual(s.leads[l], repeated.leads[l]);
    for (let i = 0; i < s.leads.I.length; i++) {
      assert.ok(Math.abs(s.leads.III[i] - (s.leads.II[i] - s.leads.I[i])) < 1e-12);
      assert.ok(Math.abs(s.leads.aVR[i] + (s.leads.I[i] + s.leads.II[i]) / 2) < 1e-12);
      assert.equal(r.leads.II[i], s.leads.III[i]);
      assert.equal(r.leads.V1[i], s.leads.V1[i]);
    }
  });
});
