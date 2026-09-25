/** Evaluation only. Source timings are automatic vendor fiducials, not human truth. */
export const MORPHOLOGY_LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export function vendorWindows(fiducials) {
  const names=['QRS_On_Global','QRS_Off_Global','T_On_Global','T_Off_Global'];
  if(names.some(k=>typeof fiducials[k]!=='number'||!Number.isFinite(fiducials[k])))
    throw new Error('Missing or non-finite automatic fiducial; no inferred substitute');
  const [on,off,tOn,tOff]=names.map(k=>fiducials[k]/1000);
  if(!(on>=.035&&on<off&&off<=tOn&&tOn<tOff)) throw new Error('Unordered automatic windows');
  return {baseline:[on-.035,on-.020],qrs:[on,off],t:[tOn,tOff]};
}
export function sampledMorphology(signal, windows, morphologyMetrics, sampleAt) {
  const leads={}, reasons={};
  for(const lead of MORPHOLOGY_LEADS) {
    try {
      const a=signal.leads[lead];
      if(!a || Array.from(a).some(v=>typeof v!=='number'||!Number.isFinite(v)))
        throw new Error('Missing/non-finite samples');
      const m=morphologyMetrics(a,signal.fs,windows);
      const q=[sampleAt(a,signal.fs,windows.qrs[0])-m.baselineMv];
      for(let i=Math.floor(windows.qrs[0]*signal.fs)+1;i<windows.qrs[1]*signal.fs;i++) q.push(a[i]-m.baselineMv);
      q.push(sampleAt(a,signal.fs,windows.qrs[1])-m.baselineMv);
      let area=0;
      // Exact sample-time trapezoids, including interpolated endpoints.
      let prev=windows.qrs[0]; let prevV=q[0];
      for(let i=Math.floor(prev*signal.fs)+1;i<windows.qrs[1]*signal.fs;i++) {
        const time=i/signal.fs, value=a[i]-m.baselineMv;
        area+=(time-prev)*(value+prevV)/2;prev=time;prevV=value;
      }
      area+=(windows.qrs[1]-prev)*(q.at(-1)+prevV)/2;
      leads[lead]={...m, qrsPositivePeakMv:Math.max(0,...q),qrsNegativePeakMagnitudeMv:Math.max(0,-Math.min(...q)),qrsSignedAreaMvS:area};
    } catch(e) { leads[lead]=null;reasons[lead]=String(e.message); }
  }
  const I=leads.I?.qrsSignedAreaMvS, II=leads.II?.qrsSignedAreaMvS;
  const axis=Number.isFinite(I)&&Number.isFinite(II)&&Math.hypot(I,II)>1e-10
    ? Math.atan2((2*II-I)/Math.sqrt(3),I)*180/Math.PI:null;
  const chest=MORPHOLOGY_LEADS.slice(6).map(l=>leads[l]);
  const transition=chest.some(x=>!x||x.qrsPeakToPeakMv<=1e-10)?null:
    chest.findIndex(x=>x.qrsPositivePeakMv>=x.qrsNegativePeakMagnitudeMv);
  return {leads,reasons,qrsDurationMs:(windows.qrs[1]-windows.qrs[0])*1000,
    qtFromWindowsMs:(windows.t[1]-windows.qrs[0])*1000,qrsAreaAxisDeg:axis,
    firstPrecordialPositivePeakGeNegative:transition===null?null:transition<0?'none':`V${transition+1}`};
}
export function linearSummary(values) {
  const a=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((x,y)=>x-y);
  const quantile=p=> {const pos=(a.length-1)*p,lo=Math.floor(pos);return a.length?a[lo]+(a[Math.min(lo+1,a.length-1)]-a[lo])*(pos-lo):null;};
  return {total:values.length,n:a.length,missing:values.length-a.length,p05:quantile(.05),median:quantile(.5),p95:quantile(.95)};
}
