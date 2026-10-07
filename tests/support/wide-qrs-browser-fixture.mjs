/** Synthetic analytical deflections for a reader/worker/browser test only.
 * Small continuous acquisition noise avoids invalid exact-extremum plateaus.
 * Neither a patient ECG nor a physiological waveform reference. */
export function wideDeflectionFixture(){
 const fs=500,weights={I:1,II:1.3,III:.3,aVR:-1.15,aVL:.35,aVF:.8,V1:-.8,V2:-.4,V3:.2,V4:.6,V5:1.1,V6:.9};
 const leads=Object.fromEntries(Object.entries(weights).map(([lead,weight],channel)=>[lead,Float64Array.from({length:5000},(_,i)=>{
  const time=i/fs;let value=0;
  for(let start=.5;start+.24<9.8;start+=.6){
   const phase=time-start;if(phase<=0||phase>=.24)continue;
   const edge=Math.min(phase,.24-phase)/.05;
   value+=edge>=1?1:(1-Math.cos(Math.PI*edge))/2;
  }
  return value*weight+.0003*Math.sin(2*Math.PI*.31*time)+.0002*Math.sin(2*Math.PI*43*time+channel*.2);
 })]));
 for(let i=0;i<5000;i++){
  const a=leads.I[i],b=leads.II[i];
  leads.III[i]=b-a;leads.aVR[i]=-(a+b)/2;leads.aVL[i]=a-b/2;leads.aVF[i]=b-a/2;
 }
 return {fs,leads};
}
export function wideDeflectionCsv(){
 const s=wideDeflectionFixture(),names=Object.keys(s.leads);
 return ['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+names.join(','),...Array.from({length:5000},(_,i)=>[i/s.fs,...names.map(lead=>s.leads[lead][i])].join(','))].join('\n');
}
