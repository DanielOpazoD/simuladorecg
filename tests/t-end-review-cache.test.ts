import {describe,it,expect} from 'vitest';
import {tEndReview} from '../src/ui/t-end-review-cache';
import {suggestTEnds} from '../src/engine/t-end-area';
import {synthesize} from '../src/engine/signal';
import {measure} from '../src/engine/measure';
import {DEFAULT_CASE} from '../src/engine/types';
import {beatDetail} from '../src/ui/beat-detail';
describe('Immutable review results reused only for the same accepted record',()=>{
  it('preserves exact candidates and reuses them during lead/beat navigation',()=>{
    const s=synthesize(DEFAULT_CASE,10),m=measure(s),expected=suggestTEnds(s,m),copy=structuredClone(m);
    const a=tEndReview(s,m);expect(a).toEqual(expected);expect(a.some(Boolean)).toBe(true);
    beatDetail(s,m,DEFAULT_CASE,0);beatDetail(s,m,{...DEFAULT_CASE,view:{...DEFAULT_CASE.view,lead:'V5'}},1);
    expect(tEndReview(s,m)).toBe(a);expect(m).toEqual(copy);
    expect(Object.isFrozen(a)).toBe(true);
    for(const c of a)if(c){expect(Object.isFrozen(c)).toBe(true);expect(Object.isFrozen(c.leadEstimates)).toBe(true);}
  });
  it('invalidates by either signal or measurement identity',()=>{
    const s=synthesize(DEFAULT_CASE,10),m=measure(s),a=tEndReview(s,m);
    const b=tEndReview(s,structuredClone(m)),c=tEndReview(structuredClone(s),m);
    expect(b).not.toBe(a);expect(c).not.toBe(a);expect(b).toEqual(a);expect(c).toEqual(a);
  });
});
