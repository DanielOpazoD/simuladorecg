import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {savedCases,saveCase} from '../src/ui/persistence';
import {fromPreset,presetById} from '../src/presets/catalog';
let raw:string|null;let writes:number;
const named=(name:string)=>({...fromPreset(presetById('sinus')!),name});
beforeEach(()=>{raw=null;writes=0;vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;writes++;}});});
afterEach(()=>vi.unstubAllGlobals());
describe('Saved case preservation',()=>{
  it('recovers readable entries without allowing a destructive partial rewrite',()=>{
    raw=JSON.stringify([named('A'),{version:99},named('B')]);const original=raw;
    expect(savedCases().map(c=>c.name)).toEqual(['A','B']);
    expect(()=>saveCase(named('C'))).toThrow();expect(raw).toBe(original);expect(writes).toBe(0);
  });
  it.each(['broken JSON','{}','null'])('does not overwrite unreadable storage: %s',value=>{
    raw=value;expect(()=>saveCase(named('C'))).toThrow();expect(raw).toBe(value);expect(writes).toBe(0);
  });
  it('does not silently evict an older case when thirty are already stored',()=>{
    raw=JSON.stringify(Array.from({length:30},(_,i)=>named('Case '+i)));const original=raw;
    expect(()=>saveCase(named('New'))).toThrow(/30/);expect(raw).toBe(original);
    saveCase({...named('Case 0'),seed:9});expect(savedCases()).toHaveLength(30);expect(savedCases()[0].seed).toBe(9);
  });
  it('preserves a legacy over-capacity list rather than truncating it on write',()=>{
    raw=JSON.stringify(Array.from({length:31},(_,i)=>named('Case '+i)));const original=raw;
    expect(()=>saveCase(named('New'))).toThrow();expect(raw).toBe(original);
  });
  it('does not write if storage could not first be read',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>writes++});
    expect(()=>saveCase(named('New'))).toThrow();expect(writes).toBe(0);
  });
  it('still saves into empty storage and preserves the current case object',()=>{
    const c=named('A'),copy=structuredClone(c);saveCase(c);expect(savedCases()).toEqual([c]);expect(c).toEqual(copy);
  });
});

import {savedCaseAt,savedCaseState} from '../src/ui/persistence';
it('selects the displayed snapshot instead of a reordered storage list',()=>{
  raw=JSON.stringify([named('A'),named('B')]);const shown=savedCases();
  raw=JSON.stringify([named('B'),named('A')]);
  const picked=savedCaseAt(shown,0)!;expect(picked.name).toBe('A');picked.name='Edited';expect(shown[0].name).toBe('A');
  for(const index of [-1,2,.5,NaN])expect(savedCaseAt(shown,index)).toBeNull();
});
it('makes damaged storage visible without changing the source bytes',()=>{
  raw='broken';const state=savedCaseState();expect(state.writable).toBe(false);expect(state.warning).toContain('No se pudo leer');expect(raw).toBe('broken');
});
