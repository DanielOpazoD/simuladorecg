import {describe,it,expect} from 'vitest';
import {measure} from '../src/engine/measure';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {beatDetail} from '../src/ui/beat-detail';
describe('T-peak evidence is not an interval',()=>{
  it('preserves visible candidates without creating a T end or QT',()=>{
    const c=fromPreset(presetById('tachy')!),s=synthesize(c,10),m=measure(s);
    const candidates=m.beats.filter(b=>b.tPeak!==null&&b.tEnd===null);
    expect(candidates.length).toBeGreaterThan(0);expect(m.qt).toBeNull();
    expect(m.evidence.qt.status).toBe('unavailable');
    for(const b of candidates){expect(b.qt).toBeNull();expect(b.tTangentEnd).toBeNull();expect(b.tPeak!).toBeGreaterThan(b.offset);}
  });
  it('presents the candidate explicitly without a QT interval band',()=>{
    const c=fromPreset(presetById('tachy')!),s=synthesize(c,10),m=analyzeSamples(s);
    const i=m.beats.findIndex(b=>b.tPeak!==null&&b.tEnd===null);expect(i).toBeGreaterThanOrEqual(0);
    const h=beatDetail(s,m,c,i);expect(h).toContain('T candidata');
    expect(h).toContain('ni permite calcular QT');
    expect(h).not.toMatch(/QT \d+ ms/);
  });
  it('does not confuse flat signal with an unclosed T',()=>{
    const s=synthesize(fromPreset(presetById('sinus')!),10);Object.values(s.leads).forEach(l=>l.fill(0));
    expect(measure(s).beats).toEqual([]);expect(analyzeSamples(s).qt).toBeNull();
  });
});
