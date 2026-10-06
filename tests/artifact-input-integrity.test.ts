import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE, normalizeCase } from '../src/engine/types';
import { encodeCase, decodeCase } from '../src/ui/persistence';
describe('artifact configuration cannot silently become a clean trace',()=>{
  it.each(['baseline','muscle','mains','loose'])('rejects malformed %s amplitude',key=>{
    for(const value of [null,'0.5',true,NaN,Infinity,-Infinity])
      expect(()=>normalizeCase({version:1,artifacts:{[key]:value}})).toThrow(/artefacto/i);
  });
  it.each([null,[],false,'none'])('rejects malformed artifact object %s',artifacts=>{
    expect(()=>normalizeCase({version:1,artifacts})).toThrow(/artefacto/i);
  });
  it.each([null,0,1,'true'])('does not silently erase an invalid reversal flag %s',reversed=>{
    expect(()=>normalizeCase({version:1,artifacts:{reversed}})).toThrow(/artefacto/i);
  });
  it('preserves documented defaults and finite amplitude normalization',()=>{
    expect(normalizeCase({version:1}).artifacts).toEqual(DEFAULT_CASE.artifacts);
    expect(normalizeCase({version:1,artifacts:{baseline:2,muscle:-1,reversed:true}}).artifacts)
      .toEqual({...DEFAULT_CASE.artifacts,baseline:1,muscle:0,reversed:true});
  });
  it('preserves each valid artifact through a shared case round trip',()=>{
    const c=normalizeCase({version:1,artifacts:{baseline:.2,muscle:.3,mains:.4,loose:.5,reversed:true}});
    expect(decodeCase(encodeCase(c))?.artifacts).toEqual(c.artifacts);
  });
});
