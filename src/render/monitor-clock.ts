/** One source clock for the sweep and its audible beat cue. This is replay of
 * a finite recording, not a live patient or a new physiological integration.
 */
export function monitorClock(seconds:number, span:number, available:number) {
  if(![seconds,span,available].every(Number.isFinite)||seconds<0||span<=0||available<=0)
    throw new RangeError('Invalid monitor replay coordinates');
  const duration=Math.min(span,available),cycle=Math.floor(seconds/duration),phase=seconds%duration;
  const remaining=available-duration;
  const startFor=(k:number)=>remaining>0?(k*duration)%remaining:0;
  const start=startFor(cycle);
  return {duration,cycle,phase,start,source:start+phase,previousStart:cycle>0?startFor(cycle-1):0};
}
