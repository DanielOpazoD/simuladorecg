import { describe, it, expect } from 'vitest';
import { reconcileTEnds } from '../src/engine/reconcile-t-end';
import { measure } from '../src/engine/measure';
import { fixture } from './fixtures';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';

describe('Numerical terminal-return reconciliation', () => {
  it('repairs an overlong return and preserves the original endpoints for audit', () => {
    const signal = fixture(), m = measure(signal), original = structuredClone(m.beats);
    for (const b of m.beats) { b.tEnd = b.onset + .65; b.qt = 650; }
    const changed = reconcileTEnds(signal, m.beats, m.detectedPeaks, m.window);
    expect(changed).toBeGreaterThan(3);
    for (let i = 0; i < m.beats.length; i++) {
      const b = m.beats[i];
      expect(b.onset).toBe(original[i].onset); expect(b.offset).toBe(original[i].offset);
      expect(b.peak).toBe(original[i].peak); expect(b.pr).toBe(original[i].pr);
      if (b.terminalRevision) {
        expect(b.terminalRevision.previousQt).toBe(650);
        expect(b.tEnd! % 1).toBeCloseTo(.76, 2);
        expect(b.qt).toBeCloseTo((b.tEnd! - b.onset) * 1000, 10);
        expect(b.tTangentEnd).toBeNull();
      }
    }
  });
  it('does not extend an existing earlier boundary toward a later lobe', () => {
    const signal = fixture(), m = measure(signal);
    for (const b of m.beats) { b.tEnd = b.onset + .25; b.qt = 250; }
    const before = structuredClone(m.beats);
    expect(reconcileTEnds(signal, m.beats, m.detectedPeaks, m.window)).toBe(0);
    expect(m.beats).toEqual(before);
  });
  it('does not fill missing endpoints with longer values than the existing record center', () => {
    const signal = fixture(), m = measure(signal);
    for (let i = 0; i < m.beats.length; i++) {
      m.beats[i].tEnd = i < 3 ? m.beats[i].onset + .25 : null;
      m.beats[i].qt = i < 3 ? 250 : null;
    }
    const before = structuredClone(m.beats);
    expect(reconcileTEnds(signal, m.beats, m.detectedPeaks, m.window)).toBe(0);
    expect(m.beats).toEqual(before);
  });
  it('recovers a numerical tachycardia QT while requiring review', () => {
    const s = synthesize(fromPreset(presetById('tachy')!), 10), m = measure(s);
    expect(m.qt).not.toBeNull(); expect(Math.abs(m.qt! - s.truth.qt!)).toBeLessThan(10);
    expect(m.evidence.qt.status).toBe('review');
    expect(m.beats.some(b => b.terminalRevision?.previousEnd === null)).toBe(true);
  });
  it('preserves the hypokalemia endpoint instead of extending QT into U', () => {
    const c = {...fromPreset(presetById('hypok')!), filter: 'off' as const};
    const s = synthesize(c, 10), m = measure(s);
    expect(m.qt).not.toBeNull(); expect(Math.abs(m.qt! - s.truth.qt!)).toBeLessThan(15);
  });
  it('does not read model information or confidence and leaves samples untouched', () => {
    const s = fixture(), m = measure(s), before = structuredClone(s.leads);
    for (const key of ['events', 'truth', 'diagnosis']) Object.defineProperty(s, key, {get() {throw Error('Forbidden model input');}});
    reconcileTEnds(s, m.beats, m.detectedPeaks, m.window);
    expect(s.leads).toEqual(before);
  });
});
