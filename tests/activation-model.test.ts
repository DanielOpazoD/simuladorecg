import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { activationAt, activationCandidate, activationLimitation, activationOptions, activationPair, sampleActivation } from '../src/ui/activation-model';
import { activationSvg, activationPoint } from '../src/render/activation';
import { fromPreset, PRESETS, presetById } from '../src/presets/catalog';
import { synthesize } from '../src/engine/signal';
import { antialias } from '../src/engine/filter';
import { generateEvents } from '../src/engine/rhythm';
import { qrsKernels } from '../src/engine/morphology';
import { project, frontal, type Vec } from '../src/engine/leads';
import { LEADS, cloneCase, type Beat, type ECGCase } from '../src/engine/types';
import { VENTRICULAR_SOURCE_IDS, VENTRICULAR_SOURCES } from '../src/engine/ventricular-source';
import { normalizeImportedCase, caseContext } from '../src/presets/case-context';
import {wpwNativeLead} from './support/wpw-native-pulse';
const load = (id: string) => fromPreset(presetById(id)!);
const beat = (kind: Beat['kind'] = 'normal'): Beat => ({ time: 1, rr: 1, kind });
const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

describe('Activation lab: sampled vector, explicit domains and real beat kinds', () => {
  it('sums temporal components, rather than plotting or measuring a polygon of coefficients', () => {
    // A kernel case: normal conduction, BRD and other learned classes have no kernels.
    const c = load('bifascicular'), trace = sampleActivation(c, beat()), ks = qrsKernels(c, beat());
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
    const c = load('sinus'), pair = activationPair(c, beat(), 'rbbb');
    // The learned sinus patient carries its own QRS (F2.3).
    assert.equal(pair.a.durationMs, c.qrs); assert.equal(pair.b.durationMs, 150); assert.equal(pair.durationMs, 150);
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
  for (const id of ['vf', 'asystole', 'torsades', 'posterior']) it(`${id} does not invent an eligible static QRS`, () => {
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
  it('edits only B with the existing transitions, leaving A, source and rhythm untouched', () => {
    const c = load('rbbb'), original = cloneCase(c), event = beat();
    const pair = activationPair(c, event, 'unchanged', { qrsMs: 190, activationModel: 'regional-rbbb-v1' });
    assert.deepEqual(c, original); assert.deepEqual(pair.a.case, original);
    assert.equal(pair.b.case.qrs, 190); assert.equal(pair.b.case.axis, c.axis);
    assert.equal(pair.b.case.activationModel, 'regional-rbbb-v1');
    assert.equal(pair.b.timing.applied, 'regional-rbbb-v1');
    assert.equal(pair.b.durationMs, 190); assert.equal(pair.durationMs, 190);
    assert.equal(caseContext(normalizeImportedCase(pair.b.case)).preset, undefined);
    assert.deepEqual(generateEvents(c, 10), generateEvents(pair.b.case, 10));
    assert.deepEqual(pair.b.beat, { time: 1, kind: 'normal', rr: 1 });
    assert.deepEqual(event, beat());
  });
  it('explicit duration overrides coordinated choice defaults, not the other way around', () => {
    const c = load('sinus'), candidate = activationCandidate(c, beat(), 'rbbb', { qrsMs: 190, activationModel: 'regional-rbbb-v1' });
    assert.equal(candidate.conduction, 'rbbb'); assert.equal(candidate.qrs, 190); assert.equal(candidate.axis, 35);
    assert.equal(activationCandidate(c, beat(), 'rbbb').qrs, 150);
  });
  it('no-op edits and reset recover exactly A, including a legacy case without activationModel', () => {
    const c = load('rbbb'); delete c.activationModel;
    const pair = activationPair(c, beat(), 'unchanged', { qrsMs: c.qrs, activationModel: 'template' });
    assert.deepEqual(pair.a, pair.b); assert.deepEqual(pair.b.case, c);
    activationPair(c, beat(), 'unchanged', { qrsMs: 230, activationModel: 'regional-rbbb-v1' });
    assert.deepEqual(activationCandidate(c, beat(), 'unchanged'), c);
  });
  it('rejects invalid duration or model before any clamping or input mutation', () => {
    const c = load('rbbb'), original = cloneCase(c);
    for (const qrsMs of [NaN, Infinity, -Infinity, 0, 59, 241])
      assert.throws(() => activationPair(c, beat(), 'unchanged', { qrsMs }), /60 y 240/);
    assert.throws(() => activationCandidate(c, beat(), 'unchanged', { activationModel: 'unknown' as never }), /no válido/);
    assert.deepEqual(c, original);
  });
  it('reports the actual regional supports, including fractional endpoints in exported metadata', () => {
    const pair = activationPair(load('rbbb'), beat(), 'unchanged', { qrsMs: 190.5, activationModel: 'regional-rbbb-v1' });
    assert.deepEqual(pair.a.timing.regions, []);
    assert.deepEqual(pair.b.timing.regions, [
      { region: 'septal', startMs: 0, endMs: 30 }, { region: 'lv-main', startMs: 12, endMs: 80 },
      { region: 'lv-terminal', startMs: 42, endMs: 96 }, { region: 'rv-delayed', startMs: 55, endMs: 190.5 },
    ]);
    assert.match(activationSvg(pair), /Modelo A: Latido aprendido \(PTB-XL\) · Modelo B: BRD regional/);
    assert.equal(JSON.parse(JSON.stringify(pair)).b.timing.applied, 'regional-rbbb-v1');
    assert.equal(pair.b.timesMs.at(-1), 190.5);
  });
  it('shows the fixed early clock and delayed RV change rather than globally stretching a regional trace', () => {
    const c = load('rbbb');
    const trace = (qrsMs: number, activationModel: 'template' | 'regional-rbbb-v1') =>
      activationPair(c, beat(), 'unchanged', { qrsMs, activationModel }).b;
    const earlyDifference = (a: ReturnType<typeof trace>, b: ReturnType<typeof trace>) =>
      Math.max(...Array.from({length: 41}, (_, ms) => Math.abs(activationAt(a, ms).leads.II - activationAt(b, ms).leads.II)));
    const short = trace(115, 'regional-rbbb-v1'), long = trace(230, 'regional-rbbb-v1');
    // Isolated unfiltered 1 ms samples: numerical tolerance, not a clinical threshold.
    assert.ok(earlyDifference(short, long) < 1e-8);
    assert.ok(earlyDifference(trace(115, 'template'), trace(230, 'template')) > .01);
    const peakMs = (t: ReturnType<typeof trace>) => {
      let best = 55;
      for (let ms = 56; ms <= t.durationMs; ms++) if (t.leads.V1[ms] > t.leads.V1[best]) best = ms;
      return best;
    };
    assert.ok(peakMs(long) > peakMs(short) + 30);
    assert.deepEqual(activationAt(short, 150).xyz, [0, 0, 0]);
    assert.ok(Math.hypot(...activationAt(long, 150).xyz) > .01);
  });
  it('retains an out-of-domain request but labels the historical fallback, never fake regional supports', () => {
    for (const c of [load('lbbb'), { ...load('rbbb'), overload: 'lv' as const }, { ...load('rbbb'), qrs: 90 }]) {
      const regional = activationPair(c, beat(), 'unchanged', { activationModel: 'regional-rbbb-v1' }).b;
      assert.equal(regional.case.activationModel, 'regional-rbbb-v1');
      assert.equal(regional.timing.applied, 'template'); assert.match(regional.timing.label, /no aplicado/);
      assert.deepEqual(regional.timing.regions, []);
      assert.deepEqual(regional.xyz, sampleActivation(c, beat()).xyz);
    }
  });
  it('one regional case correctly distinguishes a conducted beat from its PVC source and effective minimum', () => {
    const c = { ...load('rbbb'), ectopy: 'pvc' as const, activationModel: 'regional-rbbb-v1' as const };
    assert.equal(sampleActivation(c, beat()).timing.applied, 'regional-rbbb-v1');
    const pair = activationPair(c, beat('pvc'), 'unchanged', { qrsMs: 100 });
    assert.equal(pair.b.case.qrs, 100); assert.equal(pair.b.durationMs, 150);
    assert.equal(pair.b.timing.applied, 'ventricular-source'); assert.match(pair.b.timing.label, /no aplicado/);
    assert.deepEqual(pair.b.timing.regions, []);
  });
  it('covers every actual beat kind in the active catalog, marking unsupported domains rather than fabricating a beat', () => {
    let checked = 0, excluded = 0;
    const cata = PRESETS.filter(p => p.strategy !== 'pending'); assert.equal(cata.length, 63);
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
    assert.ok(checked > 50); assert.equal(excluded, 4); // WPW is now represented; the other four domains remain excluded.
  });
});

// Independent reconstruction of the historical bases and delta, never calling
// wpwDeltaVector(): catches omission/double addition and wrong absolute support.
function kernelOnly(c: ECGCase, b: Beat, ms: number): Vec {
  const u = ms / c.qrs, v: Vec = [0, 0, 0];
  if (u <= 0 || u >= 1) return v;
  for (const k of qrsKernels(c, b)) {
    const g = Math.exp(-.5 * ((u - k.mu) / k.sigma) ** 2) * Math.min(1, u / .035, (1 - u) / .035);
    for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
  }
  return v;
}
describe('WPW lab represents the entire existing vector QRS, without retuning it', () => {
  it('adds exactly the historical delta, with a kernels-only negative control', () => {
    const c = load('wpw'), b = beat(), t = sampleActivation(c, b);
    let omittedMv = 0;
    for (let i = 0; i < t.timesMs.length; i++) {
      const ms = t.timesMs[i], basal = kernelOnly(c, b, ms);
      const direction = frontal(c.axis, .25, .03);
      const gain = ms > 0 && ms < 45 ? c.qrsAmp * Math.sin(Math.PI * ms / 45) : 0;
      const expected = basal.map((v, j) => v + direction[j] * gain) as Vec;
      for (let j = 0; j < 3; j++) close(t.xyz[i][j], expected[j]);
      for (const l of LEADS) close(t.leads[l][i], project(expected)[l]);
      omittedMv = Math.max(omittedMv, Math.abs(t.leads.II[i] - project(basal).II));
    }
    assert.ok(omittedMv > .2, 'Kernels alone must fail to represent the delta');
    assert.equal(t.timing.deltaDurationMs, 45); assert.match(t.timing.note, /ST y T siguen la activación QRS incluida la onda delta/);
    assert.equal(activationLimitation(c, b), null);
  });
  it('preserves a fixed 45 ms delta support at integer and fractional QRS durations', () => {
    for (const qrs of [60, 100, 135, 190, 233.7, 240]) {
      const c = { ...load('wpw'), qrs }, b = beat(), t = sampleActivation(c, b);
      assert.ok(t.timesMs.includes(45)); assert.equal(t.timesMs.at(-1), qrs);
      assert.equal(t.timesMs.length, new Set(t.timesMs).size);
      t.timesMs.forEach((ms, i) => {
        if (i) assert.ok(ms - t.timesMs[i - 1] > 0 && ms - t.timesMs[i - 1] <= 1 + 1e-12);
        if (ms >= 45) for (let j = 0; j < 3; j++) close(t.xyz[i][j], kernelOnly(c, b, ms)[j]);
      });
      const at = t.timesMs.indexOf(45), end = t.timesMs[at + 1], mid = (45 + end) / 2;
      const a = kernelOnly(c, b, 45), z = kernelOnly(c, b, end);
      activationAt(t, mid).xyz.forEach((v, j) => close(v, (a[j] + z[j]) / 2));
      assert.deepEqual(activationAt(t, qrs).xyz, [0, 0, 0]);
    }
    assert.throws(() => sampleActivation({ ...load('wpw'), qrs: 30 }, beat()), /delta no cabe/);
  });
  it('uses actual nonuniform timestamps for interpolation and integration, including the inserted endpoint', () => {
    const t = sampleActivation({ ...load('wpw'), qrs: 133.7 }, beat());
    for (let i = 0; i < t.timesMs.length - 1; i++) {
      const ms = (t.timesMs[i] + t.timesMs[i + 1]) / 2;
      activationAt(t, ms).xyz.forEach((v, j) => close(v, (t.xyz[i][j] + t.xyz[i + 1][j]) / 2));
    }
    const area = (lead: 'I' | 'II') => t.timesMs.slice(1).reduce((sum, ms, i) =>
      sum + (t.leads[lead][i] + t.leads[lead][i + 1]) / 2 * (ms - t.timesMs[i]), 0);
    close(project(t.summary.integral).I, area('I'));
    close(t.summary.frontalAxisDeg!, Math.atan2((2 * area('II') - area('I')) / Math.sqrt(3), area('I')) * 180 / Math.PI);
  });
  it('scales delta and kernels together under gain and low-voltage attenuation', () => {
    const c = load('wpw'), a = sampleActivation(c, beat());
    for (const qrsAmp of [.1, .5, 2, 3]) for (const electrolyte of ['none', 'lowvoltage'] as const) {
      const b = sampleActivation({ ...c, qrsAmp, electrolyte }, beat()), factor = qrsAmp * (electrolyte === 'lowvoltage' ? .38 : 1);
      for (const l of LEADS) a.leads[l].forEach((v, i) => close(b.leads[l][i], v * factor));
      close(a.summary.frontalAxisDeg!, b.summary.frontalAxisDeg!);
    }
  });
  it('matches the actual 500 Hz isolated ECG for an explicitly aligned onset after the existing acquisition FIR', () => {
    // PR 90 ms places the native onset on the sampling lattice. The legacy
    // compact-support regression now separately covers fractional onsets and
    // excludes historical pre-onset extrapolation before the acquisition FIR.
    const c: ECGCase = { ...load('wpw'), pr: 90, hr: 60, variability: 0, filter: 'off', pAmp: 0, tAmp: 0, st: 0 };
    const signal = synthesize(c, 10), b = signal.events.beats.find(x => x.time > 2)!;
    const t = sampleActivation(c, b);
    for (const l of LEADS) {
      const raw = new Float64Array(1000);
      for (let ms = 0; ms <= 135; ms++) raw[200 + ms] = t.leads[l][ms];
      const filtered = antialias(raw, 1000);
      // Independent native-lattice reconstruction isolates the newly represented
      // secondary ST; the lab itself still previews ventricular activation only.
      const withST = wpwNativeLead(c,l,10,false,true), deltaOnly = wpwNativeLead(c,l);
      const secondaryST = (index:number) => withST[index]-deltaOnly[index];
      for (let ms = -50; ms <= 190; ms += 2)
        close(signal.leads[l][Math.round((b.time + ms / 1000) * signal.fs)], filtered[200 + ms] + secondaryST(Math.round((b.time + ms / 1000) * signal.fs)), 1e-9);
    }
  });
  it('never injects delta into a PVC, escape or paced event even inside a WPW case', () => {
    const c = load('wpw');
    for (const kind of ['pvc', 'ventricular', 'paced'] as const) {
      const a = sampleActivation(c, beat(kind)), b = sampleActivation({ ...c, conduction: 'normal' }, beat(kind));
      assert.deepEqual(a.xyz, b.xyz); assert.equal(a.timing.deltaDurationMs, null);
      assert.equal(a.timing.applied, 'ventricular-source');
    }
    assert.equal(sampleActivation(load('sinus'), beat()).timing.deltaDurationMs, null);
  });
  it('coordinates PR/QRS via existing controls without pretending the captured onset is a new event prediction', () => {
    const c = load('sinus'), saved = cloneCase(c), originalEvents = generateEvents(c, 10);
    const pair = activationPair(c, originalEvents.beats[0], 'wpw'), next = generateEvents(pair.b.case, 10);
    assert.equal(pair.b.case.pr, 100); assert.equal(pair.b.case.qrs, 135); assert.equal(pair.b.case.conduction, 'wpw');
    assert.equal(pair.b.case.rhythm, c.rhythm); assert.deepEqual(pair.a.case, saved); assert.deepEqual(c, saved);
    close(next.beats[0].time - originalEvents.beats[0].time, (100 - c.pr) / 1000);
    assert.equal(pair.b.beat.time, originalEvents.beats[0].time); // Explicitly captured, not recalculated.
    assert.equal(Object.hasOwn(pair.b.beat, 'qt'), false);
    assert.equal(caseContext(normalizeImportedCase(pair.b.case)).preset, undefined);
    assert.deepEqual(activationCandidate(c, beat(), 'unchanged'), saved);
  });
  it('keeps delta in historical fallback and exports its provenance rather than fictitious regional supports', () => {
    const c = load('wpw'), pair = activationPair(c, beat(), 'normal');
    assert.equal(pair.a.timing.deltaDurationMs, 45); assert.equal(pair.b.timing.deltaDurationMs, null);
    const regional = sampleActivation({ ...c, activationModel: 'regional-rbbb-v1' }, beat());
    assert.deepEqual(regional.xyz, pair.a.xyz); assert.equal(regional.timing.applied, 'template');
    assert.match(regional.timing.label, /no aplicado/); assert.deepEqual(regional.timing.regions, []);
    assert.match(regional.timing.note, /Delta sintética adicional/);
    assert.match(activationSvg(pair, 20), /Delta incluida · A: 45 ms · B: 0 ms/);
    assert.equal(JSON.parse(JSON.stringify(pair)).a.timing.deltaDurationMs, 45);
  });
});

// A valid QRS-only preview is not a successful full ECG validation.
describe('Activation application domain boundary', () => {
  it('keeps a drawable alternative distinct from a rejected full synthesis, without changing A', () => {
    const c: ECGCase = { ...load('sinus'), hr: 60, variability: 0, filter: 'off',
      ischemia: 'anterior', phase: 'hyperacute', electrolyte: 'hyperkalemia', st: 1 };
    const original = cloneCase(c), signal = synthesize(c, 10), captured = signal.events.beats[1];
    const pair = activationPair(c, captured, 'rbbb');
    assert.ok(pair.b.xyz.some(v => Math.hypot(...v) > .1));
    assert.throws(() => synthesize(pair.b.case, 10), /fuera de alcance/);
    assert.deepEqual(c, original); assert.deepEqual(pair.a.case, original);
    assert.deepEqual(synthesize(c, 10), signal);
    // A corrected alternative goes through the SAME whole-ECG domain checks.
    const corrected = activationPair(c, captured, 'normal', { qrsMs: 100 });
    assert.doesNotThrow(() => synthesize(corrected.b.case, 10));
  });
});
