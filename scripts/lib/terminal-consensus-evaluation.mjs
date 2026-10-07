/** Evaluator v1a: retain every numeric value and denominator; permit one sample
 * of QRS candidate-center/boundary discretization only. References and P/T
 * ordering remain strict. The immutable original evaluator remains beside this. */
import {assessWave} from './external-delineation-evaluation.mjs';
import {matchQrsEvents} from '../../tests/reference/ludb/load-ludb.mjs';
import {median,errors,intervalReferences} from './ludb-frozen-baseline.mjs';
export {poolRecords,errors} from './ludb-frozen-baseline.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const keys=['peak','onset','offset','duration'],metrics=['pr','qrs','qt'];
function validEvents(events,orderingSlack=0) {
  const seen=new Set();
  for (const e of events) {
    if (!finite(e.peak)||seen.has(e.peak)) throw new Error('Invalid or duplicate event peak');
    seen.add(e.peak);
    for(const k of ['onset','offset']) if(e[k]!==null&&!finite(e[k])) throw new Error('Invalid boundary');
    if ((finite(e.onset)&&e.onset>e.peak+orderingSlack+1e-12)||(finite(e.offset)&&e.offset<e.peak-orderingSlack-1e-12))
      throw new Error('Boundary ordering is invalid');
  }
}
export function predictions(m,wave,orderingSlack=0) {
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
  validEvents(rows,wave==='QRS'?orderingSlack:0);return rows;
}
/** Missing/incomplete annotation is not evidence that a predicted wave is false. */
export function assessWindow(reference,predicted,window,tolerance=.15,predictedOrderingSlack=0) {
  validEvents(reference.events);validEvents(predicted,predictedOrderingSlack);
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
export function assessRecord(signal,references,analyze,protocol) {
  const m=analyze({fs:signal.fs,leads:signal.leads});
  const w=m.window;
  if(!w||!finite(w.start)||!finite(w.end)||w.start<0||w.end<=w.start||w.end>signal.leads.I.length/signal.fs)
    throw new Error('Invalid analysis window');
  const waves=Object.fromEntries(['P','QRS','T'].map(k=>[k,assessWindow(references[k],predictions(m,k,k==='QRS'?1/signal.fs:0),w,protocol.eventMatchToleranceSeconds,k==='QRS'?1/signal.fs:0)]));
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
  const samplingBoundaryExceptions=m.beats.filter(b=>b.onset>b.peak||b.offset<b.peak).map(b=>({peak:b.peak,onset:b.onset,offset:b.offset,maximumSamplingSlackSeconds:1/signal.fs,valuesChanged:false}));
  return {...(samplingBoundaryExceptions.length?{samplingBoundaryExceptions}:{}),waves,intervals,pairedIntervals,referenceIntervals:reference,analysisWindow:w,
    triage:{referenceHr,referenceQrsMedianMs:reference.median.qrs,review,
      clinicalCause:'not_adjudicated',
      manualChecks:['low_amplitude_T','hidden_or_overlapping_P','secondary_repolarization','noise','polarity_change','ST_displacement']}};
}
