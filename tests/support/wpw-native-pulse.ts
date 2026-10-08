/** Independent finite-support sine on the 1 kHz acquisition lattice. Uses only
 * event times and unchanged linear acquisition; never calls wpwDeltaVector. */
import type {ECGCase,Lead} from '../../src/engine/types';
import {generateEvents} from '../../src/engine/rhythm';
import {assignRepolarization} from '../../src/engine/repolarization';
import {qrsKernels} from '../../src/engine/morphology';
import {frontal,project} from '../../src/engine/leads';
import {applyAcquisitionFilter,biquad,antialias} from '../../src/engine/filter';
export function wpwNativeLeadII(c:ECGCase,duration=10,legacyLeakOnly=false,secondaryST=false):Float64Array{
 return wpwNativeLead(c,"II",duration,legacyLeakOnly,secondaryST);
}
export function wpwNativeLead(c:ECGCase,lead:Lead,duration=10,legacyLeakOnly=false,secondaryST=false):Float64Array{
 const fs=1000,warm=4,guard=c.filter==='monitor'?4:.1,total=duration+warm;
 const raw=new Float64Array(Math.ceil((total+guard)*fs)),events=generateEvents(c,total+guard);
 if(secondaryST)assignRepolarization(c,events.beats);
 const direction=project(frontal(c.axis,.25,.03))[lead],gain=c.qrsAmp*(c.electrolyte==='lowvoltage'?.38:1);
 for(const b of events.beats){
  if(b.kind!=='normal'||c.conduction!=='wpw')continue;
  const start=b.time,end=start+.045;
  for(let i=Math.max(0,Math.floor(start*fs));i<Math.min(raw.length,Math.ceil(end*fs));i++){
   const phase=(i/fs-start)/.045,inside=phase>0&&phase<1;
   if(legacyLeakOnly?!inside:inside)raw[i]+=direction*gain*Math.sin(Math.PI*phase);
  }
  if(secondaryST){
   // Independent scalar quadrature of the represented II activation. No call
   // to the candidate's secondary source, area cache or ST envelope.
   const n=4000,dur=b.qrs!,ks=qrsKernels(c,b);let area=0;
   for(let j=1;j<n;j++){
    const u=j/n;let value=0;
    for(const k of ks)value+=project(k.v)[lead]*Math.exp(-.5*((u-k.mu)/k.sigma)**2)*Math.min(1,u/.035,(1-u)/.035);
    area+=value*(j%2?4:2);
   }
   const reference=area/(3*n*Math.sqrt(2*Math.PI))+direction*gain*2*.045/(Math.PI*dur*Math.sqrt(2*Math.PI));
   const length=c.electrolyte==='hyperkalemia'?.13:Math.min(.22,(b.qt!-dur)*.68),tStart=b.time+b.qt!-length,j=b.time+dur,lo=j-.04,hi=tStart+length/2;
   const smooth=(x:number)=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v);};
   for(let i=Math.max(0,Math.floor(lo*fs));i<Math.min(raw.length,Math.ceil(hi*fs));i++){
    const t=i/fs;if(t<=lo||t>=hi)continue;
    raw[i]+=-.2*reference*smooth((t-lo)/.04)*(1-smooth((t-tStart)/(hi-tStart)));
   }
  }
 }
 applyAcquisitionFilter(raw,fs,c.filter);if(c.notch)biquad(raw,fs,c.notch,'notch',25);
 const filtered=antialias(raw,fs);
 return Float64Array.from({length:duration*500},(_,i)=>filtered[warm*fs+2*i]);
}
