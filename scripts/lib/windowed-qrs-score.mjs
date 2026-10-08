/** Evaluator-only boundary accounting. The reference window is defined by QRS
 * midpoint, not by a detector's interchangeable within-QRS fiducial. A detection
 * just outside that window may match an included, physically observed complex;
 * it must satisfy both actual QRS support and the unchanged 150 ms match bound.
 * Outside-window unmatched detections remain unscored, never hidden inside it. */
import {matchQrsEvents} from '../../tests/reference/ludb/load-ludb.mjs';
export function scoreWindowedQrs(events,peaks,{start=.2,end=9.8,tolerance=.15}={}){
 const reference=events.filter(b=>b.time+b.qrs/2>=start&&b.time+b.qrs/2<end);
 const anchors=reference.map(b=>b.time+b.qrs/2),inside=t=>t>=start&&t<end;
 const allowed=peaks.filter(t=>inside(t)||reference.some(b=>t>=b.time-.01&&t<=b.time+b.qrs+.03));
 const full=matchQrsEvents(anchors,allowed,tolerance),rawWindow=matchQrsEvents(anchors,peaks.filter(inside),tolerance);
 const boundaryWitnesses=full.pairs.filter(p=>!inside(p.detected)).map(p=>{
  const b=reference.find(b=>b.time+b.qrs/2===p.reference);
  return{detected:p.detected,referenceMidpoint:p.reference,onset:b.time,offset:b.time+b.qrs};
 });
 return{tp:full.tp,fn:full.fn,fp:peaks.filter(inside).length-full.pairs.filter(p=>inside(p.detected)).length,pairs:full.pairs,rawWindow,boundaryWitnesses};
}
