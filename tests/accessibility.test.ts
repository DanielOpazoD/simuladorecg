import {describe,it,expect} from 'vitest';
import {tabDestination} from '../src/ui/accessibility';
describe('Bounded, presentation-only tab navigation', () => {
  it.each([
    ['ArrowRight',0,3,1],['ArrowRight',2,3,0],['ArrowLeft',0,3,2],
    ['ArrowLeft',2,3,1],['Home',2,3,0],['End',0,3,2],
    ['Tab',0,3,null],['ArrowDown',0,3,null],['Escape',0,3,null],
    ['Home',0,0,null],['End',-1,3,null],['ArrowRight',3,3,null],
  ] as const)('%s at %i of %i selects %s', (key,index,length,expected) => {
    expect(tabDestination(key,index,length)).toBe(expected);
  });
});
