/** Offline evaluation. Never imported by the application; no model audit. */
import { highpass, biquad, applyAcquisitionFilter } from '../../src/engine/filter';
import { morphologyMetrics, type Windows, type WaveMetrics } from '../../tests/support/morphology-metrics';
export const INDEPENDENT_NOISE_LEADS = ['I','II','V1','V2','V3','V4','V5','V6'] as const;
export const ALL_NOISE_LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'] as const;
export type Samples = {fs:number;leads:Record<string,Float64Array>};
export type FilterMode = 'off'|'diagnostic'|'monitor'|'aggressive';
export type ReviewLimits = {stMv:number;peakMv:number;qrsRelative:number;tRelative:number;areaMvS:number;areaRelative:number};
export function finiteArray(a:ArrayLike<number>, n=a.length) {
  if(a.length!==n || !n) throw new Error('Empty or unequal signal lengths');
  for(let i=0;i<n;i++)if(typeof a[i]!=='number'||!Number.isFinite(a[i]))throw new Error('Nonfinite sample');
}
export function mean(a:ArrayLike<number>,lo=0,hi=a.length) {
  let s=0;for(let i=lo;i<hi;i++)s+=a[i];return s/(hi-lo);
}
export function centeredPower(a:ArrayLike<number>,lo=0,hi=a.length) {
  if(!Number.isInteger(lo)||!Number.isInteger(hi)||lo<0||hi>a.length||hi<=lo)throw new Error('Invalid power window');
  const m=mean(a,lo,hi);let p=0;for(let i=lo;i<hi;i++)p+=(a[i]-m)**2;return p/(hi-lo);
}
export function deriveLimbs(s:Samples):Samples {
  const n=s.leads.I.length;finiteArray(s.leads.I);finiteArray(s.leads.II,n);
  const leads={...s.leads}; for(const l of ['III','aVR','aVL','aVF'])leads[l]=new Float64Array(n);
  for(let i=0;i<n;i++){const a=leads.I[i],b=leads.II[i];leads.III[i]=b-a;leads.aVR[i]=-(a+b)/2;leads.aVL[i]=a-b/2;leads.aVF[i]=b-a/2;}
  return {fs:s.fs,leads};
}
export function assertIdentities(s:Samples,tolerance=1e-9) {
  const n=s.leads.I.length;
  for(const l of ALL_NOISE_LEADS)finiteArray(s.leads[l],n);
  for(let i=0;i<n;i++){
    const a=s.leads.I[i],b=s.leads.II[i];
    if(Math.max(Math.abs(s.leads.III[i]-(b-a)),Math.abs(s.leads.aVR[i]+(a+b)/2),Math.abs(s.leads.aVL[i]-(a-b/2)),Math.abs(s.leads.aVF[i]-(b-a/2)))>tolerance)throw new Error('Limb identity violated');
  }
}
export function injectNoise(clean:Samples,channels:ArrayLike<number>[],mapping:Record<string,number[]>,snrDb:number|null,window:readonly[number,number]) {
  const n=clean.leads.I.length,lo=Math.round(window[0]*clean.fs),hi=Math.round(window[1]*clean.fs);
  if(!(clean.fs>0)||!Number.isFinite(clean.fs)||channels.length!==2)throw new Error('Invalid signal/noise format');
  channels.forEach(c=>finiteArray(c,n));
  for(const l of INDEPENDENT_NOISE_LEADS)finiteArray(clean.leads[l],n);
  const noise:Record<string,Float64Array>={};let signalPower=0,noisePower=0;
  for(const l of INDEPENDENT_NOISE_LEADS){
    const weights=mapping[l];if(weights?.length!==2||!weights.every(Number.isFinite))throw new Error('Missing noise mapping');
    const x=Float64Array.from({length:n},(_,i)=>weights[0]*channels[0][i]+weights[1]*channels[1][i]);
    const m=mean(x,lo,hi);for(let i=0;i<n;i++)x[i]-=m;
    noise[l]=x;noisePower+=centeredPower(x,lo,hi);signalPower+=centeredPower(clean.leads[l],lo,hi);
  }
  if(snrDb!==null && (!Number.isFinite(snrDb)||signalPower<=0||noisePower<=0))throw new Error('Undefined SNR calibration');
  const scale=snrDb===null?0:Math.sqrt(signalPower/noisePower)*10**(-snrDb/20);
  const leads=Object.fromEntries(INDEPENDENT_NOISE_LEADS.map(l=>[l,Float64Array.from(clean.leads[l],(v,i)=>v+scale*noise[l][i])]));
  const signal=deriveLimbs({fs:clean.fs,leads});assertIdentities(signal);
  const actualNoisePower=INDEPENDENT_NOISE_LEADS.reduce((s,l)=>s+centeredPower(Float64Array.from(leads[l],(v,i)=>v-clean.leads[l][i]),lo,hi),0);
  const achievedDb=snrDb===null?null:10*Math.log10(signalPower/actualNoisePower);
  if(snrDb!==null && (!Number.isFinite(achievedDb)||Math.abs(achievedDb!-snrDb)>1e-6))throw new Error('Requested SNR not achieved');
  return {signal,scaleMvPerCount:scale,achievedDb,perLeadDb:Object.fromEntries(INDEPENDENT_NOISE_LEADS.map(l=>{
    const sp=centeredPower(clean.leads[l],lo,hi),np=centeredPower(noise[l],lo,hi)*scale*scale;
    return [l,sp>0&&np>0?10*Math.log10(sp/np):null];}))};
}
/** Same kernels/cutoffs, explicitly a POST-acquisition 500 Hz test chain. */
export function filterSamples(input:Samples,mode:FilterMode,kernels:{highpass:typeof highpass;biquad:typeof biquad;applyAcquisitionFilter?:typeof applyAcquisitionFilter}={highpass,biquad,applyAcquisitionFilter}):Samples {
  if(!['off','diagnostic','monitor','aggressive'].includes(mode))throw new Error('Unknown filter');
  const leads:Record<string,Float64Array>={};
  for(const l of INDEPENDENT_NOISE_LEADS){const a=new Float64Array(input.leads[l]);finiteArray(a);
    if(kernels.applyAcquisitionFilter) kernels.applyAcquisitionFilter(a,input.fs,mode);
    else {
    if(mode!=='off')kernels.highpass(a,input.fs,mode==='diagnostic'?.05:mode==='monitor'?.5:2);
    if(mode==='monitor'||mode==='aggressive')kernels.biquad(a,input.fs,40,'lowpass');
    }
    leads[l]=a;
  }
  return deriveLimbs({fs:input.fs,leads});
}
export function cropSamples(input:Samples,window:readonly[number,number]):Samples {
  const lo=Math.round(window[0]*input.fs),hi=Math.round(window[1]*input.fs);
  if(lo<0||hi>input.leads.I.length||hi<=lo)throw new Error('Invalid crop');
  return {fs:input.fs,leads:Object.fromEntries(ALL_NOISE_LEADS.map(l=>[l,input.leads[l].slice(lo,hi)]))};
}
export function assessPreservation(ref:WaveMetrics,actual:WaveMetrics,limits:ReviewLimits) {
  const errors={jMv:actual.jMv-ref.jMv,j60Mv:actual.j60Mv-ref.j60Mv,
    qrsPeakToPeakMv:actual.qrsPeakToPeakMv-ref.qrsPeakToPeakMv,tPeakMv:actual.tPeakMv-ref.tPeakMv,
    tAbsoluteAreaMvS:actual.tAbsoluteAreaMvS-ref.tAbsoluteAreaMvS};
  if(!Object.values(errors).every(Number.isFinite))throw new Error('Nonfinite morphology error');
  const exceeded={j:Math.abs(errors.jMv)>limits.stMv,j60:Math.abs(errors.j60Mv)>limits.stMv,
    qrs:Math.abs(errors.qrsPeakToPeakMv)>Math.max(limits.peakMv,limits.qrsRelative*ref.qrsPeakToPeakMv),
    tPeak:Math.abs(errors.tPeakMv)>Math.max(limits.peakMv,limits.tRelative*Math.abs(ref.tPeakMv)),
    tArea:Math.abs(errors.tAbsoluteAreaMvS)>Math.max(limits.areaMvS,limits.areaRelative*ref.tAbsoluteAreaMvS)};
  return {errors,exceeded,requiresReview:Object.values(exceeded).some(Boolean)};
}
export function compareMorphology(clean:Samples,actual:Samples,windows:Windows,limits:ReviewLimits) {
  if(clean.fs!==actual.fs)throw new Error('Sample rate mismatch');
  return Object.fromEntries(ALL_NOISE_LEADS.map(l=>[l,assessPreservation(morphologyMetrics(clean.leads[l],clean.fs,windows),morphologyMetrics(actual.leads[l],actual.fs,windows),limits)]));
}
export function retainedEstimate(value:number|null,status:string,reference:number|null,tolerance:number) {
  if(value!==null&&!Number.isFinite(value))throw new Error('Nonfinite reported measurement');
  const retained=value!==null&&status!=='unavailable',comparable=retained&&reference!==null&&Number.isFinite(reference);
  const error=comparable?value!-reference!:null;
  return {status,retained,referenceAvailable:reference!==null,error,exceedsReviewLimit:error!==null?Math.abs(error)>tolerance:null};
}
export function waveformRmse(a:Samples,b:Samples,window:readonly[number,number]) {
  const lo=Math.round(a.fs*window[0]),hi=Math.round(a.fs*window[1]);let total=0;
  for(const l of INDEPENDENT_NOISE_LEADS)for(let i=lo;i<hi;i++)total+=(a.leads[l][i]-b.leads[l][i])**2;
  return Math.sqrt(total/((hi-lo)*8));
}
