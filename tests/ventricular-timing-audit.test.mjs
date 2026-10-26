import { beforeAll, describe, expect, it } from 'vitest';
import { energyFeatures, measureFinalBeat, loadEngine, characterize, inactiveQtcControl, softwareControlsPass, protocol } from '../scripts/audit-ventricular-timing.mjs';

describe('Sample timing audit instrument falsification', () => {
  const fs = 500;
  const pulse = (shift = 0, gain = 1) => Float64Array.from({length: 500}, (_, i) =>
    gain * Math.max(0, 1 - Math.abs(i / fs - .35 - shift) / .05));
  it('detects a known translation independently of generator event durations', () => {
    const a = energyFeatures([pulse()], fs, 0, 1), b = energyFeatures([pulse(.08)], fs, 0, 1);
    expect((b.centroidSeconds - a.centroidSeconds) * 1000).toBeCloseTo(80, 8);
    expect((b.peakSeconds - a.peakSeconds) * 1000).toBeCloseTo(80, 8);
  });
  it('separates gain from timing and detects the energy change', () => {
    const a = energyFeatures([pulse()], fs, 0, 1), b = energyFeatures([pulse(0, 3)], fs, 0, 1);
    expect(b.centroidSeconds).toBeCloseTo(a.centroidSeconds, 12);
    expect(b.energyMv2Seconds / a.energyMv2Seconds).toBeCloseTo(9, 10);
  });
  it('removes a declared DC baseline without manufacturing a timing result', () => {
    const flat = new Float64Array(500).fill(2);
    expect(energyFeatures([flat], fs, 0, 1, [2])).toBeNull();
    const elevated = pulse().map(x => x + 2);
    expect(energyFeatures([elevated], fs, 0, 1, [2]).centroidSeconds).toBeCloseTo(.35, 12);
  });
  it('rejects invalid, nonfinite and incomplete inputs', () => {
    expect(() => energyFeatures([pulse()], 0, 0, 1)).toThrow();
    expect(() => energyFeatures([pulse()], fs, 0, 2)).toThrow();
    const broken = pulse(); broken[100] = NaN;
    expect(() => energyFeatures([broken], fs, 0, 1)).toThrow('Nonfinite');
    expect(() => energyFeatures([new Float64Array(500).fill(1e200)], fs, 0, 1)).toThrow('Nonfinite measurement accumulation');
  });
  it.each([
    [{time: .4, qrs: -.15}, undefined], [{time: .4, qrs: 0}, undefined],
    [{time: NaN, qrs: .15}, undefined], [{time: .4, qrs: Infinity}, undefined],
    [{time: .4, qrs: .15}, {time: NaN}], [{time: .4, qrs: .15}, {}],
  ])('rejects malformed event references before computing a plausible sample feature', (beat, next) => {
    const signal = {duration: 2, fs, leads: Object.fromEntries(protocol.sampleMeasurement.leads.map(l => [l, new Float64Array(1000)]))};
    expect(() => measureFinalBeat(signal, beat, next)).toThrow('Invalid event reference');
  });
  it('does not consult QT to measure a fixed post-J window', () => {
    const samples = Float64Array.from({length: 1000}, (_, i) => Math.max(0, 1 - Math.abs(i / fs - .8) / .05));
    const signal = {duration: 2, fs, leads: Object.fromEntries(protocol.sampleMeasurement.leads.map(l => [l, samples]))};
    const a = measureFinalBeat(signal, {time: .4, qrs: .15});
    const b = measureFinalBeat(signal, {time: .4, qrs: .15, qt: NaN});
    expect(a).toEqual(b); expect(a.centroidAfterJMs).toBeCloseTo(250, 8);
  });
  it('retains overlapping windows as exclusions instead of inventing a feature', () => {
    const signal = {duration: 2, fs, leads: Object.fromEntries(protocol.sampleMeasurement.leads.map(l => [l, new Float64Array(1000)]))};
    expect(measureFinalBeat(signal, {time: .4, qrs: .15, qt: .45}, {time: .9})).toEqual({excluded: 'fixed window reaches next QRS'});
    expect(measureFinalBeat(signal, {time: .4, qrs: .15, qt: .45}, {time: 1.5})).toEqual({excluded: 'zero or negligible post-J energy'});
  });
});

