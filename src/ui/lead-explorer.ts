import { LEADS, type ECGCase, type Lead, type Signal, type Measurement } from "../engine/types";
import type { Segment } from "../render/ecg";
import { caseReading } from "../presets/case-context";
import { esc } from "./helpers";
import { findingTarget, leadWindow, sampleExtent, type SampleWindow } from "./reading-focus";
import { acceptedBeatIntervals } from './automatic-intervals';
import { stMarks } from '../render/st-lens';
import { LensCaliper } from './lens-caliper';
import { intervalValue, intervalDescription, MEASUREMENT_STATE } from './measurement-presentation';

export type LensMode = 'all' | 'pr' | 'qrs' | 'qt' | 'st' | 'none';
export interface LensMark { key:'pr'|'qrs'|'qt'|'st'; start:number; end:number; value:string; detail:string }
export function lensMarks(s:Signal, lead:Lead, w:SampleWindow, polarity:number, m:Measurement|null, mode:LensMode):LensMark[] {
  if(mode==='none')return [];
  if(mode==='st')return stMarks(s,lead,w.start,w.end).filter(x=>Number.isFinite(x.j0)).map(x=>({key:'st',start:x.jTime,end:x.endTime,value:`${(x.j0*polarity*10).toFixed(1)} mm`,detail:'J situado por el modelo; ST leído en las muestras respecto al PR.'}));
  if(!m)return [];
  return m.beats.flatMap(b=>acceptedBeatIntervals(m,b,w.start,w.end).filter(x=>mode==='all'||x.key===mode).map(x=>({key:x.key,start:x.start,end:x.end,value:intervalValue(x.ms,x.review),detail:intervalDescription(x.key,x.ms,x.review,x.reason)})));
}

/** Uniform ECG grid from final samples. All points are kept; no interpolation or smoothing. */
export function enlargedTrace(s: Signal, lead: Lead, w: SampleWindow, polarity: number, marks?:LensMark[]): string {
  const speed = 50, gain = 10, width = (w.end - w.start) * speed + 8;
  const top = Math.ceil(Math.max(w.high * polarity, w.low * polarity) * 10) / 10 + .2;
  const low = Math.floor(Math.min(w.high * polarity, w.low * polarity) * 10) / 10 - .2;
  const traceHeight = Math.max(12, (top - low) * gain) + 4;
  // Reserve the same three lanes even when hidden: toggling never moves waves.
  const height = traceHeight + (marks ? 30 : 0);
  const annotations=(marks??[]).map(mark=>{
    const lane=mark.key==='qrs'?1:mark.key==='qt'?2:0;
    const x1=4+(mark.start-w.start)*speed,x2=4+(mark.end-w.start)*speed,y=traceHeight+2+lane*10;
    return `<g class="lens-mark lens-${mark.key}" data-key="${mark.key}" data-start="${mark.start}" data-end="${mark.end}"><title>${esc(mark.detail)}</title><path class="lens-guide" d="M${x1} 2V${traceHeight}M${x2} 2V${traceHeight}"/><path class="lens-bracket" d="M${x1} ${y-1}v2M${x1} ${y}H${x2}M${x2} ${y-1}v2"/><text x="${(x1+x2)/2}" y="${y+5}" text-anchor="middle">${mark.key.toUpperCase()} ${esc(mark.value)}</text></g>`;
  }).join('');
  const path: string[] = [];
  for (let i = Math.round(w.start * s.fs); i <= Math.round(w.end * s.fs); i++)
    path.push(`${path.length ? "L" : "M"}${(4 + (i / s.fs - w.start) * speed).toFixed(4)},${(4 + (top - s.leads[lead][i] * polarity) * gain).toFixed(4)}`);
  return `<svg data-baseline="${4+top*gain}" data-trace-height="${traceHeight}" class="lead-detail-trace" viewBox="0 0 ${width} ${height}" style="width:100%" role="img" aria-label="ECG ampliado de ${esc(polarity < 0 ? "−" + lead : lead)}. ${esc((marks??[]).map(m=>m.key.toUpperCase()+' '+m.value).join('; '))}"><defs><pattern id="lead-small-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" class="lead-grid-fine"/></pattern><pattern id="lead-big-grid" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#lead-small-grid)"/><path d="M5 0H0V5" class="lead-grid-bold"/></pattern></defs><rect width="100%" height="100%" class="lead-paper"/><rect width="100%" height="100%" fill="url(#lead-big-grid)"/><path class="lead-sample-path" d="${path.join(" ")}"/>${annotations}</svg>`;
}

