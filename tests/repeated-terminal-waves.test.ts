import {describe, expect, it} from 'vitest';
import {rejectRepeatedTerminalWaves} from '../src/engine/analysis/ventricular-candidates';
import {LEADS, type Signal} from '../src/engine/types';

// Controlled sample-domain contours, without a generator case, event, diagnosis,
// or hidden physiological annotation in the input to the discriminator.
function fixture({count=3, lateDelay=300, lateSign=1, sameShape=false}={}) {
  const fs=1000, leads=Object.fromEntries(LEADS.map(l=>[l,new Float64Array(6000)])) as Signal['leads'];
  const qrs=[500,1500,2500,3500], rejected=qrs.slice(0,count).map(i=>i+300), last=3500+lateDelay;
  const add=(at:number, terminal:boolean, sign=1)=>{
    for(let offset=-80;offset<=80;offset++)for(const [k,lead] of ['I','II','V1','V5'].entries()) {
      const value=terminal||sameShape ? Math.exp(-.5*(offset/45)**2)*(k+1) :
        Math.exp(-.5*(offset/12)**2)*(k%2 ? -1 : 1);
      leads[lead as keyof Signal['leads']][at+offset]+=sign*value;
    }
  };
  qrs.forEach(i=>add(i,false)); rejected.forEach(i=>add(i,true)); add(last,true,lateSign);
  return {samples:{fs,leads},all:[...qrs,...rejected,last].sort((a,b)=>a-b),retained:[...qrs,last],qrs,last};
}

describe('Repeated terminal contour confirmation',()=>{
  it('removes a matching late contour supported by three distinct rejected waves without moving QRS',()=>{
    const f=fixture(), before=structuredClone(f);
    expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.qrs);
    expect(f).toEqual(before);
  });
  for(const count of [0,1,2])it(`keeps uncertainty with only ${count} rejected complexes`,()=>{
    const f=fixture({count});expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.retained);
  });
  it('cannot count duplicate rejected candidates as distinct preceding complexes',()=>{
    const f=fixture({count:1});f.all.push(800,800);
    expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.retained);
  });
  it('does not transfer a template to opposite polarity',()=>{
    const f=fixture({lateSign:-1});expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.retained);
  });
  it('does not transfer a template to a different terminal delay',()=>{
    const f=fixture({lateDelay:350});expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.retained);
  });
  it('protects repeated same-shaped QRS even at a matching short interval',()=>{
    const f=fixture({sameShape:true});expect(rejectRepeatedTerminalWaves(f.samples,f.all,f.retained)).toEqual(f.retained);
  });
});

function withLeadingContour(
  f: ReturnType<typeof fixture>,
  { qrsLike = false, sign = 1 } = {},
) {
  const leading = 100,
    source = qrsLike ? f.qrs[0] : f.last;
  for (const lead of LEADS)
    for (let offset = -80; offset <= 80; offset++)
      f.samples.leads[lead][leading + offset] =
        sign * f.samples.leads[lead][source + offset];
  f.all.unshift(leading);
  f.retained.unshift(leading);
  return { ...f, leading };
}
describe("leading terminal contour with independently observed later support", () => {
  it("removes a repeated leading terminal contour without creating a preceding QRS", () => {
    const f = withLeadingContour(fixture()),
      original = structuredClone(f.samples);
    expect(rejectRepeatedTerminalWaves(f.samples, f.all, f.retained)).toEqual(
      f.qrs,
    );
    expect(f.samples).toEqual(original);
  });
  it("keeps a leading contour when fewer than three distinct later complexes support it", () => {
    const f = withLeadingContour(fixture({ count: 2 }));
    expect(rejectRepeatedTerminalWaves(f.samples, f.all, f.retained)).toEqual(
      f.retained,
    );
  });
  it("preserves a leading QRS-shaped observation", () => {
    const f = withLeadingContour(fixture(), { qrsLike: true });
    expect(rejectRepeatedTerminalWaves(f.samples, f.all, f.retained)).toEqual([
      f.leading,
      ...f.qrs,
    ]);
  });
  it("preserves an opposite-polarity leading observation", () => {
    const f = withLeadingContour(fixture(), { sign: -1 });
    expect(rejectRepeatedTerminalWaves(f.samples, f.all, f.retained)).toEqual([
      f.leading,
      ...f.qrs,
    ]);
  });
  it("does not use later timing to relabel same-shaped QRS as terminal waves", () => {
    const f = withLeadingContour(fixture({ sameShape: true }));
    expect(rejectRepeatedTerminalWaves(f.samples, f.all, f.retained)).toEqual(
      f.retained,
    );
  });
});
