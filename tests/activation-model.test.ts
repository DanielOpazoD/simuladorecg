import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { activationAt, activationCandidate, activationLimitation, activationOptions, activationPair, sampleActivation } from '../src/ui/activation-model';
import { activationSvg, activationPoint } from '../src/render/activation';
import { fromPreset, PRESETS, presetById } from '../src/presets/catalog';
import { generateEvents } from '../src/engine/rhythm';
import { qrsKernels } from '../src/engine/morphology';
import { project } from '../src/engine/leads';
import { LEADS, cloneCase, type Beat, type ECGCase } from '../src/engine/types';
import { VENTRICULAR_SOURCE_IDS, VENTRICULAR_SOURCES } from '../src/engine/ventricular-source';
import { normalizeImportedCase, caseContext } from '../src/presets/case-context';
const load = (id: string) => fromPreset(presetById(id)!);
const beat = (kind: Beat['kind'] = 'normal'): Beat => ({ time: 1, rr: 1, kind });
const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

describe('Activation lab: sampled vector, explicit domains and real beat kinds', () => {
  it('sums temporal components, rather than plotting or measuring a polygon of coefficients', () => {
    const c = load('rbbb'), trace = sampleActivation(c, beat()), ks = qrsKernels(c, beat());
    for (const index of [8, 30, 60, 110]) {
      const u = index / (trace.xyz.length - 1), taper = Math.min(1, u / .035, (1 - u) / .035);
      for (let j = 0; j < 3; j++) close(trace.xyz[index][j], ks.reduce((s, k) => s + k.v[j] * Math.exp(-.5 * ((u - k.mu) / k.sigma) ** 2) * taper, 0));
    }
    close(trace.summary.peakMagnitude, Math.max(...trace.xyz.map(v => Math.hypot(...v))));
    assert.notEqual(trace.summary.peakMagnitude, Math.max(...ks.map(k => Math.hypot(...k.v))));
    assert.deepEqual(trace.xyz[0], [0, 0, 0]); assert.deepEqual(trace.xyz.at(-1), [0, 0, 0]);
  });
  it('uses independent trapezoidal integrals of sampled I and II for the reported axis', () => {
    const t = sampleActivation(load('sinus'), beat()), dt = t.durationMs / (t.xyz.length - 1);
    const area = (l: 'I' | 'II') => t.leads[l].slice(1).reduce((s, v, i) => s + (v + t.leads[l][i]) * dt / 2, 0);
    const i = area('I'), ii = area('II');
    close(t.summary.frontalAxisDeg!, Math.atan2((2 * ii - i) / Math.sqrt(3), i) * 180 / Math.PI);
    close(project(t.summary.integral).I, i);
  });
  it('preserves all twelve projections and limb identities at samples and interpolated cursor times', () => {
    const t = sampleActivation(load('sinus'), beat());
    for (const ms of [0, .5, 13.3, 45, 89.5, 90, 130]) {
      const frame = activationAt(t, ms), p = frame.leads;
      assert.deepEqual(p, project(frame.xyz)); close(p.III, p.II - p.I); close(p.aVR, -(p.I + p.II) / 2);
      close(p.aVL, p.I - p.II / 2); close(p.aVF, p.II - p.I / 2);
    }
    for (let i = 0; i < t.xyz.length; i++) for (const l of LEADS) close(t.leads[l][i], project(t.xyz[i])[l]);
    assert.throws(() => activationAt(t, NaN), /Instante/);
  });
  it('uses shared absolute time and amplitude scales, not per-source normalization', () => {
    const pair = activationPair(load('sinus'), beat(), 'rbbb');
    assert.equal(pair.a.durationMs, 90); assert.equal(pair.b.durationMs, 150); assert.equal(pair.durationMs, 150);
    assert.deepEqual(activationAt(pair.a, 110).xyz, [0, 0, 0]);
    assert.ok(Math.hypot(...activationAt(pair.b, 110).xyz) > .01);
    for (const t of [pair.a, pair.b]) for (const l of LEADS) assert.ok(Math.max(...t.leads[l].map(Math.abs)) < pair.leadRangeMv);
    for (const plane of ['XYZ', 'XY', 'XZ', 'YZ'] as const) {
      const a = activationPoint([.1, .2, .3], plane, pair.vectorRange), b = activationPoint([.1, .2, .3], plane, pair.vectorRange);
      assert.deepEqual(a, b);
    }
  });
  it('scales every vector and projected lead with QRS amplitude without rotating the sampled axis', () => {
    const c = load('sinus'), a = sampleActivation(c, beat()), b = sampleActivation({ ...c, qrsAmp: c.qrsAmp * 2 }, beat());
    close(a.summary.frontalAxisDeg!, b.summary.frontalAxisDeg!);
    close(b.summary.pathLength, a.summary.pathLength * 2);
    for (const l of LEADS) a.leads[l].forEach((v, i) => close(v * 2, b.leads[l][i]));
  });
  it('does not export the original QRS/QT truth as if it belonged to the alternative', () => {
    const captured: Beat = { ...beat(), qrs: .09, qt: .41, pr: .16, adaptedRR: 1 };
    const pair = activationPair(load('sinus'), captured, 'rbbb');
    assert.deepEqual(pair.b.beat, { time: 1, kind: 'normal', rr: 1 });
    assert.equal(pair.b.durationMs, 150);
    assert.equal(Object.hasOwn(pair.b.beat, 'qt'), false);
    assert.equal(captured.qt, .41);
  });
  it('fractional duration has exact endpoints and the exported cursor matches absolute milliseconds', () => {
    const c = { ...load('sinus'), qrs: 93.7 }, t = sampleActivation(c, beat());
    assert.equal(t.timesMs.at(-1), t.durationMs);
    assert.deepEqual(activationAt(t, t.durationMs).xyz, [0, 0, 0]);
    const pair = activationPair(c, beat(), 'rbbb'), svg = activationSvg(pair, 120);
    assert.match(svg, /Cursor: 120 ms/);
    assert.match(svg, /data-activation-cursor="true" x1="224\.80"/);
    assert.throws(() => activationSvg(pair, NaN), /Instante/);
    assert.throws(() => sampleActivation({ ...c, qrs: NaN }, beat()), /Duración/);
  });
  it('AAI is conducted, complete ventricular block is ventricular, ectopy keeps both actual beat kinds', () => {
    const aai = generateEvents(load('aai'), 10).beats; assert.ok(aai.every(b => b.kind === 'normal'));
    assert.ok(activationOptions(aai[0]).some(([id]) => id === 'rbbb'));
    const escape = generateEvents(load('complete_v'), 10).beats; assert.ok(escape.every(b => b.kind === 'ventricular'));
    assert.ok(activationOptions(escape[0]).some(([id]) => id === 'representative_vt'));
    const pvc = generateEvents(load('pvc'), 10).beats; assert.ok(pvc.some(b => b.kind === 'normal') && pvc.some(b => b.kind === 'pvc'));
    assert.throws(() => activationCandidate(load('sinus'), beat(), 'representative_vt'), /no válida/);
  });
  for (const source of VENTRICULAR_SOURCE_IDS) it(`${source}: explicit alternative changes source without changing rhythm, events or the input`, () => {
    const c = load('pvc'), before = cloneCase(c), profileBefore = JSON.stringify(VENTRICULAR_SOURCES);
    const pair = activationPair(c, beat('pvc'), source), imported = normalizeImportedCase(pair.b.case);
    assert.equal(imported.ventricularSource, source); assert.equal(imported.rhythm, c.rhythm);
    assert.deepEqual(generateEvents(c, 10), generateEvents(imported, 10));
    if (source !== 'representative_pvc') assert.equal(caseContext(imported).preset, undefined);
    assert.deepEqual(c, before); assert.equal(JSON.stringify(VENTRICULAR_SOURCES), profileBefore);
  });
  for (const id of ['vf', 'asystole', 'torsades', 'wpw', 'posterior']) it(`${id} does not invent an eligible static QRS`, () => {
    const c = load(id); assert.ok(activationLimitation(c, generateEvents(c, 10).beats[0]));
    assert.throws(() => sampleActivation(c, beat()));
  });
  it('no-changes control is identical, independent and safely escaped in vector export', () => {
    const c = load('sinus'), pair = activationPair(c, beat(), 'unchanged');
    assert.deepEqual(pair.a, pair.b); assert.notEqual(pair.a.case, pair.b.case);
    pair.b.label = '<script>alert(1)</script>';
    const svg = activationSvg(pair); assert.ok(svg.startsWith('<svg')); assert.ok(!svg.includes('<script>'));
    assert.equal((svg.match(/data-activation-lead=/g) ?? []).length, 12);
    assert.equal((svg.match(/data-activation-plane=/g) ?? []).length, 4);
    assert.match(svg, /No es VCG clínico/);
  });
  it('covers every actual beat kind in the active catalog, marking unsupported domains rather than fabricating a beat', () => {
    let checked = 0, excluded = 0;
    const cata = PRESETS.filter(p => p.strategy !== 'pending'); assert.equal(cata.length, 61);
    for (const preset of cata) {
      const c = fromPreset(preset), events = generateEvents(c, 10);
      if (!events.beats.length) { assert.ok(activationLimitation(c)); excluded++; continue; }
      for (const kind of new Set(events.beats.map(b => b.kind))) {
        const b = events.beats.find(b => b.kind === kind)!;
        if (activationLimitation(c, b)) { excluded++; continue; }
        const t = sampleActivation(c, b);
        assert.equal(t.beat.kind, kind); assert.ok(t.xyz.flat().every(Number.isFinite));
        assert.ok(t.summary.pathLength > 0); assert.ok(t.timesMs.length > 2);
        assert.equal(t.timesMs.at(-1), t.durationMs); checked++;
      }
    }
    assert.ok(checked > 50); assert.ok(excluded >= 5);
  });
});
