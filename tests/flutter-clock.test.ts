import { describe, it, expect } from 'vitest';
import { DEFAULT_CASE, cloneCase } from '../src/engine/types';
import { generateEvents } from '../src/engine/rhythm';
import { assignRepolarization } from '../src/engine/repolarization';
import { synthesize } from '../src/engine/signal';

const flutter = (hr: number, ratio = 2) => ({ ...cloneCase(DEFAULT_CASE), rhythm: 'flutter' as const,
  atrialRate: 300, flutterRatio: ratio, hr, filter: 'off' as const, variability: 0 });

describe('Flutter uses its atrial/conduction clock for the entire QT history', () => {
  it.each([2,3,4])('first RR already has the same clock as later RR at %s:1', ratio => {
    const c=flutter(72,ratio), events=generateEvents(c,10), expected=60/c.atrialRate*ratio;
    for (const beat of events.beats) expect(beat.rr).toBeCloseTo(expected,12);
    assignRepolarization(c,events.beats);
    for (const beat of events.beats) expect(beat.adaptedRR).toBeCloseTo(expected,12);
  });
  it('inactive base-rate control cannot change any acquired lead or event', () => {
    const a=synthesize(flutter(40),10), b=synthesize(flutter(200),10);
    expect(b.events).toEqual(a.events);
    expect(b.leads).toEqual(a.leads);
  });
  it('the active atrial rate changes ventricular timing', () => {
    const a=flutter(72), b={...a,atrialRate:240};
    expect(generateEvents(a,10).beats[1].time-generateEvents(a,10).beats[0].time).toBeCloseTo(.4,12);
    expect(generateEvents(b,10).beats[1].time-generateEvents(b,10).beats[0].time).toBeCloseTo(.5,12);
  });
});
