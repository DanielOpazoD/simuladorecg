/** Source audit, not a physiological calibration algorithm. Never rescales input. */
import assert from 'node:assert/strict';
export function sourceScaleEvidence(digital,calibration){
 const names=Object.keys(digital);assert.ok(['I','II','III'].every(l=>names.includes(l)));
 const n=digital.I.length;assert.ok(n>1&&names.every(l=>digital[l].length===n));
 const literal={},leads={};
 for(const lead of names){
  const values=Array.from(digital[lead]),c=calibration[lead];
  assert.ok(c&&Number.isFinite(c.gain)&&c.gain>0&&Number.isFinite(c.baseline));
  assert.ok(values.every(Number.isFinite));
  const span=Math.max(...values)-Math.min(...values);
  literal[lead]=values.map(x=>(x-c.baseline)/c.gain);
  leads[lead]={gain:c.gain,baseline:c.baseline,digitalRange:span,declaredMvRange:span/c.gain,gainEqualsDigitalRange:span>0&&c.gain===span};
 }
 const rms=source=>Math.sqrt(source.I.reduce((sum,_,i)=>sum+(source.II[i]-source.I[i]-source.III[i])**2,0)/n);
 const matched=Object.values(leads).filter(l=>l.gainEqualsDigitalRange).length;
 return {samplesPerLead:n,channels:names.length,leads,gainEqualsRangeChannels:matched,
  allChannelsGainEqualsRange:matched===names.length,
  rawEinthovenRms:rms(digital),declaredMvEinthovenRms:rms(literal),
  screenAloneEstablishesCalibration:false,
  interpretation:matched===names.length?'Header gains equal each digital channel range; quarantine absolute amplitudes pending independent calibration evidence':'This screen alone cannot establish physical calibration',
  rescalingApplied:false};
}
