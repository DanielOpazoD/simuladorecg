import type { ECGCase } from "../engine/types";
import type { Caliper, Layout } from "../render/ecg";
import { leadGain } from "../engine/lead-registry";
import { caliperMeasurement, caliperPosition, initialCaliper, placeCaliper, type Endpoint } from "../render/caliper-geometry";
import { esc } from "./helpers";
type State={active:boolean;layout:Layout|null;caliper:Caliper|null;view:ECGCase["view"];fs:number};
/** Native fields are an alternative to custom arrow keys for assistive technology. */
export class CaliperEditor {
  private state:State|null=null;
  private end:Endpoint=2;
  private options="";
  constructor(private root:HTMLElement,private canvas:HTMLCanvasElement,private change:(cal:Caliper)=>void) {
    root.innerHTML=`<label>Derivación y tramo<select id="caliper-segment"></select></label><label>Extremo<select id="caliper-endpoint"><option value="1">A · inicio</option><option value="2" selected>B · final</option></select></label><label>Tiempo del extremo (ms)<input id="caliper-time" type="number" inputmode="decimal"/></label><label>Amplitud mostrada (mV)<input id="caliper-voltage" type="number" step="0.01" inputmode="decimal"/></label><button type="button" id="caliper-focus">Mover en el trazado</button>`;
    root.addEventListener('change',e=>this.edit(e.target as HTMLInputElement));
    root.querySelector('#caliper-focus')!.addEventListener('click',()=>canvas.focus());
  }
  get endpoint():Endpoint { return this.end; }
  private field<T extends HTMLInputElement|HTMLSelectElement>(id:string) { return this.root.querySelector<T>('#'+id)!; }
  private edit(target:HTMLInputElement) {
    const s=this.state;if(!s?.active||!s.layout)return;
    const segment=Number(this.field('caliper-segment').value);
    const cal=s.caliper??initialCaliper(s.layout,s.view,s.fs,segment);
    if(target.id==='caliper-endpoint') { this.end=target.value==='1'?1:2;this.update(s);return; }
    if(target.id==='caliper-segment') {this.change(initialCaliper(s.layout,s.view,s.fs,segment));return;}
    if(!['caliper-time','caliper-voltage'].includes(target.id))return;
    const time=Number(this.field('caliper-time').value),voltage=Number(this.field('caliper-voltage').value),seg=s.layout.segments[cal.segment];
    if(!Number.isFinite(time)||!Number.isFinite(voltage)||target.value==='') {this.update(s);return;}
    this.change(placeCaliper(cal,this.end,{x:seg.x+(time/1000-seg.start)*s.view.speed,y:seg.baseline-voltage*leadGain(seg.lead,s.view)},s.layout,s.view,s.fs));
  }
  update(s:State) {
    this.state=s;this.root.hidden=!s.active||!s.layout;
    const readout=document.querySelector<HTMLElement>('#measurement-readout')!;
    readout.hidden=!s.active||!s.layout;
    if(!s.active||!s.layout) { const out=document.querySelector<HTMLOutputElement>('#measurement-values')!;out.textContent='';delete out.dataset.ms;delete out.dataset.mv;return; }
    const l=s.layout, html=l.segments.map((seg,i)=>`<option value="${i}">${esc((seg.polarity<0?'−':'')+seg.lead)} · ${seg.start.toFixed(1)}–${(seg.start+seg.duration).toFixed(1)} s</option>`).join('');
    if(html!==this.options){this.field('caliper-segment').innerHTML=html;this.options=html;}
    const cal=s.caliper??initialCaliper(l,s.view,s.fs),seg=l.segments[cal.segment],p=caliperPosition(cal,this.end,l,s.view),gain=leadGain(seg.lead,s.view);
    this.field('caliper-segment').value=String(cal.segment);
    const time=this.field<HTMLInputElement>('caliper-time'),amp=this.field<HTMLInputElement>('caliper-voltage');
    time.step=String(1000/s.fs);time.min=String(seg.start*1000);time.max=String((seg.start+seg.duration)*1000);
    amp.min=((seg.baseline-seg.y-seg.height)/gain).toFixed(2);amp.max=((seg.baseline-seg.y)/gain).toFixed(2);
    time.value=p.timeMs.toFixed(1);amp.value=p.voltageMv.toFixed(2);
    const result=document.querySelector<HTMLOutputElement>('#measurement-values')!;
    const m=caliperMeasurement(cal,l,s.view);
    if(s.caliper){result.dataset.ms=String(m.ms);result.dataset.mv=String(m.mv);}else{delete result.dataset.ms;delete result.dataset.mv;}
    result.textContent=s.caliper
      ? `${seg.polarity<0?'−':''}${seg.lead} · Δt ${m.ms.toFixed(0)} ms · ΔV ${m.mv.toFixed(2)} mV (${m.mm.toFixed(1)} mm). Extremo ${this.end===1?'A':'B'}: ${p.timeMs.toFixed(0)} ms, ${p.voltageMv.toFixed(2)} mV mostrados. 60.000/Δt: ${m.ms>0?(60000/m.ms).toFixed(0):'—'} lpm; solo si se mide RR.`
      : "Elige un tramo y ajusta los extremos con estos campos o arrastrando en el ECG. Flechas en el trazado: una muestra o 0,01 mV; Mayús multiplica por diez.";
  }
}
