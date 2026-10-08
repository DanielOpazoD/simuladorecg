import { describe, expect, it } from 'vitest';
import { frontal } from '../src/engine/leads';
import { secondaryDiscordanceDot } from '../src/engine/secondary-repolarization';

const compare = (a: number, b: number, aq = 1, at = 1, zq = 0, zt = 0) =>
  secondaryDiscordanceDot(frontal(a, aq, zq), frontal(b, at, zt));

describe('frontal QRS/repolarization comparison uses orthogonal coordinates', () => {
  it('does not misclassify the sign of an obtuse frontal angle', () => {
    expect(compare(0, 100)).toBeLessThan(0);
    expect(compare(0, 100)).toBeCloseTo(Math.cos(100 * Math.PI / 180), 12);
  });
  it.each([0, 30, 60, 90, 150])('orthogonality is independent of common rotation %s°', angle => {
    expect(Math.abs(compare(angle, angle + 90))).toBeLessThan(1e-12);
  });
  it('matches an independent cosine oracle across direction, gain and projection Z', () => {
    for (let a = -180; a < 180; a += 15) for (let b = -180; b < 180; b += 15) {
      for (const [aq, at, zq, zt] of [[1, 1, 0, 0], [0.2, 1.7, -0.4, 0.8], [2, 0.1, 0.9, -0.3]]) {
        const value = compare(a, b, aq, at, zq, zt);
        expect(Math.abs(value - aq * at * Math.cos((a-b) * Math.PI / 180))).toBeLessThan(1e-12);
        expect(Math.abs(value - compare(b, a, at, aq, zt, zq))).toBeLessThan(1e-12);
      }
    }
  });
  it('preserves zero and sign reversal without normalization or a cutoff', () => {
    expect(secondaryDiscordanceDot([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(compare(20, 20, 2, 0.5)).toBeCloseTo(1, 12);
    expect(compare(20, 200, 2, 0.5)).toBeCloseTo(-1, 12);
    expect(compare(0, 0, 1e-12, 1e-12)).toBeGreaterThan(0);
  });
});
