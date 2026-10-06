import { describe,it,expect } from 'vitest';
import { qtModelLimits } from '../src/ui/qt-model-limits';
import { measurementDialog } from '../src/ui/measurement-dialog';
import { synthesize } from '../src/engine/signal';
import { measure } from '../src/engine/measure';
import { DEFAULT_CASE,cloneCase } from '../src/engine/types';
const testCase=(hr:number,qrs:number,qtc:number)=>({...cloneCase(DEFAULT_CASE),hr,qrs,qtc,variability:0,filter:'off' as const});
describe('Explicit numerical limits of QT realization',()=>{
  it('does not warn for an unclipped normal configuration',()=>{const c=testCase(60,90,410);expect(qtModelLimits(c,synthesize(c,10))).toEqual([]);});
  it('discloses a lower bound without changing the generated signal or measurements',()=>{
    const c=testCase(60,240,260),s=synthesize(c,10),before=structuredClone(s),m=measure(s),copy=structuredClone(m);
    expect(s.events.beats.every(b=>Math.abs(b.qt!-.36)<1e-9)).toBe(true);
    expect(qtModelLimits(c,s).join(' ')).toContain('120 ms');
    expect(measurementDialog(s,m,c)).toContain('Límite del generador');
    expect(s).toEqual(before);expect(m).toEqual(copy);
  });
  it('discloses the upper engineering ceiling at slow rate',()=>{
    const c=testCase(20,90,650),s=synthesize(c,10);
    expect(s.events.beats.every(b=>b.qt===.9)).toBe(true);
    expect(qtModelLimits(c,s).join(' ')).toContain('900 ms');
  });
  it('does not manufacture a realized QT from an empty event record',()=>{
    expect(qtModelLimits({qtc:650},{events:{beats:[],atria:[],spikes:[]}})).toEqual([]);
  });
});
