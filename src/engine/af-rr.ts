import {normal} from './random';
/** Development-calibrated representative variability, not a universal AF constant. */
export const AF_RR_CV=.22;
/** Positive gamma renewal draw (Marsaglia–Tsang, shape>1), in seconds.
 * No clipping, lookahead, global state or per-record normalization.
 */
export function afInterval(random:()=>number,meanSeconds:number):number {
 if(!Number.isFinite(meanSeconds)||meanSeconds<=0)throw Error('Invalid AF mean RR');
 const shape=1/(AF_RR_CV*AF_RR_CV),d=shape-1/3,c=1/Math.sqrt(9*d);
 for(let attempt=0;attempt<1000;attempt++){
  const x=normal(random),v=1+c*x;
  if(v<=0)continue;
  const cube=v*v*v,u=random();
  if(u<1-.0331*x*x*x*x||Math.log(Math.max(Number.MIN_VALUE,u))<.5*x*x+d*(1-cube+Math.log(cube)))
   return meanSeconds*d*cube/shape;
 }
 throw Error('AF random source did not produce an accepted interval');
}
