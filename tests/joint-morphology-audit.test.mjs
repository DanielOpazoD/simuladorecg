import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { measureBeat, checkPerturbation, summarize, correlation } from '../scripts/audit-joint-morphology.mjs';

const fs = 1000, beat = { time: 0.2, qrs: 0.1, qt: 0.5 };
const triangle = (t, center, halfWidth, amp) => Math.max(0, 1 - Math.abs(t - center) / halfWidth) * amp;
const fixture = () => Float64Array.from({ length: 1000 }, (_, i) => triangle(i / fs, 0.25, 0.05, 1) + triangle(i / fs, 0.5, 0.1, 0.3));

describe('independent final-sample morphology instrument', () => {
  it('measures analytic amplitude, signed area, milliseconds and ratios without production analyzer', () => {
    const r = measureBeat(fixture(), fs, beat);
    expect(r.status).toBe('measured');
    expect(r.qrsPeakToPeakMv).toBeCloseTo(1, 10);
    expect(r.qrsAreaMvSeconds).toBeCloseTo(0.05, 10);
    expect(r.repolarizationPeakMv).toBeCloseTo(0.3, 10);
    expect(r.repolarizationPeakAfterJMs).toBeCloseTo(200, 10);
    expect(r.repolarizationHalfHeightWidthMs).toBeCloseTo(100, 10);
    expect(r.repolarizationToQrsPeakToPeak).toBeCloseTo(0.3, 10);
    expect(r.j60TOverlap).toBe('unknown-no-independent-T-onset');
  });
  it.each([['dc', x => x + 0.3], ['scale', x => x * 1.7], ['polarity', x => -x]])('checks mathematical %s invariants', (kind, f) => {
    const samples = fixture();
    expect(checkPerturbation(measureBeat(samples, fs, beat), measureBeat(samples.map(f), fs, beat), kind).passed).toBe(true);
  });
  it('negative-control checker detects corrupted metrics', () => {
    const r = measureBeat(fixture(), fs, beat);
    expect(checkPerturbation(r, { ...r, qrsAreaMvSeconds: r.qrsAreaMvSeconds * 1000 }, 'dc').passed).toBe(false);
  });
  it('rejects nonfinite reference metrics rather than passing NaN comparisons', () => {
    const r = measureBeat(fixture(), fs, beat);
    for (const bad of [NaN, Infinity, undefined]) {
      const result = checkPerturbation({ ...r, qrsAreaMvSeconds: bad }, r, 'dc');
      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual({ key: 'qrsAreaMvSeconds', reason: 'nonfinite-reference-metric' });
    }
  });
  it('does not turn zero QRS into a valid ratio', () => {
    const samples = fixture(); samples.fill(0, 200, 301);
    const r = measureBeat(samples, fs, beat);
    expect(r.qrsPeakToPeakMv).toBe(0);
    expect(r.repolarizationToQrsPeakToPeak).toBeNull();
    expect(r.repolarizationToSignedQrs).toBeNull();
    expect(r.j60ToQrsPeakToPeak).toBeNull();
    expect(r.reasons).toContain('qrs-below-ratio-support-floor');
  });
  it('suppresses ratios and width for unsupported repolarization', () => {
    const samples = fixture(); samples.fill(0, 340, 701);
    const r = measureBeat(samples, fs, beat);
    expect(r.repolarizationToQrsPeakToPeak).toBeNull();
    expect(r.repolarizationHalfHeightWidthMs).toBeNull();
    expect(r.repolarizationPeakAfterJMs).toBeNull();
    expect(r.reasons).not.toContain('repolarization-window-extremum-at-or-before-j60');
  });
  it('retains unavailable width when a half-height crossing is outside the event window', () => {
    const r = measureBeat(fixture(), fs, { ...beat, qt: 0.32 });
    expect(r.repolarizationHalfHeightWidthMs).toBeNull();
    expect(r.reasons).toContain('half-height-crossing-outside-window');
  });
  it.each([
    ['truncated-support', () => fixture().slice(0, 500), beat, Infinity],
    ['truncated-support', fixture, { ...beat, time: 0.02 }, Infinity],
    ['invalid-event-reference', fixture, { time: 0.2, qrs: 0.1 }, Infinity],
    ['invalid-event-reference', fixture, { ...beat, qt: NaN }, Infinity],
    ['overlapping-next-beat-support', fixture, beat, 0.72],
    ['nonfinite-sample', () => { const a = fixture(); a[450] = NaN; return a; }, beat, Infinity],
  ])('reports %s with null rather than zero', (reason, samples, reference, next) => {
    const r = measureBeat(samples(), fs, reference, next);
    expect(r.status).toBe('excluded'); expect(r.reasons).toContain(reason); expect(r.qrsPeakToPeakMv).toBeNull();
  });
  it('flags early repolarization extremum without declaring J60 to be ST-only', () => {
    const samples = Float64Array.from({ length: 1000 }, (_, i) => triangle(i / fs, 0.25, 0.05, 1) + triangle(i / fs, 0.35, 0.03, 0.3));
    const r = measureBeat(samples, fs, beat);
    expect(r.reasons).toContain('repolarization-window-extremum-at-or-before-j60');
    expect(r.j60TOverlap).toMatch(/^unknown/);
  });
  it('nulls J60 when beyond event QT rather than sampling another phase', () => {
    const r = measureBeat(fixture(), fs, { ...beat, qt: 0.155 });
    expect(r.j60Mv).toBeNull(); expect(r.reasons).toContain('j60-beyond-event-qt');
  });
  it('distinguishes missing and zero, and refuses undersupported or constant correlations', () => {
    expect(summarize([null, 0, 2])).toMatchObject({ supported: 2, missing: 1, median: 1 });
    expect(correlation([{ a: 1, b: 2 }], 'a', 'b').r).toBeNull();
    expect(correlation(Array.from({ length: 6 }, () => ({ a: 1, b: 2 })), 'a', 'b').reason).toBe('constant-variable');
    expect(correlation(Array.from({ length: 6 }, (_, i) => ({ a: i, b: -2 * i })), 'a', 'b').r).toBeCloseTo(-1, 10);
  });
  it('keeps the protocol explicit about synthetic exposure and unavailable clinical gate', () => {
    const p = JSON.parse(readFileSync(new URL('../benchmarks/fidelity/joint-morphology-protocol.json', import.meta.url), 'utf8'));
    expect(new Set(p.seeds).size).toBe(12);
    expect(p.acceptance.modelCorrection).toContain('Not eligible');
    expect(p.windows.anchor).toContain('not annotations');
  });
});
