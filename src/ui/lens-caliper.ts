import type { Caliper, Layout } from '../render/ecg';
import { caliperMeasurement, initialCaliper, moveCaliper, placeCaliper, segmentIndexAt, sheetPoint, type Endpoint } from '../render/caliper-geometry';
import type { Lead } from '../engine/types';

/** Adapter for the existing calipers: same sample snapping, units and keyboard steps. */
export class LensCaliper {
  active=false;
  private cal:Caliper|null=null;
  private end:Endpoint=2;
  private drag:{id:number;before:Caliper|null}|null=null;
  private events=new AbortController();
  private readonly view={speed:50,gain:10,chestGain:10};
  constructor(private root:HTMLElement,private plot:HTMLElement,private fs:number,private report:(value:string|null)=>void){
    const options={signal:this.events.signal};
    plot.addEventListener('pointerdown',this.down,options);
    plot.addEventListener('pointermove',this.move,options);
    plot.addEventListener('pointerup',this.up,options);
    plot.addEventListener('pointercancel',this.cancel,options);
    plot.addEventListener('lostpointercapture',e=>{if(e.target===plot&&e.pointerId===this.drag?.id)this.cancel();},options);
    plot.addEventListener('keydown',this.key,options);
  }
  private geometry(){
    const svg=this.plot.querySelector<SVGSVGElement>('.lead-detail-trace');if(!svg)return null;
    const w=svg.viewBox.baseVal,rect=svg.getBoundingClientRect(),start=Number(this.root.dataset.start),end=Number(this.root.dataset.end);
    const layout:Layout={mode:'paper',widthMm:w.width,heightMm:w.height,pxPerMm:rect.width/w.width,segments:[{
      x:4,y:0,width:(end-start)*50,height:Number(svg.dataset.traceHeight),baseline:Number(svg.dataset.baseline),
      start,duration:end-start,lead:this.root.dataset.lead as Lead,polarity:Number(this.root.dataset.polarity),
    }]};
    return {svg,rect,layout};
  }
  setActive(value:boolean){
    // Hiding a tool must not discard the learner's measurement. clear() and
    // changing the lead remain the explicit reset paths for this open lens.
    this.cancel();this.active=value;
    this.plot.classList.toggle('lens-measuring',value);this.plot.tabIndex=value?0:-1;
    this.plot.setAttribute('role','group');
    this.plot.setAttribute('aria-label','Medición manual. Arrastra entre dos puntos. A o B seleccionan el extremo; flechas lo ajustan, Mayús acelera y Suprimir limpia.');
    this.refresh();if(value)this.plot.focus({preventScroll:true});
  }
  clear(){this.cancel();this.cal=null;this.refresh();}
  private down=(e:PointerEvent)=>{
    if(!this.active||!e.isPrimary||e.button!==0||this.drag)return;
    const g=this.geometry();if(!g)return;
    const p=sheetPoint(g.rect,e.clientX,e.clientY,g.layout);if(segmentIndexAt(g.layout,p)<0)return;
    e.preventDefault();this.drag={id:e.pointerId,before:this.cal?{...this.cal}:null};
    const near=(end:Endpoint)=>this.cal&&Math.hypot(p.x-(end===1?this.cal.x1:this.cal.x2),p.y-(end===1?this.cal.y1:this.cal.y2))*g.layout.pxPerMm<14;
    if(near(1)||near(2))this.end=near(1)?1:2;
    else{
      this.end=2;this.cal=placeCaliper(initialCaliper(g.layout,this.view,this.fs),1,p,g.layout,this.view,this.fs);
      this.cal=placeCaliper(this.cal,2,p,g.layout,this.view,this.fs);
    }
    this.plot.focus({preventScroll:true});this.plot.setPointerCapture(e.pointerId);this.refresh();
  };
  private move=(e:PointerEvent)=>{
    if(e.pointerId!==this.drag?.id||!this.cal)return;
    const g=this.geometry();if(!g)return;e.preventDefault();
    this.cal=placeCaliper(this.cal,this.end,sheetPoint(g.rect,e.clientX,e.clientY,g.layout),g.layout,this.view,this.fs);this.refresh();
  };
  private release(){const id=this.drag?.id;this.drag=null;if(id!==undefined&&this.plot.hasPointerCapture(id))this.plot.releasePointerCapture(id);}
  private up=(e:PointerEvent)=>{if(e.pointerId!==this.drag?.id)return;this.move(e);this.release();};
  private cancel=()=>{if(!this.drag)return;this.cal=this.drag.before;this.release();this.refresh();};
  private key=(e:KeyboardEvent)=>{
    if(!this.active||e.ctrlKey||e.altKey||e.metaKey||e.isComposing)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.clear();return;}
    if(e.key.toLowerCase()==='a'||e.key.toLowerCase()==='b'){this.end=e.key.toLowerCase()==='a'?1:2;this.refresh();return;}
    if(!e.key.startsWith('Arrow'))return;
    const g=this.geometry();if(!g)return;e.preventDefault();e.stopPropagation();
    this.cal=moveCaliper(this.cal??initialCaliper(g.layout,this.view,this.fs),this.end,e.key,g.layout,this.view,this.fs,e.shiftKey);this.refresh();
  };
  refresh(){
    const g=this.geometry();if(!g)return;
    g.svg.querySelector('.lens-manual-mark')?.remove();
    if(!this.active||!this.cal){this.report(this.active?'Arrastra sobre el ECG':null);delete this.root.dataset.manualMs;delete this.root.dataset.manualMv;return;}
    const cal=this.cal,m=caliperMeasurement(cal,g.layout,this.view),height=g.layout.segments[0].height;
    this.root.dataset.manualMs=String(m.ms);this.root.dataset.manualMv=String(m.mv);
    this.report(`Manual ${m.ms.toFixed(0)} ms · ${m.mv.toFixed(2)} mV`);
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.classList.add('lens-manual-mark');
    const radius=5/g.layout.pxPerMm;
    group.innerHTML=`<path d="M${cal.x1} 0V${height}M${cal.x2} 0V${height}"/><path d="M${cal.x1} ${cal.y1}H${cal.x2}"/>${([1,2] as const).map(end=>`<circle class="${this.end===end?'selected':''}" cx="${end===1?cal.x1:cal.x2}" cy="${end===1?cal.y1:cal.y2}" r="${radius}"/>`).join('')}`;
    g.svg.append(group);
  }
  dispose(){this.release();this.events.abort();}
}
