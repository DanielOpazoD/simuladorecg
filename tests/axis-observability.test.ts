import {describe,it,expect} from 'vitest';
import {fixture} from './fixtures';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {measure} from '../src/engine/measure';
const frontal = ['I','II','III','aVR','aVL','aVF'] as const;
function absentQrs(fs=500, dcI=0, dcII=0, polarity=1, mixed=false) {
  const s=fixture({fs});
  for(let i=0;i<s.leads.I.length;i++) {
    const time=i/fs, t=time%1;
    const absent=t>=.3&&t<=.5&&(!mixed||time<5);
    const I=(absent?0:s.leads.I[i])*polarity+dcI;
    const II=(absent?0:s.leads.II[i])*polarity+dcII;
    const values:Record<string,number>={I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};
    for(const lead of frontal)s.leads[lead][i]=values[lead];
  }
  return s;
}
describe('Frontal QRS observability is specific to the measured wave',()=>{
  it.each([250,500,1000].flatMap(fs=>[1,-1].flatMap(p=>[[fs,0,0,p],[fs,.75,-.5,p]])))
  ('retires only unsupported QRS axis at %s Hz, offsets %s/%s, polarity %s',(fs,a,b,p)=>{
    const s=absentQrs(fs,a,b,p),before=structuredClone(s),m=analyzeSamples(s),raw=measure(s);
    expect(m.beats.length).toBeGreaterThan(3);expect(raw.axis).not.toBeNull();
    expect(m.axis).toBeNull();expect(m.evidence.axis.status).toBe('unavailable');
    expect(m.evidence.axis.count).toBe(0);expect(m.evidence.axis.reason).toContain('P/T');
    expect(m.rejected?.axis).toBe(raw.axis);
    expect(m.hr).toBeCloseTo(60,8);
    for(const key of ['hr','instantHr','rr','pr','qrs','qt','qtc'] as const)expect(m[key]).toEqual(raw[key]);
    expect(m.beats).toEqual(raw.beats);expect(m.detectedPeaks).toEqual(raw.detectedPeaks);
    expect(m.pAxis).not.toBeNull();expect(m.tAxis).not.toBeNull();
    expect(m.pAxis).toBe(raw.pAxis);expect(m.tAxis).toBe(raw.tAxis);expect(s).toEqual(before);
  });
  it('does not retire a genuine observed zero-degree QRS axis',()=>{
    const s=fixture();
    for(let i=0;i<s.leads.I.length;i++) {
      const I=s.leads.I[i];s.leads.II[i]=I/2;s.leads.III[i]=-I/2;
      s.leads.aVR[i]=-.75*I;s.leads.aVL[i]=.75*I;s.leads.aVF[i]=0;
    }
    const m=analyzeSamples(s);expect(m.axis).toBeCloseTo(0,8);expect(m.evidence.axis.status).toBe('usable');
  });
  it('preserves a mixed set for review rather than inventing a new aggregation rule',()=>{
    const s=absentQrs(500,0,0,1,true),m=analyzeSamples(s),raw=measure(s);
    expect(m.axis).toBe(raw.axis);expect(m.evidence.axis.status).toBe('review');
  });
  it('preserves nonzero frontal signals without a new voltage cutoff',()=>{
    const s=fixture();for(const lead of frontal)for(let i=0;i<s.leads[lead].length;i++)s.leads[lead][i]*=1e-14;
    const m=analyzeSamples(s);expect(m.axis).not.toBeNull();
  });
});
