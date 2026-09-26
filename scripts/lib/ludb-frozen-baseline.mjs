/** Evaluation only. No generator, detector tuning, diagnosis or source metadata enters analysis. */
import { assessWave } from './external-delineation-evaluation.mjs';
import { matchQrsEvents } from '../../tests/reference/ludb/load-ludb.mjs';

const finite = x => typeof x === 'number' && Number.isFinite(x);
const keys = ['peak', 'onset', 'offset', 'duration'];
const metrics = ['pr', 'qrs', 'qt'];
export function median(xs) {
  if (!xs.length) return null;
  if (!xs.every(finite)) throw new Error('Nonfinite observation');
  const a = [...xs].sort((x,y)=>x-y), i = Math.floor(a.length/2);
  return a.length%2 ? a[i] : (a[i-1]+a[i])/2;
}
/** Explicit convention: ordinary median; nearest-rank p95, not a clinical acceptance bound. */
export function errors(xs) {
  if (!xs.every(finite)) throw new Error('Nonfinite error cannot be omitted');
  const a = xs.map(Math.abs).sort((x,y)=>x-y), n=a.length;
  return {n, biasMs:n?xs.reduce((x,y)=>x+y,0)/n:null,
    maeMs:n?a.reduce((x,y)=>x+y,0)/n:null, medianAbsMs:median(a),
    p95AbsMs:n?a[Math.ceil(.95*n)-1]:null, maxAbsMs:n?a[n-1]:null};
}
function validEvents(events) {
  const seen=new Set();
  for (const e of events) {
    if (!finite(e.peak)||seen.has(e.peak)) throw new Error('Invalid or duplicate event peak');
    seen.add(e.peak);
    for(const k of ['onset','offset']) if(e[k]!==null&&!finite(e[k])) throw new Error('Invalid boundary');
    if ((finite(e.onset)&&e.onset>e.peak)||(finite(e.offset)&&e.offset<e.peak))
      throw new Error('Boundary ordering is invalid');
  }
}
export function predictions(m,wave) {
  if(!Array.isArray(m.beats)||!Array.isArray(m.detectedPeaks)) throw new Error('Missing candidates');
  const beats=new Map(m.beats.map(b=>[b.peak,b]));
  if(beats.size!==m.beats.length) throw new Error('Duplicate beat');
  if(m.beats.some(b=>!m.detectedPeaks.includes(b.peak))) throw new Error('Beat without detected QRS');
  // Detection is assessed even if the analyzer did not delineate the detected complex.
  const rows=wave==='QRS' ? m.detectedPeaks.map(peak=>({peak,
    onset:beats.get(peak)?.onset??null,offset:beats.get(peak)?.offset??null})) :
    m.beats.flatMap(b=>{
      const peak=wave==='P'?b.pPeak:b.tPeak;
      if(peak===null||peak===undefined)return [];
      return [{peak,onset:(wave==='P'?b.pOnset:b.tOnset)??null,
        offset:(wave==='P'?b.pEnd:b.tEnd)??null}];
    });
  validEvents(rows);return rows;
}
/** Missing/incomplete annotation is not evidence that a predicted wave is false. */
export function assessWindow(reference,predicted,window,tolerance=.15) {
  validEvents(reference.events);validEvents(predicted);
  const refs=reference.events.filter(r=>r.peak>=window.start&&r.peak<=window.end);
  const scoreWindow=refs.length?{start:Math.max(window.start,Math.min(...refs.map(r=>r.peak))-tolerance),
    end:Math.min(window.end,Math.max(...refs.map(r=>r.peak))+tolerance)}:null;
  const inside=scoreWindow?predicted.filter(p=>p.peak>=scoreWindow.start&&p.peak<=scoreWindow.end):[];
  const first=matchQrsEvents(refs.map(r=>r.peak),inside.map(p=>p.peak),tolerance);
  const matched=new Set(first.pairs.map(p=>p.detected));
  const unscorable=inside.filter(p=>!matched.has(p.peak)&&reference.excluded.some(e=>
    Math.abs(e.anchorPeak-p.peak)<=tolerance));
  const ignored=new Set(unscorable.map(p=>p.peak));
  const result=assessWave({...reference,events:refs},inside.filter(p=>!ignored.has(p.peak)),tolerance);
  for(const k of keys)Object.assign(result.endpoint[k],errors(result.errors.flatMap(e=>e[k+'Ms']===null?[]:[e[k+'Ms']])));
  const pairedRef=new Set(result.detection.pairs.map(p=>p.reference));
  const pairedPred=new Set(result.detection.pairs.map(p=>p.detected));
  return {...result,scoreWindow,allPredictedEvents:predicted.length,
    referencesOutsideAnalysis:reference.events.length-refs.length,
    outsideWindowPeaks:scoreWindow?predicted.filter(p=>p.peak<scoreWindow.start||p.peak>scoreWindow.end).map(p=>p.peak):[],
    unscoredNoReferencePeaks:scoreWindow?[]:predicted.map(p=>p.peak),
    unscoredIncompleteReferencePeaks:unscorable.map(p=>p.peak),
    missedReferencePeaks:refs.filter(r=>!pairedRef.has(r.peak)).map(r=>r.peak),
    unmatchedPredictedPeaks:inside.filter(p=>!ignored.has(p.peak)&&!pairedPred.has(p.peak)).map(p=>p.peak)};
}
/** Association is descriptive, never proof of AV conduction. Ambiguity remains explicit. */
export function intervalReferences(refs,policy) {
  const qs=[...refs.QRS.events].sort((a,b)=>a.peak-b.peak);
  const rows=qs.map((q,i)=>{
    const previous=qs[i-1]?.peak??-Infinity;
    const next=qs[i+1], nextLimit=(next?.onset??next?.peak??Infinity)-policy.tMustEndBeforeNextQrsSeconds;
    const ps=refs.P.events.filter(p=>p.peak>=Math.max(previous,q.peak-policy.pMaximumBeforeQrsSeconds)&&
      p.peak<=q.peak-policy.pMinimumBeforeQrsSeconds);
    const ts=refs.T.events.filter(t=>t.peak>=q.peak+policy.tMinimumAfterQrsSeconds&&
      t.peak<=Math.min(q.peak+policy.tMaximumAfterQrsSeconds,nextLimit));
    const p=ps.length===1?ps[0]:null,t=ts.length===1?ts[0]:null;
    let pReason=ps.length===0?'missing':ps.length>1?'ambiguous':'associated';
    let tReason=ts.length===0?'missing':ts.length>1?'ambiguous':'associated';
    if(p&&(!finite(p.onset)||!finite(q.onset)))pReason='missing_boundary';
    else if(p&&(p.onset>=q.onset||(finite(p.offset)&&p.offset>q.onset)))pReason='overlap';
    if(t&&(!finite(t.offset)||!finite(q.onset)))tReason='missing_boundary';
    else if(t&&(t.offset>nextLimit||(finite(t.onset)&&finite(q.offset)&&t.onset<q.offset)))tReason='overlap';
    return {qrsPeak:q.peak,pPeak:p?.peak??null,tPeak:t?.peak??null,pReason,tReason,
      pr:pReason==='associated'?(q.onset-p.onset)*1000:null,
      qrs:finite(q.onset)&&finite(q.offset)?(q.offset-q.onset)*1000:null,
      qt:tReason==='associated'?(t.offset-q.onset)*1000:null};
  });
  const values=Object.fromEntries(metrics.map(k=>[k,rows.flatMap(r=>finite(r[k])?[r[k]]:[])]));
  return {rows,values,median:Object.fromEntries(metrics.map(k=>[k,median(values[k])]))};
}
export function assessRecord(signal,references,analyze,protocol) {
  const m=analyze({fs:signal.fs,leads:signal.leads});
  const w=m.window;
  if(!w||!finite(w.start)||!finite(w.end)||w.start<0||w.end<=w.start||w.end>signal.leads.I.length/signal.fs)
    throw new Error('Invalid analysis window');
  const waves=Object.fromEntries(['P','QRS','T'].map(k=>[k,assessWindow(references[k],predictions(m,k),w,protocol.eventMatchToleranceSeconds)]));
  const reference=intervalReferences(references,protocol.intervalAssociation),intervals={};
  for(const k of metrics){
    const value=m[k];if(value!==null&&!finite(value))throw new Error('Invalid measurement');
    const status=m.evidence?.[k]?.status;
    if(!['usable','review','unavailable'].includes(status))throw new Error('Unknown measurement status');
    if((status==='unavailable')!==(value===null))throw new Error('Inconsistent value/status');
    const r=reference.median[k];
    intervals[k]={referenceMedianMs:r,referenceValues:reference.values[k].length,measuredMs:value,
      errorMs:r!==null&&value!==null?value-r:null,status,reason:m.evidence[k].reason};
  }
  const pairedIntervals=Object.fromEntries(metrics.map(k=>[k,{referenceEligible:reference.values[k].length,rows:[]}])) ;
  for(const pair of waves.QRS.detection.pairs){
    const r=reference.rows.find(r=>r.qrsPeak===pair.reference),b=m.beats.find(b=>b.peak===pair.detected);
    if(!r||!b)continue;
    for(const k of metrics){
      const sameWave=k==='qrs'||(k==='pr'?finite(b.pPeak)&&finite(r.pPeak)&&Math.abs(b.pPeak-r.pPeak)<=protocol.eventMatchToleranceSeconds:
        finite(b.tPeak)&&finite(r.tPeak)&&Math.abs(b.tPeak-r.tPeak)<=protocol.eventMatchToleranceSeconds);
      if(sameWave&&finite(b[k])&&finite(r[k]))pairedIntervals[k].rows.push({referencePeak:r.qrsPeak,
        detectedPeak:b.peak,errorMs:b[k]-r[k],recordStatus:intervals[k].status});
    }
  }
  const review=[];
  if(!m.beats.some(b=>finite(b.pEnd)))review.push('P_offset_not_exposed');
  if(!m.beats.some(b=>finite(b.tOnset)))review.push('T_onset_not_exposed');
  if(waves.P.detection.fn)review.push('P_events_missed');
  if(waves.T.detection.fn)review.push('T_events_missed');
  if((waves.T.endpoint.offset.maxAbsMs??0)>50)review.push('T_offset_error_above_50ms');
  const qr=references.QRS.events.map(q=>q.peak).sort((a,b)=>a-b);
  const rr=qr.slice(1).map((v,i)=>v-qr[i]);
  const referenceHr=rr.length?60/median(rr):null;
  if(reference.median.qrs>=120)review.push('reference_QRS_at_least_120ms');
  if(referenceHr>100)review.push('reference_rate_above_100bpm');
  if(reference.rows.some(r=>r.pReason==='ambiguous'||r.tReason==='ambiguous'||r.tReason==='overlap'||r.pReason==='overlap'))
    review.push('interval_reference_requires_adjudication');
  return {waves,intervals,pairedIntervals,referenceIntervals:reference,analysisWindow:w,
    triage:{referenceHr,referenceQrsMedianMs:reference.median.qrs,review,
      clinicalCause:'not_adjudicated',
      manualChecks:['low_amplitude_T','hidden_or_overlapping_P','secondary_repolarization','noise','polarity_change','ST_displacement']}};
}
export function poolRecords(records) {
  const waves={};
  for(const wave of ['P','QRS','T']){
    const ws=records.map(r=>r.waves[wave]);const sum=f=>ws.reduce((s,r)=>s+f(r),0);
    const tp=sum(r=>r.detection.tp),fp=sum(r=>r.detection.fp),fn=sum(r=>r.detection.fn);
    const endpoint={};
    for(const k of keys){
      const summary=errors(ws.flatMap(r=>r.errors.flatMap(e=>e[k+'Ms']===null?[]:[e[k+'Ms']])));
      const eligible=sum(r=>r.endpoint[k].referenceEligible);
      const maes=ws.flatMap(r=>r.endpoint[k].maeMs===null?[]:[r.endpoint[k].maeMs]);
      endpoint[k]={...summary,referenceEligible:eligible,coverageOfEligible:eligible?summary.n/eligible:null,
        recordsWithValues:maes.length,macroRecordMaeMs:maes.length?maes.reduce((a,b)=>a+b,0)/maes.length:null};
    }
    waves[wave]={tp,fp,fn,sensitivity:tp+fn?tp/(tp+fn):null,ppv:tp+fp?tp/(tp+fp):null,
      referenceEvents:sum(r=>r.referenceEvents),allPredictions:sum(r=>r.allPredictedEvents),
      excludedReferenceGroups:sum(r=>r.excludedReferenceGroups.length),
      outsideWindowPredictions:sum(r=>r.outsideWindowPeaks.length),
      unscoredNoReferencePredictions:sum(r=>r.unscoredNoReferencePeaks.length),
      unscoredIncompleteReferencePredictions:sum(r=>r.unscoredIncompleteReferencePeaks.length),endpoint};
  }
  const intervals={},pairedIntervals={};
  for(const k of metrics){
    const rs=records.map(r=>r.intervals[k]),withRef=rs.filter(r=>r.referenceMedianMs!==null);
    const both=withRef.filter(r=>r.measuredMs!==null);
    const statuses=Object.fromEntries(['usable','review','unavailable'].map(s=>[s,rs.filter(r=>r.status===s).length]));
    intervals[k]={records:rs.length,referenceEligibleRecords:withRef.length,numericWithReference:both.length,
      coverageOfEligible:withRef.length?both.length/withRef.length:null,abstentionsWithReference:withRef.length-both.length,
      numbersWithoutReference:rs.filter(r=>r.referenceMedianMs===null&&r.measuredMs!==null).length,
      statuses,statusPercent:Object.fromEntries(Object.entries(statuses).map(([s,n])=>[s,rs.length?100*n/rs.length:null])),
      errors:errors(both.map(r=>r.errorMs)),
      usableErrors:errors(both.filter(r=>r.status==='usable').map(r=>r.errorMs)),
      reviewErrors:errors(both.filter(r=>r.status==='review').map(r=>r.errorMs))};
    const pairs=records.flatMap(r=>r.pairedIntervals[k].rows),eligible=records.reduce((s,r)=>s+r.pairedIntervals[k].referenceEligible,0);
    pairedIntervals[k]={...errors(pairs.map(r=>r.errorMs)),referenceEligible:eligible,
      coverageOfEligible:eligible?pairs.length/eligible:null,
      statusScope:'Global record status, not independently calibrated per-beat confidence'};
  }
  return {records:records.length,waves,intervals,pairedIntervals};
}
