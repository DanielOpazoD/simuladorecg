import { describe, it, expect } from 'vitest';
import { morphologyMetrics, sampleAt, type Windows } from './support/morphology-metrics';
import { wave, QRS, T, BIPHASIC_T } from './fixtures';
const windows: Windows = { baseline: [.1, .15], qrs: [.36, .45], t: [.52, .76] };
const fixture = (fs: number, scale = 1, offset = 0, biphasic = false) => Float64Array.from({length: fs}, (_, i) => offset + scale * (wave(i/fs, QRS) + wave(i/fs, biphasic ? BIPHASIC_T : T)));
describe('Independent morphology metrology', () => {
  it.each([250, 500, 1000])('measures analytic area/FWHM at %i Hz', fs => {
    const m = morphologyMetrics(fixture(fs), fs, windows);
    expect(m.tPeakMv).toBeCloseTo(.3, 2);
    expect(m.tSignedAreaMvS).toBeCloseTo(.036, 4);
    // One-sample tolerance: the analytic apex can fall between sample times.
    expect(Math.abs(m.tFwhmMs! - 120)).toBeLessThanOrEqual(1000/fs);
    expect(m.tSymmetry).toBeCloseTo(.145/.095, 1);
    // Off-grid J lies on the interpolated corner, bounded by terminal QRS slope.
    expect(Math.abs(m.jMv)).toBeLessThanOrEqual((.28/.036)/(2*fs) + 1e-12);
  });
  it('preserves voltages with DC offset and changes sign without changing width', () => {
    const a = morphologyMetrics(fixture(1000), 1000, windows), b = morphologyMetrics(fixture(1000, -1, 1.7), 1000, windows);
    expect(b.tPeakMv).toBeCloseTo(-a.tPeakMv, 12);
    expect(b.tSignedAreaMvS).toBeCloseTo(-a.tSignedAreaMvS, 12);
    expect(b.tFwhmMs).toBeCloseTo(a.tFwhmMs!, 10);
  });
  it('does not cancel the absolute area of a biphasic wave', () => {
    const m = morphologyMetrics(fixture(1000, 1, 0, true), 1000, {...windows, t: [.52, .84]});
    expect(m.tAbsoluteAreaMvS).toBeGreaterThan(Math.abs(m.tSignedAreaMvS));
  });
  it('abstains on absent T and tiny QRS denominators', () => {
    const m = morphologyMetrics(new Float64Array(1000), 1000, windows);
    expect(m.tSymmetry).toBeNull(); expect(m.tFwhmMs).toBeNull(); expect(m.tToQrs).toBeNull();
  });
  it('rejects missing, non-finite, overlapping and reversed windows', () => {
    const a = fixture(1000); a[600] = NaN;
    expect(() => morphologyMetrics(a, 1000, windows)).toThrow();
    expect(() => morphologyMetrics(fixture(1000), 1000, {...windows, t: [.8, 1.2]})).toThrow();
    expect(() => morphologyMetrics(fixture(1000), 1000, {...windows, t: [.4, .8]})).toThrow();
    expect(() => morphologyMetrics(fixture(1000), 1000, {...windows, baseline: [.2, .1]})).toThrow();
    expect(() => sampleAt(a, 0, .2)).toThrow();
  });
  it('interpolates an off-grid sample in physical units', () => expect(sampleAt([0, 1, 2], 100, .005)).toBe(.5));
});
