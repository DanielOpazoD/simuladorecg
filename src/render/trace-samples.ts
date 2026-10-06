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
    // Emit the same sorted unique indices without allocating a Set, arrays or
    // a comparator per pixel bucket on every animation frame.
    visit(i);
    const first=Math.min(min,max), last=Math.max(min,max);
    if(first>i && first<end)visit(first);
    if(last>first && last<end)visit(last);
    if(end>i)visit(end);
  }
}
