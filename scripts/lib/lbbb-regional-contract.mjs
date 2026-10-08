/** Sample-domain checks of the declared regional surrogate, not patient accuracy. */
import assert from 'node:assert/strict';
const leads=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export function assertLbbbRegionalSamples(mod){
 const c={...mod.fromPreset(mod.presetById('lbbb')),hr:60,variability:0,filter:'off',pAmp:0,tAmp:0,st:0,
   ischemia:'none',electrolyte:'none',activationModel:'regional-lbbb-v1'};
 const widths=[130,160,200,240],rows=[];let priorPeak=0,referenceArea;
 for(const qrs of widths){
  const s=mod.synthesize({...c,qrs},10),b=s.events.beats.find(b=>b.time>3);
  const lo=Math.ceil(b.time*s.fs),hi=Math.floor((b.time+qrs/1000)*s.fs);
  const segment=l=>Array.from(s.leads[l].slice(lo,hi));
  const v1=segment('V1'),v6=segment('V6'),peak=Math.max(...v6),peakMs=v6.indexOf(peak)*1000/s.fs;
  assert.ok(Math.min(...v1)<-.1 && peak>.1,'Retain negative V1 / positive lateral R');
  assert.ok(peakMs>priorPeak,'Delayed lateral peak must move later');priorPeak=peakMs;
  const area=Object.fromEntries(leads.map(l=>[l,segment(l).reduce((a,b)=>a+b,0)/s.fs]));
  if(referenceArea)for(const l of leads){
   // 2% discretization/window allowance for the imposed integral constraint,
   // not a physiological amplitude threshold. Near-zero lead integrals use1uV*s.
   assert.ok(Math.abs(area[l]-referenceArea[l])<=Math.max(.000001,Math.abs(referenceArea[l])*.02),'Source-area drift '+l);
  }else referenceArea=area;
  const axis=Math.atan2((2*area.II-area.I)/Math.sqrt(3),area.I)*180/Math.PI;
  assert.ok(Math.abs(axis-c.axis)<.1,'Sample-integrated axis must remain requested');
  for(let i=0;i<s.leads.I.length;i+=17){const x=s.leads.I[i],y=s.leads.II[i];
   assert.ok(Math.abs(s.leads.III[i]-(y-x))<1e-9);assert.ok(Math.abs(s.leads.aVR[i]+(x+y)/2)<1e-9);
   assert.ok(Math.abs(s.leads.aVL[i]-(x-y/2))<1e-9);assert.ok(Math.abs(s.leads.aVF[i]-(y-x/2))<1e-9);
  }
  rows.push({qrsMs:qrs,peakMs,v1MinimumMv:Math.min(...v1),v6PeakMv:peak,axis,area});
 }
 return {rows,clinicalValidation:false};
}