export function mountLeadExplorer(root: HTMLElement, s: Signal, c: ECGCase, seg: Segment, time?: number, measurement:Measurement|null=null, preference:{mode?:LensMode;onChange?:(mode:LensMode)=>void}={}) {
  const initial = leadWindow(s, seg, time);
  if (!initial) { root.textContent = "No hay muestras completas y finitas en este fragmento."; return; }
  let lead = seg.lead, mode:LensMode=preference.mode??'all';
  let annotationLanes:LensMark['key'][]=[], annotationRows=0;
  root.className = "lead-explorer";
  const title = root.closest("dialog")!.querySelector(".dialog-head h2")!;
  title.innerHTML = `<label class="lead-detail-select">Derivación <select aria-label="Derivación ampliada">${LEADS.map(l=>`<option value="${l}"${l === lead ? " selected" : ""}>${c.view.cabrera && l === 'aVR' ? '−' : ''}${l}</option>`).join("")}</select></label>`;
  const count=initial.beat===null?0:s.events.beats.filter(b=>b.time>=initial.start&&b.time<=initial.end).length;
  root.dataset.beatCount=String(count);
  root.innerHTML = `<div class="lead-lens-controls"><button type="button" class="btn lens-measure" aria-label="Medir en la lupa" aria-pressed="false" title="Medir arrastrando · ${count} latidos">Medir</button><span class="sr-only">${count===2?'Lupa · 2 latidos':count===1?'Lupa · 1 latido en este tramo':'Lupa · fragmento'}</span><label>Marcas <select aria-label="Marcas de la lupa"><option value="all">PR · QRS · QT</option><option value="qrs">QRS</option><option value="pr">PR</option><option value="qt">QT</option><option value="st">Punto J / ST</option><option value="none">Sin marcas</option></select></label></div><div class="lead-detail-scroll"></div><p class="lead-detail-scale">50 mm/s · 10 mm/mV <span class="lens-status"></span></p><div class="lead-detail-observe"><span class="lead-observation"></span><output class="lens-manual-result" role="status" aria-live="polite"></output><button type="button" class="lens-clear" aria-label="Limpiar medición manual">Limpiar</button></div>`;
  const manual=new LensCaliper(root,root.querySelector('.lead-detail-scroll')!,s.fs,value=>{
    root.querySelector('.lens-manual-result')!.textContent=value??'';
    root.classList.toggle('has-manual',value!==null);
  });
  root.querySelector('.lens-measure')!.addEventListener('click',e=>{
    manual.setActive(!manual.active);
    const button=e.currentTarget as HTMLElement;
    button.setAttribute('aria-pressed',String(manual.active));
    button.setAttribute('aria-label',manual.active?'Ocultar medición manual':'Medir en la lupa');
    button.title=manual.active?'Ocultar medición manual':'Medir arrastrando';
  });
  root.querySelector('.lens-clear')!.addEventListener('click',()=>manual.clear());
  const fitLabels=()=>{
    const svg=root.querySelector<SVGSVGElement>('svg');if(!svg)return;
    const dialog=root.closest('dialog')!,content=dialog.querySelector<HTMLElement>('#dialog-content')!;
    const outerHeight=(e:Element)=>{
      const style=getComputedStyle(e);return style.display==='none'||style.position==='absolute'?0:e.getBoundingClientRect().height+parseFloat(style.marginTop)+parseFloat(style.marginBottom);
    };
    const edges=(e:Element)=>{const s=getComputedStyle(e);return ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((n,k)=>n+parseFloat(s[k as keyof CSSStyleDeclaration] as string),0);};
    const chrome=edges(dialog)+edges(content)+outerHeight(dialog.querySelector('.dialog-head')!)+Array.from(root.children).filter(e=>!e.classList.contains('lead-detail-scroll')).reduce((n,e)=>n+outerHeight(e),0)+2;
    const width=svg.viewBox.baseVal.width,traceHeight=Number(svg.dataset.traceHeight);
    // The annotation lanes are screen-sized, not 30 mm of enlarged ECG paper.
    // Uniform scale still governs both waveform axes and the physical grid.
    const budget=Math.max(140,window.innerHeight*.92-chrome-4),footer=annotationRows?annotationRows*30+6:0;
    const scale=Math.min((root.clientWidth-2)/width,(budget-footer)/traceHeight);
    const unit=1/scale;
    svg.setAttribute('viewBox',`0 0 ${width} ${traceHeight+footer*unit}`);
    svg.style.width=`${width*scale}px`;
    svg.querySelectorAll<SVGGElement>('.lens-mark').forEach(group=>{
      const lane=Math.max(0,annotationLanes.indexOf(group.dataset.key as LensMark['key']));
      const x1=4+(Number(group.dataset.start)-initial.start)*50,x2=4+(Number(group.dataset.end)-initial.start)*50,y=traceHeight+(4+lane*30)*unit;
      group.querySelector('.lens-bracket')!.setAttribute('d',`M${x1} ${y-3*unit}v${6*unit}M${x1} ${y}H${x2}M${x2} ${y-3*unit}v${6*unit}`);
      group.querySelector('text')!.setAttribute('y',String(y+19*unit));
    });
    svg.querySelectorAll('text').forEach(t=>{
      t.style.fontSize=`${14*unit}px`;
      const half=t.getComputedTextLength()/2,padding=2*unit;
      const group=t.closest<SVGGElement>('.lens-mark')!;
      const center=4+((Number(group.dataset.start)+Number(group.dataset.end))/2-initial.start)*50;
      t.setAttribute('x',String(Math.max(half+padding,Math.min(svg.viewBox.baseVal.width-half-padding,center))));
    });
    // At fast rates the brackets are close together. Spread only the captions,
    // keeping all timing endpoints and the waveform in their original positions.
    for(const key of ['pr','qrs','qt','st']){
      const labels=Array.from(svg.querySelectorAll<SVGTextElement>(`.lens-${key} text`));
      let right=2*unit;
      for(const t of labels){const half=t.getComputedTextLength()/2,x=Math.max(Number(t.getAttribute('x')),right+half);t.setAttribute('x',String(x));right=x+half+4*unit;}
      const overflow=right-4*unit-(svg.viewBox.baseVal.width-2*unit);
      if(overflow>0)for(const t of labels)t.setAttribute('x',String(Number(t.getAttribute('x'))-overflow));
    }
    manual.refresh();
  };
  const update = () => {
    const w = sampleExtent(s, lead, initial.start, initial.end), polarity = c.view.cabrera && lead === "aVR" ? -1 : 1;
    root.dataset.lead = lead; root.dataset.start = String(initial.start); root.dataset.end = String(initial.end); root.dataset.polarity = String(polarity);
    const finding = !c.artifacts.reversed && polarity > 0 && caseReading(c).findings.find(f => findingTarget(f)?.leads.includes(lead));
    const hint = root.querySelector<HTMLElement>(".lead-observation")!;
    hint.textContent = c.artifacts.reversed ? "Electrodos de brazos invertidos." : polarity < 0 ? "Polaridad invertida: −aVR." : finding ? finding + "." : "";
    hint.hidden = !hint.textContent;
    // Reserve only usable lanes, independently of the selected display mode.
    // J/ST reuses the first lane; hiding marks never changes the waveform scale.
    const intervals=w?lensMarks(s,lead,w,polarity,measurement,'all'):[];
    const st=w?lensMarks(s,lead,w,polarity,measurement,'st'):[];
    annotationLanes=(['pr','qrs','qt'] as const).filter(key=>intervals.some(mark=>mark.key===key));
    annotationRows=Math.max(annotationLanes.length,st.length?1:0);
    const marks=mode==='st'?st:mode==='none'?[]:intervals.filter(mark=>mode==='all'||mark.key===mode);
    root.dataset.markMode=mode;
    root.querySelector('.lens-status')!.textContent=mode!=='none'&&!marks.length?`· ${MEASUREMENT_STATE.unavailable}`:marks.some(m=>m.value.endsWith('*'))?`· * ${MEASUREMENT_STATE.review}`:'';
    root.querySelector(".lead-detail-scroll")!.innerHTML = w ? enlargedTrace(s, lead, w, polarity,marks) : "Muestras no disponibles en esta derivación.";
    fitLabels();manual.refresh();
  };
  title.querySelector("select")!.addEventListener("change", e => { manual.clear(); lead = (e.target as HTMLSelectElement).value as Lead; update(); });
  root.querySelector('select')!.value=mode;
  root.querySelector('select')!.addEventListener('change',e=>{mode=(e.target as HTMLSelectElement).value as LensMode;preference.onChange?.(mode);update();});
  update();
  const observer=new ResizeObserver(fitLabels);observer.observe(root);
  window.addEventListener('resize',fitLabels);
  return ()=>{manual.dispose();observer.disconnect();window.removeEventListener('resize',fitLabels);};
}
