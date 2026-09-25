import { matchQrsEvents } from '../../tests/reference/ludb/load-ludb.mjs';

export function errorSummary(values) {
  if (!values.every(Number.isFinite)) throw new Error('Nonfinite error cannot be silently excluded');
  const abs=values.map(Math.abs).sort((a,b)=>a-b), n=values.length;
  const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
  return {n,biasMs:n?mean(values):null,maeMs:n?mean(abs):null,
    medianAbsMs:n?abs[Math.floor((n-1)*.5)]:null,
    p95AbsMs:n?abs[Math.floor((n-1)*.95)]:null,maxAbsMs:n?abs.at(-1):null};
}
export function assessExternalQrs(signal, reference, analyze, tolerance=.15) {
  if (!reference.beats.length) throw new Error('No aggregate reference; record requires explicit review, not omission');
  // Deliberately pass a new object with only physical samples/fs: no clinical case/calendar.
  const m=analyze({fs:signal.fs,leads:signal.leads});
  if (!m.detectedPeaks.every(Number.isFinite)) throw new Error('Nonfinite detected peak');
  const window={start:Math.max(0,reference.beats[0].peak-tolerance),end:Math.min(signal.leads.I.length/signal.fs,reference.beats.at(-1).peak+tolerance)};
  const peaks=m.detectedPeaks.filter(p=>p>=window.start&&p<=window.end);
  const detection=matchQrsEvents(reference.beats.map(b=>b.peak),peaks,tolerance);
  const errors=[];
  for(const pair of detection.pairs) {
    const r=reference.beats.find(b=>b.peak===pair.reference), b=m.beats.find(b=>b.peak===pair.detected);
    if(!b) continue;
    const row={referencePeak:pair.reference,detectedPeak:pair.detected,
      onsetMs:r.qrsOnset===null?null:(b.onset-r.qrsOnset)*1000,
      offsetMs:r.qrsOffset===null?null:(b.offset-r.qrsOffset)*1000,
      widthMs:r.qrsOnset===null||r.qrsOffset===null?null:b.qrs-(r.qrsOffset-r.qrsOnset)*1000};
    if(![row.onsetMs,row.offsetMs,row.widthMs].every(x=>x===null||Number.isFinite(x)))throw new Error('Invalid delineation');
    errors.push(row);
  }
  return {window,referenceEvents:reference.beats.length,excludedReferenceGroups:reference.excluded,
    outsideAnnotationWindow:m.detectedPeaks.length-peaks.length,detection,delineatedMatches:errors.length,
    unavailableDelineations:detection.tp-errors.length,
    referenceBounds:{onset:reference.beats.filter(b=>b.qrsOnset!==null).length,offset:reference.beats.filter(b=>b.qrsOffset!==null).length,width:reference.beats.filter(b=>b.qrsOnset!==null&&b.qrsOffset!==null).length},
    errors,...Object.fromEntries(['onset','offset','width'].map(k=>[k,errorSummary(errors.flatMap(e=>e[k+'Ms']===null?[]:[e[k+'Ms']]))]))};
}
export function poolExternalQrs(records) {
  const sum=fn=>records.reduce((a,r)=>a+fn(r),0),n=records.length;
  const tp=sum(r=>r.detection.tp),fp=sum(r=>r.detection.fp),fn=sum(r=>r.detection.fn);
  return {records:n,tp,fp,fn,sensitivity:tp+fn?tp/(tp+fn):null,ppv:tp+fp?tp/(tp+fp):null,
    referenceEvents:sum(r=>r.referenceEvents),excludedReferenceGroups:sum(r=>r.excludedReferenceGroups.length),
    outsideAnnotationWindow:sum(r=>r.outsideAnnotationWindow),delineatedMatches:sum(r=>r.delineatedMatches),
    endpoints:Object.fromEntries(['onset','offset','width'].map(k=>{
      const micro=errorSummary(records.flatMap(r=>r.errors.flatMap(e=>e[k+'Ms']===null?[]:[e[k+'Ms']])));
      const eligible=sum(r=>r.referenceBounds[k]),perRecord=records.map(r=>r[k].maeMs).filter(x=>x!==null);
      return [k,{...micro,referenceEligible:eligible,coverageOfEligible:eligible?micro.n/eligible:null,
        coverageOfAllReferenceEvents:tp+fn?micro.n/(tp+fn):null,recordsWithValues:perRecord.length,
        macroRecordMaeMs:perRecord.length?perRecord.reduce((a,b)=>a+b,0)/perRecord.length:null}];
    }))};
}
