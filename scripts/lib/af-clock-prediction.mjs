import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const OLD_INCREMENT = `      t +=
        base *
        Math.max(
          0.38,
          Math.min(
            2.15,
            0.8 + Math.exp(0.42 * normal(r)) * 0.2 + 0.38 * normal(r),
          ),
        );`;
/** Independent frozen-source implementation of the registered gamma algorithm.
 * It predicts the software intervention, not AF physiology or patient accuracy. */
export function predictAfClock(source) {
 assert.equal(source.split(OLD_INCREMENT).length,2,'Frozen AF clock anchor changed');
 return source.replace(OLD_INCREMENT,'      t += referenceAfDraw(r, base);')+`
function referenceAfDraw(r: () => number, mean: number): number {
 const shape=1/(.22*.22), d=shape-1/3, coefficient=1/Math.sqrt(9*d);
 for(let n=0;n<1000;n++) {
  const gaussian=normal(r), root=1+coefficient*gaussian;
  if(root<=0)continue;
  const volume=root*root*root, uniform=r();
  const quick=uniform<1-.0331*gaussian*gaussian*gaussian*gaussian;
  const exact=Math.log(Math.max(Number.MIN_VALUE,uniform))<.5*gaussian*gaussian+d*(1-volume+Math.log(volume));
  if(quick||exact)return mean*d*volume/shape;
 }
 throw new Error('Reference gamma rejection failure');
}
`;
}
export function restoreHistoricalAfClock(source) {
 const imported="import {afInterval} from './af-rr';\n", call='      t += afInterval(r, base, cv);';
 assert.equal(source.split(imported).length,2,'AF import changed');
 assert.equal(source.split(call).length,2,'AF invocation changed');
 return source.replace(imported,'').replace(call,OLD_INCREMENT);
}
export function assertFrozenAfSampler(source) {
 assert.equal(createHash('sha256').update(source).digest('hex'),
  'b559b955deffac0ee022439a6a1ced96591b977de8d158f71d12d510f2b9e2c1','AF sampler changed after evaluation');
}
