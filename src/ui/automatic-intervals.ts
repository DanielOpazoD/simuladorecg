import type { Measurement, ECGCase } from '../engine/types';
import type { Layout } from '../render/ecg';
import { esc } from './helpers';
import { intervalValue, intervalDescription, MEASUREMENT_STATE } from './measurement-presentation';

export function acceptedBeatIntervals(m: Measurement, beat: Measurement['beats'][number], from: number, to: number) {
  if(m.qrs===null || m.evidence.qrs.status==='unavailable')return [];
  return (['pr','qrs','qt'] as const).flatMap(key=>{
    const start=key==='pr'?beat.pOnset:beat.onset,end=key==='pr'?beat.onset:key==='qrs'?beat.offset:beat.tEnd;
    if(m[key]===null || m.evidence[key].status==='unavailable' || start===null || end===null || !Number.isFinite(start+end) || end<=start || start<from || end>to)return [];
    return [{key,start,end,ms:Math.round((end-start)*1000),review:m.evidence[key].status==='review',reason:m.evidence[key].reason}];
  });
}

export function automaticIntervals(m: Measurement, layout: Layout, c: ECGCase) {
  if (layout.mode !== 'paper' || ['vf','asystole'].includes(c.rhythm) || m.qrs === null || m.evidence.qrs.status === 'unavailable') return [];
  // Share one representative beat across consecutive leads in each time column.
  // analyzer combines leads; these are not independent measurements of each lead.
  const columns = new Map<number, number[]>();
  layout.segments.slice(0,12).forEach((s,i)=>{const rows=columns.get(s.x)??[];rows.push(i);columns.set(s.x,rows);});
  return [...columns.values()].flatMap(rows=>{
    const seg=layout.segments[rows[0]];
    // In short columns, prefer a beat whose accepted intervals fit completely.
    // This changes only the displayed representative beat, never its boundaries.
    const visibleIntervals=(b:Measurement['beats'][number])=>acceptedBeatIntervals(m,b,seg.start,seg.start+seg.duration).length;
    const beat=m.beats.filter(b=>b.onset>=seg.start && b.offset<=seg.start+seg.duration)
      .sort((a,b)=>visibleIntervals(b)-visibleIntervals(a) || Math.abs(a.qrs-m.qrs!)-Math.abs(b.qrs-m.qrs!) || Math.abs(a.onset-seg.start-seg.duration/2)-Math.abs(b.onset-seg.start-seg.duration/2))[0];
    if(!beat)return [];
    // Each label and bracket uses its own existing signal-free header band.
    // Nothing is inserted into flow and no samples are covered by a label.
    return (['pr','qrs','qt'] as const).flatMap((key,row)=>{
      const segment=rows[row]??rows[0], target=layout.segments[segment];
      const interval=acceptedBeatIntervals(m,beat,seg.start,seg.start+seg.duration).find(mark=>mark.key===key);
      if(!interval)return [];
      const {start,end}=interval;
      const x1=target.x+(start-target.start)*c.view.speed,x2=target.x+(end-target.start)*c.view.speed;
      // Leave a subpixel margin for SVG/CSS rounding at fitted display scales.
      const fontMm=Math.max(4,14.1/(layout.pxPerMm??4)), labelWidth=fontMm*7.4;
      const ms=Math.round((end-start)*1000), review=m.evidence[key].status==='review';
      if(fontMm<=6){
        // One aligned band for each row. Values sit immediately above their
        // bracket, centered on its actual endpoints. Clamp only at a column
        // edge, leaving the lead name and neighbouring column unobstructed.
        const textWidth=`${key.toUpperCase()} ${intervalValue(ms,review)}`.length*fontMm*.62+1;
        const leadWidth=Math.max(3.5,10/(layout.pxPerMm??4))*.62*(target.lead.length+(target.polarity<0?1:0))+3;
        const labelX=Math.max(target.x+leadWidth+textWidth/2,Math.min((x1+x2)/2,target.x+target.width-textWidth/2-1));
        return [{key,segment,lead:target.lead,start,end,ms,review,reason:m.evidence[key].reason,
          x1,x2,y:target.y+7.5,labelY:target.y+5,labelX,labelAnchor:'middle',fontMm}];
      }
      // Extremely small overview scales keep the existing single-line label:
      // stacking a 14 px value here would invade the signal's reserved space.
      const labelAnchor=x1-target.x>labelWidth+8?'end':'start';
      const above=labelAnchor==='start'&&x2+labelWidth+3>target.x+target.width;
      const labelX=labelAnchor==='end'?x1-2:above?target.x+7:x2+2;
      const y=target.y+(above?7.5:Math.max(4.8,fontMm*.85));
      return [{key,segment,lead:target.lead,start,end,ms:Math.round((end-start)*1000),review:m.evidence[key].status==='review',reason:m.evidence[key].reason,
        x1,x2,y,labelY:above?target.y+3.5:y+1,labelX,labelAnchor,fontMm}];
    });
  });
}

export function renderAutomaticIntervals(root:HTMLElement,m:Measurement|null,layout:Layout|null,c:ECGCase,active:boolean) {
  root.hidden=!active || !m || !layout;
  if(root.hidden){root.replaceChildren();return;}
  const marks=automaticIntervals(m!,layout!,c);
  root.style.width=`${layout!.widthMm*layout!.pxPerMm}px`;root.style.height=`${layout!.heightMm*layout!.pxPerMm}px`;
  root.innerHTML=`<svg viewBox="0 0 ${layout!.widthMm} ${layout!.heightMm}" role="img" aria-label="${esc(`Intervalos estimados del latido marcado. ${marks.map(mark=>`${mark.lead}: ${mark.key.toUpperCase()} ${mark.ms} ms${mark.review?': revisar':'.'}`).join(' ')}`)}">${marks.map(mark=>`<g class="auto-${mark.key}" data-interval="${mark.key}" data-start="${mark.start}" data-end="${mark.end}" data-ms="${mark.ms}" data-segment="${mark.segment}"><title>${esc(intervalDescription(mark.key,mark.ms,mark.review,mark.reason))}</title><path d="M${mark.x1} ${mark.y-1}v2M${mark.x1} ${mark.y}H${mark.x2}M${mark.x2} ${mark.y-1}v2"/><path class="auto-guide" d="M${mark.x1} ${mark.y+1}V${layout!.segments[mark.segment].y+layout!.segments[mark.segment].height-2}M${mark.x2} ${mark.y+1}V${layout!.segments[mark.segment].y+layout!.segments[mark.segment].height-2}"/><text class="auto-value" x="${mark.labelX}" y="${mark.labelY}" text-anchor="${mark.labelAnchor}" style="font-size:${mark.fontMm}px">${mark.key.toUpperCase()} ${intervalValue(mark.ms,mark.review)}</text></g>`).join('')}</svg>${marks.some(mark=>mark.review)?`<span class="auto-review">* ${MEASUREMENT_STATE.review}</span>`:''}${!marks.length?'<span class="auto-unavailable">Sin intervalos estimables en esta vista</span>':''}`;
}
