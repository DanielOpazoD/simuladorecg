/** Acceptance over 500 Hz output samples, no production analyzer or profile constants. */
import assert from 'node:assert/strict';
const leads=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export function assertRegionalSampleContract(mod) {
  const c={...mod.fromPreset(mod.presetById('rbbb')),hr:60,variability:0,filter:'off',
    pAmp:0,tAmp:0,st:0,ischemia:'none',electrolyte:'none'};
  const widths=[115,150,190,230], rows=[], signals=widths.map(qrs=>
    mod.synthesize({...c,qrs,activationModel:'regional-rbbb-v1'},10));
  const window=(s,l,lo,hi)=>{
    const b=s.events.beats.find(b=>b.time>3);
    return Array.from(s.leads[l].slice(Math.ceil((b.time+lo/1000)*s.fs),Math.floor((b.time+hi/1000)*s.fs)+1));
  };
  const area=(s,l,d)=>window(s,l,0,d).reduce((a,b)=>a+b,0);
  let previousPeak=0;
  for(let k=0;k<widths.length;k++) {
    const s=signals[k], duration=widths[k];
    let earlyErrorMv=0;
    for(const l of leads) {
      const a=window(signals[0],l,0,44),b=window(s,l,0,44);
      for(let i=0;i<a.length;i++)earlyErrorMv=Math.max(earlyErrorMv,Math.abs(a[i]-b[i]));
      assert.ok(Array.from(s.leads[l]).every(Number.isFinite));
    }
    // The 81-tap centered anti-alias filter can bring a tiny late contribution
    // forward. 1 microvolt is an engineering tolerance, not a clinical threshold.
    assert.ok(earlyErrorMv<.001,`Early-QRS drift ${duration}: ${earlyErrorMv} mV`);
    const late=window(s,'V1',66,duration), peak=Math.max(...late);
    const peakTimeMs=66+late.indexOf(peak)*1000/s.fs;
    assert.ok(peak>.1,'Late positive R-prime must remain in V1');
    assert.ok(Math.min(...window(s,'V6',90,duration))<-.1,'Late negative S must remain in V6');
    assert.ok(peakTimeMs>previousPeak,'Delayed V1 maximum must move later, not stretch early LV');previousPeak=peakTimeMs;
    const i=area(s,'I',duration),ii=area(s,'II',duration);
    const axisDeg=Math.atan2((2*ii-i)/Math.sqrt(3),i)*180/Math.PI;
    assert.ok(Math.abs(axisDeg-35)<.1,'Sample-integrated frontal axis must close');
    for(let j=0;j<s.leads.I.length;j+=17){const i=s.leads.I[j],ii=s.leads.II[j];
      assert.ok(Math.abs(s.leads.III[j]-(ii-i))<1e-9);
      assert.ok(Math.abs(s.leads.aVR[j]+(i+ii)/2)<1e-9);
      assert.ok(Math.abs(s.leads.aVL[j]-(i-ii/2))<1e-9);
      assert.ok(Math.abs(s.leads.aVF[j]-(ii-i/2))<1e-9);
    }
    rows.push({qrsMs:duration,earlyErrorMv,peakTimeMs,v1LatePeakMv:peak,axisDeg});
  }
  const a=mod.synthesize({...c,qrs:115,activationModel:'template'},10),b=mod.synthesize({...c,qrs:230,activationModel:'template'},10);
  const earlyA=window(a,'II',0,44),earlyB=window(b,'II',0,44);
  const historicalEarlyDriftMv=Math.max(...earlyA.map((v,i)=>Math.abs(v-earlyB[i])));
  assert.ok(historicalEarlyDriftMv>.05,'Negative control must reproduce global stretching');
  return {rows,historicalEarlyDriftMv,clinicalValidation:false};
}
