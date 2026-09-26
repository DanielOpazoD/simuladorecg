import { errorSummary } from './external-qrs-evaluation.mjs';
import { matchQrsEvents } from '../../tests/reference/ludb/load-ludb.mjs';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const median = (values) => {
  if (!values.length) return null;
  const x=[...values].sort((a,b)=>a-b), m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
};

function predictedWaves(measurement, wave) {
  const fields = wave === 'P'
    ? { peak:'pPeak', onset:'pOnset', offset:'pEnd' }
    : wave === 'QRS'
      ? { peak:'peak', onset:'onset', offset:'offset' }
      : { peak:'tPeak', onset:'tOnset', offset:'tEnd' };
  return measurement.beats.flatMap((beat) => {
    const peak=beat[fields.peak];
    if (!finite(peak)) return [];
    const onset=finite(beat[fields.onset])?beat[fields.onset]:null;
    const offset=finite(beat[fields.offset])?beat[fields.offset]:null;
    return [{ peak, onset, offset }];
  });
}

export function assessWave(reference, predicted, tolerance=0.15) {
  const detection=matchQrsEvents(reference.events.map(x=>x.peak),predicted.map(x=>x.peak),tolerance);
  const errors=[];
  for (const pair of detection.pairs) {
    const ref=reference.events.find(x=>x.peak===pair.reference);
    const pred=predicted.find(x=>x.peak===pair.detected);
    if (!ref || !pred) continue;
    const row={referencePeak:ref.peak,detectedPeak:pred.peak,
      peakMs:(pred.peak-ref.peak)*1000,onsetMs:null,offsetMs:null,durationMs:null};
    if (finite(ref.onset) && finite(pred.onset)) row.onsetMs=(pred.onset-ref.onset)*1000;
    if (finite(ref.offset) && finite(pred.offset)) row.offsetMs=(pred.offset-ref.offset)*1000;
    if (finite(ref.onset) && finite(ref.offset) && finite(pred.onset) && finite(pred.offset))
      row.durationMs=((pred.offset-pred.onset)-(ref.offset-ref.onset))*1000;
    errors.push(row);
  }
  const eligible={
    peak:reference.events.length,
    onset:reference.events.filter(x=>finite(x.onset)).length,
    offset:reference.events.filter(x=>finite(x.offset)).length,
    duration:reference.events.filter(x=>finite(x.onset)&&finite(x.offset)).length
  };
  const endpoint={};
  for (const key of ['peak','onset','offset','duration']) {
    const values=errors.flatMap(e=>e[key+'Ms']===null?[]:[e[key+'Ms']]);
    const summary=errorSummary(values);
    endpoint[key]={...summary,referenceEligible:eligible[key],
      coverageOfEligible:eligible[key]?summary.n/eligible[key]:null,
      coverageOfMatched:detection.tp?summary.n/detection.tp:null};
  }
  return {referenceEvents:reference.events.length,excludedReferenceGroups:reference.excluded,
    predictedEvents:predicted.length,detection,endpoint,errors};
}

export function referenceIntervals(references, policy) {
  const qrs=[...references.QRS.events].sort((a,b)=>a.peak-b.peak);
  const ps=[...references.P.events].sort((a,b)=>a.peak-b.peak);
  const ts=[...references.T.events].sort((a,b)=>a.peak-b.peak);
  const rows=qrs.map((q,index)=>{
    const p=ps.filter(x=>x.peak>=q.peak-policy.pMaximumBeforeQrsSeconds &&
      x.peak<=q.peak-policy.pMinimumBeforeQrsSeconds).at(-1)??null;
    const next=qrs[index+1]?.peak??Infinity;
    const tUpper=Math.min(q.peak+policy.tMaximumAfterQrsSeconds,next-policy.tMustEndBeforeNextQrsSeconds);
    const t=ts.find(x=>x.peak>=q.peak+policy.tMinimumAfterQrsSeconds&&x.peak<=tUpper)??null;
    const pr=p&&finite(p.onset)&&finite(q.onset)?(q.onset-p.onset)*1000:null;
    const qrsMs=finite(q.onset)&&finite(q.offset)?(q.offset-q.onset)*1000:null;
    const qt=t&&finite(q.onset)&&finite(t.offset)?(t.offset-q.onset)*1000:null;
    return {qrsPeak:q.peak,pPeak:p?.peak??null,tPeak:t?.peak??null,pr,qrs:qrsMs,qt};
  });
  const values=Object.fromEntries(['pr','qrs','qt'].map(k=>[k,rows.flatMap(r=>finite(r[k])?[r[k]]:[])]));
  return {rows,values,median:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,median(v)]))};
}

