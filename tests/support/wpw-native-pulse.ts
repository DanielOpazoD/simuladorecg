/** Independent finite-support sine on the 1 kHz acquisition lattice. Uses only
 * event times and unchanged linear acquisition; never calls wpwDeltaVector. */
import type {ECGCase} from '../../src/engine/types';
import {generateEvents} from '../../src/engine/rhythm';
import {frontal,project} from '../../src/engine/leads';
import {applyAcquisitionFilter,biquad,antialias} from '../../src/engine/filter';
export function wpwNativeLeadII(c:ECGCase,duration=10,legacyLeakOnly=false):Float64Array{
 const fs=1000,warm=4,guard=c.filter==='monitor'?4:.1,total=duration+warm;
 const raw=new Float64Array(Math.ceil((total+guard)*fs)),events=generateEvents(c,total+guard);
 const direction=project(frontal(c.axis,.25,.03)).II,gain=c.qrsAmp*(c.electrolyte==='lowvoltage'?.38:1);
 for(const b of events.beats){
  if(b.kind!=='normal'||c.conduction!=='wpw')continue;
  const start=b.time,end=start+.045;
  for(let i=Math.max(0,Math.floor(start*fs));i<Math.min(raw.length,Math.ceil(end*fs));i++){
   const phase=(i/fs-start)/.045,inside=phase>0&&phase<1;
   if(legacyLeakOnly?!inside:inside)raw[i]+=direction*gain*Math.sin(Math.PI*phase);
  }
 }
 applyAcquisitionFilter(raw,fs,c.filter);if(c.notch)biquad(raw,fs,c.notch,'notch',25);
 const filtered=antialias(raw,fs);
 return Float64Array.from({length:duration*500},(_,i)=>filtered[warm*fs+2*i]);
}
