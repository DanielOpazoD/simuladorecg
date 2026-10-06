import { suggestTEnds, type TEndAreaCandidate } from '../engine/t-end-area';
import type { Signal, Measurement } from '../engine/types';

/** Accepted worker results are immutable in TraceSession. Only view selection
 * changes during beat/lead navigation. Weak keys release replaced recordings.
 * Keep this UI optimization outside the frozen numerical review algorithm.
 */
const cache = new WeakMap<Signal, WeakMap<Measurement, readonly (TEndAreaCandidate | null)[]>>();
export function tEndReview(signal: Signal, measurement: Measurement): readonly (TEndAreaCandidate | null)[] {
  let measurements=cache.get(signal);
  if(!measurements){measurements=new WeakMap();cache.set(signal,measurements);}
  const existing=measurements.get(measurement);if(existing)return existing;
  const result=suggestTEnds(signal,measurement);
  for(const candidate of result)if(candidate){
    Object.freeze(candidate.searchWindow);Object.freeze(candidate.supportingLeads);
    for(const estimate of candidate.leadEstimates)Object.freeze(estimate);
    Object.freeze(candidate.leadEstimates);Object.freeze(candidate);
  }
  Object.freeze(result);measurements.set(measurement,result);return result;
}