export function assessExternalDelineation(signal, references, analyze, protocol) {
  const measurement=analyze({fs:signal.fs,leads:signal.leads});
  if (!Array.isArray(measurement.beats)) throw new Error('Analyzer must return beat candidates');
  const waves={};
  for (const wave of ['P','QRS','T'])
    waves[wave]=assessWave(references[wave],predictedWaves(measurement,wave),protocol.eventMatchToleranceSeconds);
  const reference=referenceIntervals(references,protocol.intervalAssociation);
  const intervals={};
  for (const key of ['pr','qrs','qt']) {
    const value=finite(measurement[key])?measurement[key]:null;
    const ref=reference.median[key];
    intervals[key]={referenceMedianMs:ref,referenceValues:reference.values[key].length,
      measuredMs:value,errorMs:finite(ref)&&finite(value)?value-ref:null,
      status:measurement.evidence?.[key]?.status??(value===null?'unavailable':'unknown'),
      reason:measurement.evidence?.[key]?.reason??null};
  }
  return {waves,referenceIntervals:reference,intervals,
    analysisWindow:measurement.window??null,detectedQrsPeaks:measurement.detectedPeaks?.length??null};
}

function poolWave(records,wave) {
  const rows=records.map(r=>r.waves[wave]);
  const tp=rows.reduce((s,r)=>s+r.detection.tp,0), fp=rows.reduce((s,r)=>s+r.detection.fp,0), fn=rows.reduce((s,r)=>s+r.detection.fn,0);
  const endpoint={};
  for (const key of ['peak','onset','offset','duration']) {
    const values=rows.flatMap(r=>r.errors.flatMap(e=>e[key+'Ms']===null?[]:[e[key+'Ms']]));
    const eligible=rows.reduce((s,r)=>s+r.endpoint[key].referenceEligible,0);
    const summary=errorSummary(values);
    endpoint[key]={...summary,referenceEligible:eligible,coverageOfEligible:eligible?summary.n/eligible:null,
      coverageOfMatched:tp?summary.n/tp:null};
  }
  return {referenceEvents:rows.reduce((s,r)=>s+r.referenceEvents,0),
    excludedReferenceGroups:rows.reduce((s,r)=>s+r.excludedReferenceGroups.length,0),
    predictedEvents:rows.reduce((s,r)=>s+r.predictedEvents,0),tp,fp,fn,
    sensitivity:tp+fn?tp/(tp+fn):null,ppv:tp+fp?tp/(tp+fp):null,endpoint};
}

function poolInterval(records,key) {
  const rows=records.map(r=>r.intervals[key]);
  const withReference=rows.filter(r=>finite(r.referenceMedianMs));
  const withBoth=withReference.filter(r=>finite(r.measuredMs));
  const statuses={usable:0,review:0,unavailable:0,unknown:0};
  for(const row of rows) statuses[row.status]=(statuses[row.status]??0)+1;
  const errors=errorSummary(withBoth.map(r=>r.errorMs));
  const usableErrors=errorSummary(withBoth.filter(r=>r.status==='usable').map(r=>r.errorMs));
  const reviewErrors=errorSummary(withBoth.filter(r=>r.status==='review').map(r=>r.errorMs));
  return {records:rows.length,referenceEligibleRecords:withReference.length,numericWithReference:withBoth.length,
    abstentionsWithReference:withReference.length-withBoth.length,numbersWithoutReference:rows.filter(r=>!finite(r.referenceMedianMs)&&finite(r.measuredMs)).length,
    statuses,errors,usableErrors,reviewErrors};
}

export function poolExternalDelineation(records) {
  return {records:records.length,
    waves:Object.fromEntries(['P','QRS','T'].map(w=>[w,poolWave(records,w)])),
    intervals:Object.fromEntries(['pr','qrs','qt'].map(k=>[k,poolInterval(records,k)]))};
}
