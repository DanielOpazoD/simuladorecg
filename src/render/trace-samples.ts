/** Ordered extrema plus bucket endpoints in the half-open acquisition window.
 * Rendering reduction only: no interpolation, smoothing or changes to samples.
 */
export function traceSampleIndices(
  samples: Float64Array, fs: number, from: number, to: number,
  pixelsPerSecond: number, visit: (index: number) => void,
): void {
  if (![fs,from,to,pixelsPerSecond].every(Number.isFinite) || fs <= 0 || pixelsPerSecond <= 0)
    throw new RangeError('Invalid trace sampling coordinates');
  const lo=Math.max(0,Math.ceil(from*fs)), hi=Math.min(samples.length,Math.ceil(to*fs));
  const step=Math.max(1,Math.floor(fs/pixelsPerSecond));
  for(let i=lo;i<hi;i+=step) {
    const end=Math.min(i+step,hi)-1;
    if(step===1){visit(i);continue;}
    let min=i,max=i;
    for(let j=i+1;j<=end;j++) {
      if(samples[j]<samples[min])min=j;
      if(samples[j]>samples[max])max=j;
    }
    const ordered=[...new Set([i,min,max,end])].sort((a,b)=>a-b);
    for(const index of ordered)visit(index);
  }
}
