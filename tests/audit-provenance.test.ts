import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { measure } from '../src/engine/measure';
import { analyzeSamples } from '../src/engine/sample-analysis';
import { attachMeasurementSupport } from '../src/engine/measurement-support';
import { auditMeasurement } from '../src/engine/analysis/model-audit';
import { fromPreset, presetById } from '../src/presets/catalog';

const example = () => {
  const signal = synthesize(fromPreset(presetById('sinus')!), 10);
  return { signal, raw: measure(signal) };
};

describe('Sample analysis -> model audit: rejections are not erased or reinstated', () => {
  it('preserves exact numbers already withdrawn by candidate-specific support', () => {
    const { signal, raw } = example();
    const supported = attachMeasurementSupport(raw, { requiresReview: true, challengedPeaksSeconds: [] });
    expect(Object.keys(supported.rejected!)).toHaveLength(4);
    const audited = auditMeasurement(signal, supported);
    expect(audited.rejected).toEqual(supported.rejected);
    expect(audited.support).toEqual(supported.support);
    expect(audited.beats).toEqual(raw.beats);
    expect(audited.detectedPeaks).toEqual(raw.detectedPeaks);
    for (const key of ['pr', 'qrs', 'qt', 'axis'] as const) {
      expect(audited[key]).toBeNull();
      expect(audited.evidence[key].reason).toBe(supported.evidence[key].reason);
    }
    expect(audited.hr).toBe(supported.hr);
  });

  it('adds a downstream rejection without discarding the earlier interval rejection', () => {
    const { signal, raw } = example();
    const upstream = { ...raw, qt: null, rejected: { qt: raw.qt! },
      evidence: { ...raw.evidence, qt: { ...raw.evidence.qt, status: 'unavailable' as const, reason: 'Sample-only T rejection' } } };
    upstream.beats = structuredClone(raw.beats);
    upstream.beats[2].onset += .06;
    upstream.beats[2].offset += .06;
    const audited = auditMeasurement(signal, upstream);
    expect(audited.rejected!.qt).toBe(raw.qt);
    expect(audited.rejected!.qrs).toBe(raw.qrs);
    expect(audited.evidence.qt.reason).toBe('Sample-only T rejection');
    expect(audited.qtc.fridericia).toBeNull();
  });

  it('propagates a previously rejected ventricular rate, without promoting dependent intervals', () => {
    const { signal, raw } = example();
    raw.rejected = { hr: raw.hr! }; raw.hr = null;
    raw.evidence.hr = { ...raw.evidence.hr, status: 'unavailable', reason: 'Rate already rejected' };
    const audited = auditMeasurement(signal, raw);
    expect(audited.rejected!.hr).toBeGreaterThan(0);
    for (const key of ['pr', 'qrs', 'qt', 'axis'] as const) expect(audited[key]).toBeNull();
    expect(audited.instantHr).toBeNull();
  });

  it('does not mutate either the upstream result or the visible twelve-lead signal', () => {
    const { signal, raw } = example();
    const supported = attachMeasurementSupport(raw, { requiresReview: true, challengedPeaksSeconds: [] });
    const original = structuredClone(supported), samples = structuredClone(signal.leads);
    const audited = auditMeasurement(signal, supported);
    audited.rejected!.qrs = 999;
    expect(supported).toEqual(original);
    expect(signal.leads).toEqual(samples);
  });

  it.each(['sinus', 'pvc', 'complete', 'complete_v'])('re-auditing %s preserves the rejection record', id => {
    const signal = synthesize(fromPreset(presetById(id)!), 10);
    const first = auditMeasurement(signal, analyzeSamples(signal));
    const second = auditMeasurement(signal, first);
    expect(second.rejected).toEqual(first.rejected);
    for (const key of ['hr', 'pr', 'qrs', 'qt', 'axis'] as const) expect(second[key]).toBe(first[key]);
    expect(second.beats).toEqual(first.beats);
  });
});
