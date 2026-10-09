import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { sampleActivation, activationPair, activationLimitation } from '../src/ui/activation-model';
import { generateEvents } from '../src/engine/rhythm';
import { qrsKernels } from '../src/engine/morphology';
import { fromPreset, PRESETS, presetById } from '../src/presets/catalog';
import { project, frontal, type Vec } from '../src/engine/leads';
import { LEADS, type Beat, type ECGCase } from '../src/engine/types';
import { realisticQrsVector, usesRealisticBase } from '../src/engine/realistic/engine';

const beat: Beat = { time: 1, rr: 1, kind: 'normal' };
const load = (id: string) => fromPreset(presetById(id)!);
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

// Independent expression of the region's declared C1 support, not a call to
// qrsKernelValue/regionalWindow: the test must detect the old global taper.
function expectedVector(c: ECGCase, u: number): Vec {
  const v: Vec = [0, 0, 0];
  for (const k of qrsKernels(c, beat)) {
    const x = k.regional ? (u - k.regional.start) / (k.regional.end - k.regional.start) : u;
    const edge = Math.min(x, 1 - x) / (k.regional ? .08 : .035);
    const window = x <= 0 || x >= 1 ? 0 : k.regional && edge < 1
      ? .5 * (1 - Math.cos(Math.PI * edge)) : Math.min(1, edge);
    const basis = Math.exp(-.5 * ((u - k.mu) / k.sigma) ** 2) * window;
    for (let j = 0; j < 3; j++) v[j] += k.v[j] * basis;
  }
  return v;
}

describe('Merged regional engine and QRS laboratory share the same temporal support', () => {
  for (const conduction of ['rbbb', 'irbbb'] as const)
    for (const qrs of [100, 115, 150, 190, 230, 240])
      it(`${conduction}/${qrs} ms renders every regional sample, not the legacy taper`, () => {
        const c: ECGCase = { ...load(conduction), qrs, activationModel: 'regional-rbbb-v1' };
        const before = structuredClone(c), trace = sampleActivation(c, beat);
        assert.ok(qrsKernels(c, beat).every(k => k.regional));
        trace.xyz.forEach((actual, i) => {
          const expected = expectedVector(c, i / (trace.xyz.length - 1));
          expected.forEach((value, j) => close(actual[j], value));
          const leads = project(expected);
          for (const lead of LEADS) close(trace.leads[lead][i], leads[lead]);
        });
        assert.deepEqual(c, before);
        assert.deepEqual(trace.xyz[0], [0, 0, 0]);
        assert.deepEqual(trace.xyz.at(-1), [0, 0, 0]);
      });

  it('preserves the early clock in the lab when only the regional QRS duration changes', () => {
    const c: ECGCase = { ...load('rbbb'), activationModel: 'regional-rbbb-v1', qrs: 115 };
    const a = sampleActivation(c, beat), b = sampleActivation({ ...c, qrs: 230 }, beat);
    for (let ms = 0; ms <= 55; ms++)
      for (let j = 0; j < 3; j++) close(a.xyz[ms][j], b.xyz[ms][j]);
    assert.notDeepEqual(a.xyz[100], b.xyz[100]);
    assert.deepEqual(activationPair(c, beat, 'unchanged').a, activationPair(c, beat, 'unchanged').b);
  });

  it('preserves the historical basis plus independently specified WPW delta for every eligible preset and beat kind', () => {
    let checked = 0, deltaChecked = 0, learned = 0;
    for (const preset of PRESETS.filter(p => p.strategy !== 'pending')) {
      const c = fromPreset(preset), events = generateEvents(c, 10);
      for (const kind of new Set(events.beats.map(b => b.kind))) {
        const event = events.beats.find(b => b.kind === kind)!;
        if (activationLimitation(c, event)) continue;
        const trace = sampleActivation(c, event);
        if (event.kind === 'normal' && usesRealisticBase(c)) {
          // Learned base: the lab samples the same learned heart vector instead.
          trace.xyz.forEach((actual, i) => assert.deepEqual(actual, realisticQrsVector(c, trace.timesMs[i] / trace.durationMs)));
          learned++;
          continue;
        }
        const kernels = qrsKernels(c, event);
        assert.ok(kernels.every(k => !k.regional));
        const hasDelta = c.conduction === 'wpw' && event.kind === 'normal';
        if (hasDelta) deltaChecked++;
        trace.xyz.forEach((actual, i) => {
          const elapsed = trace.timesMs[i], u = elapsed / trace.durationMs, v: Vec = [0, 0, 0];
          const taper = u <= 0 || u >= 1 ? 0 : Math.min(1, u / .035, (1 - u) / .035);
          for (const k of kernels) {
            const basis = Math.exp(-.5 * ((u - k.mu) / k.sigma) ** 2) * taper;
            for (let j = 0; j < 3; j++) v[j] += basis * k.v[j];
          }
          // WPW was outside the old lab domain. Its newly eligible loop must
          // include the historical pulse, independently of wpwDeltaVector().
          if (hasDelta && elapsed > 0 && elapsed < 45) {
            const direction = frontal(c.axis, .25, .03);
            const gain = c.qrsAmp * (c.electrolyte === 'lowvoltage' ? .38 : 1) * Math.sin(Math.PI * (elapsed / 45));
            for (let j = 0; j < 3; j++) v[j] += direction[j] * gain;
          }
          assert.deepEqual(actual, v, `${preset.id}/${kind}/${elapsed} ms`);
        });
        checked++;
      }
    }
    assert.ok(checked > 30);
    assert.ok(learned > 15, 'Learned-base presets must use the learned loop');
    assert.equal(deltaChecked, 1, 'The WPW preset must participate, not be silently skipped');
  });

  it('keeps the legacy fallback for an incompatible requested regional mode', () => {
    const c: ECGCase = { ...load('rbbb'), activationModel: 'regional-rbbb-v1', overload: 'lv' };
    const actual = sampleActivation(c, beat), legacy = sampleActivation({ ...c, activationModel: 'template' }, beat);
    assert.deepEqual(actual.xyz, legacy.xyz);
    assert.deepEqual(actual.leads, legacy.leads);
  });
});
