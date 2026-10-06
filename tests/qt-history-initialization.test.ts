import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE, cloneCase, type AV, type Beat } from '../src/engine/types';
import { generateEvents } from '../src/engine/rhythm';
import { assignRepolarization, nominalVentricularRR, adaptRR } from '../src/engine/repolarization';

describe('QT history starts from declared steady state, not an unobserved preceding beat', () => {
  it.each(['two_one','high'] as AV[])('keeps regular %s conduction stationary from the first event', av => {
    const c = { ...cloneCase(DEFAULT_CASE), av, hr: 80, variability: 0 };
    const events = generateEvents(c, 30);
    assignRepolarization(c, events.beats);
    const rr = nominalVentricularRR(c);
    expect(events.beats[0].adaptedRR).toBe(rr);
    for (const beat of events.beats) expect(beat.adaptedRR).toBeCloseTo(rr, 12);
  });
  it('ignores the unknown first predecessor but adapts to each subsequent real interval', () => {
    const c = { ...cloneCase(DEFAULT_CASE), hr: 60 };
    const beats: Beat[] = [{time:.4,kind:'normal',rr:.4},{time:1.2,kind:'normal',rr:.8}];
    assignRepolarization(c, beats);
    expect(beats[0].adaptedRR).toBe(1);
    expect(beats[1].adaptedRR).toBe(adaptRR(1,.8,.8));
  });
});
