import {describe,it,expect} from 'vitest';
import {measure} from '../src/engine/measure';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
describe('T-peak evidence is not an interval',()=>{
  it('preserves visible candidates without creating a T end or QT',()=>{
    const c=fromPreset(presetById('tachy')!),s=synthesize(c,10,{learnedBase:false}),m=measure(s); // fixture where the frozen analyzer abstains from QT
    const candidates=m.beats.filter(b=>b.tPeak!==null&&b.tEnd===null);
    expect(candidates.length).toBeGreaterThan(0);expect(m.qt).toBeNull();
    expect(m.evidence.qt.status).toBe('unavailable');
    for(const b of candidates){expect(b.qt).toBeNull();expect(b.tTangentEnd).toBeNull();expect(b.tPeak!).toBeGreaterThan(b.offset);}
  });
  it('does not confuse flat signal with an unclosed T',()=>{
    const s=synthesize(fromPreset(presetById('sinus')!),10);Object.values(s.leads).forEach(l=>l.fill(0));
    expect(measure(s).beats).toEqual([]);expect(analyzeSamples(s).qt).toBeNull();
  });
});
