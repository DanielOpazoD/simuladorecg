import { LEADS, type Signal } from '../engine/types';
export interface DetailScale { minMv: number; maxMv: number; tickMv: number }
const cached = new WeakMap<Signal, Readonly<DetailScale>>();
/** A common zero-centred physical voltage range for the whole immutable signal.
 * Cached by signal identity, never recalculated from the selected lead or beat.
 * A new generated case gets a new range, explicitly labelled in the detail.
 */
export function detailScale(signal: Signal): Readonly<DetailScale> {
 const known=cached.get(signal); if(known) return known;
 let peak=.4;
 for(const lead of LEADS) for(const v of signal.leads[lead]) {
  if(!Number.isFinite(v)) throw new RangeError('Non-finite detail signal');
  peak=Math.max(peak,Math.abs(v));
 }
 const maxMv=Math.ceil(peak*1.08/.25)*.25;
 const value=Object.freeze({minMv:-maxMv,maxMv,tickMv:maxMv<=1 ? .2 : maxMv<=3 ? .5 : 1});
 cached.set(signal,value); return value;
}