describe('Final production sample characterization and negative routes', () => {
  let engine;
  beforeAll(async () => { engine = await loadEngine(); });
  const family = name => protocol.families.find(f => f.preset === name);
  it('retains synthesis failures and makes them software failures, while excluded valid windows remain coverage gaps', () => {
    const broken = {...engine, synthesize: () => {throw Error('injected synthesis failure');}};
    const cell = characterize(broken, family('vt'), 91, 60);
    const control = inactiveQtcControl(broken, family('vt'), 91);
    expect(cell).toMatchObject({status: 'rejected', reason: 'injected synthesis failure'});
    expect(control).toMatchObject({status: 'rejected', reason: 'injected synthesis failure', pass: false, maxDifferenceMv: null});
    const validWithoutCoverage = characterize(engine, family('vt'), 91, 140);
    expect(validWithoutCoverage.summary.measured).toBe(0);
    expect(softwareControlsPass(true, [validWithoutCoverage], [{pass:true}], [{pass:true}])).toBe(true);
    expect(softwareControlsPass(true, [validWithoutCoverage, cell], [{pass:true}], [{pass:true}])).toBe(false);
    expect(softwareControlsPass(true, [validWithoutCoverage], [control], [{pass:true}])).toBe(false);
  });
  it('retains malformed instrument inputs and invalid case setup as rejected cells', () => {
    const broken = {...engine, synthesize: (...args) => {
      const signal = engine.synthesize(...args);
      signal.events.beats[0].qrs = -.15;
      return signal;
    }};
    expect(characterize(broken, family('vt'), 91, 60)).toMatchObject({status:'rejected', reason:'Invalid event reference'});
    expect(characterize({...engine, presetById: () => undefined}, family('vt'), 91, 60)).toMatchObject({status:'rejected', reason:'Missing preset vt'});
  });
  it('has measurable rate-associated movement for the same ventricular latent focus', () => {
    const slow = characterize(engine, family('idioventricular'), 91, 40);
    const fast = characterize(engine, family('idioventricular'), 91, 75);
    expect(slow.status).toBe('observed'); expect(fast.status).toBe('observed');
    expect(slow.patient).toEqual(fast.patient);
    expect(slow.summary.measured).toBeGreaterThan(0); expect(fast.summary.measured).toBeGreaterThan(0);
    expect(slow.summary.medianCentroidAfterJMs - fast.summary.medianCentroidAfterJMs).toBeGreaterThan(2);
    expect(slow.samplesSha256).not.toBe(fast.samplesSha256);
  });
  it.each(['idioventricular', 'vt', 'complete_v', 'vvi'])('%s ignores inactive requested QTc in the final samples', name => {
    const control = inactiveQtcControl(engine, family(name), 91);
    expect(control.maxDifferenceMv).toBeLessThanOrEqual(1e-10); expect(control.pass).toBe(true);
  });
  it('PVC histories change while own duration is preserved; sample features are not forced identical', () => {
    const a = characterize(engine, family('pvc'), 17, 60, {coupling: .45, variability: 0});
    const b = characterize(engine, family('pvc'), 17, 60, {coupling: .7, variability: .15});
    expect(a.summary.adaptedRrRangeSeconds).not.toBe(b.summary.adaptedRrRangeSeconds);
    expect(a.observations[0].generator.sttMs).toBeCloseTo(b.observations[0].generator.sttMs, 10);
    expect(a.samplesSha256).not.toBe(b.samplesSha256);
    expect(a.summary.measured).toBeGreaterThan(0); expect(b.summary.measured).toBeGreaterThan(0);
  });
  it('reports zero high-rate fixed-window coverage instead of treating it as a pass', () => {
    const row = characterize(engine, family('vt'), 91, 140);
    expect(row.status).toBe('observed'); expect(row.summary.events).toBeGreaterThan(0);
    expect(row.summary.measured).toBe(0); expect(row.summary.medianCentroidAfterJMs).toBeNull();
    expect(row.observations.every(o => o.samples.excluded)).toBe(true);
  });
  it('discloses the ectopic raw RR field in its builder unit, without pretending it is a clinical RR trajectory', () => {
    const row = characterize(engine, family('vvi'), 91, 60);
    expect(row.patient.rawFieldNamedRrMs).toBeGreaterThan(.1);
    expect(row.patient.rawFieldNamedRrMs).toBeLessThan(10);
    expect(row.patient.rrUnitFromBuilder).toBe('seconds');
    expect(row.patient.rrIsLongitudinalHistory).toBe(false); expect(row.clinicalValidation).toBe(false);
  });
});
