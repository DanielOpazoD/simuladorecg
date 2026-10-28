import type { Measurement, ECGCase } from '../engine/types';
import type { Layout } from '../render/ecg';
import { esc } from './helpers';

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
    const beat=m.beats.filter(b=>b.onset>=seg.start && b.offset<=seg.start+seg.duration)
      .sort((a,b)=>Math.abs(a.qrs-m.qrs!)-Math.abs(b.qrs-m.qrs!) || Math.abs(a.onset-seg.start-seg.duration/2)-Math.abs(b.onset-seg.start-seg.duration/2))[0];
    if(!beat)return [];
    // Each label and bracket uses its own existing signal-free header band.
    // Nothing is inserted into flow and no samples are covered by a label.
    return (['pr','qrs','qt'] as const).flatMap((key,row)=>{
      const segment=rows[row]??rows[0], target=layout.segments[segment];
      const interval=acceptedBeatIntervals(m,beat,seg.start,seg.start+seg.duration).find(mark=>mark.key===key);
      if(!interval)return [];
      const {start,end}=interval;
      const x1=target.x+(start-target.start)*c.view.speed,x2=target.x+(end-target.start)*c.view.speed;
      const fontMm=Math.max(4,14/(layout.pxPerMm??4)), labelWidth=fontMm*7.4;
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
  root.innerHTML=`<svg viewBox="0 0 ${layout!.widthMm} ${layout!.heightMm}" role="img" aria-label="${esc(`Intervalos estimados del latido marcado. ${marks.map(mark=>`${mark.lead}: ${mark.key.toUpperCase()} ${mark.ms} ms${mark.review?': revisar':'.'}`).join(' ')}`)}">${marks.map(mark=>`<g class="auto-${mark.key}" data-interval="${mark.key}" data-start="${mark.start}" data-end="${mark.end}" data-ms="${mark.ms}" data-segment="${mark.segment}"><title>${esc(`${mark.key.toUpperCase()} ${mark.ms} ms. Límites estimados multiderivación del latido marcado. ${mark.reason}`)}</title><path d="M${mark.x1} ${mark.y-1}v2M${mark.x1} ${mark.y}H${mark.x2}M${mark.x2} ${mark.y-1}v2"/><path class="auto-guide" d="M${mark.x1} ${mark.y+1}V${layout!.segments[mark.segment].y+layout!.segments[mark.segment].height-2}M${mark.x2} ${mark.y+1}V${layout!.segments[mark.segment].y+layout!.segments[mark.segment].height-2}"/><text class="auto-value" x="${mark.labelX}" y="${mark.labelY}" text-anchor="${mark.labelAnchor}" style="font-size:${mark.fontMm}px">${mark.key.toUpperCase()} ${mark.ms} ms${mark.review?'*':''}</text></g>`).join('')}</svg>${!marks.length?'<span class="auto-unavailable">Sin intervalos estimables en esta vista</span>':''}`;
}
