/** Analytical alternating deflections, not a physiological/patient ECG.
 * Independent from model synthesis; tiny acquisition noise avoids flat extrema. */
export function opposedCycleFixture(){
 const fs=500,weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
 const values=Float64Array.from({length:fs*10},(_,i)=>{
  const t=i/fs;let v=.0002*Math.sin(2*Math.PI*43*t)+.0003*Math.sin(2*Math.PI*.31*t);
  for(let start=.5;start<10;start+=.6)v+=Math.exp(-.5*((t-start)/.014)**2)-.9*Math.exp(-.5*((t-start-.3)/.016)**2);
  return v;
 });
 return {fs,leads:Object.fromEntries(Object.entries(weights).map(([lead,w])=>[lead,Float64Array.from(values,x=>w*x)]))};
}
export function opposedCycleCsv(){
 const s=opposedCycleFixture(),names=Object.keys(s.leads);
 return ['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+names.join(','),...Array.from({length:5000},(_,i)=>[i/s.fs,...names.map(lead=>s.leads[lead][i])].join(','))].join('\n');
}
