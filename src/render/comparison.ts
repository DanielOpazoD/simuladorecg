import { LEADS } from '../engine/types';
import { comparisonWindow, traceName, traceStart, type ComparisonTrace, type ComparisonView } from '../ui/comparison-model';

/** A and B always use one mapping from seconds/mV to pixels. No normalization. */
export function comparisonLayout(width: number, rangeMv: number, duration: number) {
  if (![1,2,4,8].includes(rangeMv) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(duration) || duration <= 0)
    throw new Error('Escala de comparación no válida.');
  const w = Math.max(900, Math.min(1600, Math.round(width))), gap = 26, margin = 18, row = 92;
  const cell = (w - 2 * margin - gap) / 2;
  return {width:w,height:704,cell,row,top:94,margin,gap,plotWidth:cell-40,pxPerSecond:(cell-40)/duration,pxPerMv:72/(rangeMv*2)};
}
export function renderComparison(canvas: HTMLCanvasElement, a: ComparisonTrace, b: ComparisonTrace, view: ComparisonView, width = 1200) {
  const window = comparisonWindow(a,b,view), g = comparisonLayout(width,view.rangeMv,window.duration);
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(g.width * ratio); canvas.height = Math.round(g.height * ratio);
  canvas.style.width = g.width + 'px'; canvas.style.height = g.height + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar la comparación.');
  ctx.scale(ratio,ratio); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,g.width,g.height);
  const text = (value:string,x:number,y:number,bold=false,size=12) => {
    ctx.fillStyle = '#253642'; ctx.font = `${bold?600:400} ${size}px system-ui, sans-serif`; ctx.fillText(value,x,y);
  };
  text(`ECG LAB · COMPARACIÓN A/B · ${a.sourceKind === 'synthetic' && b.sourceKind === 'synthetic' ? 'SEÑALES SINTÉTICAS' : 'ORÍGENES DECLARADOS'}`,18,24,true,15);
  text('A ··· ' + traceName(a).slice(0,65),18,47,true);
  text('B ━ ' + traceName(b).slice(0,65),g.width/2+13,47,true);
  text(`Misma escala ±${view.rangeMv} mV · cada división vertical = 0,5 mV · tiempo sin estirar`,18,68);
  text(view.alignment === 'beat' ? 'Origen: QRS del generador; no es una detección clínica. Marcas relativas al origen.'
    : view.alignment === 'manual' ? 'Orígenes manuales por muestra. No implican un límite QRS detectado. Tiempo relativo a cada origen.'
    : `Tiempo relativo al tramo: ${window.startA.toFixed(1)}–${(window.startA+window.duration).toFixed(1)} s. Sin emparejamiento automático.`,18,85);
  let clippedA = 0, clippedB = 0;
  LEADS.forEach((lead,index) => {
    const col = index < 6 ? 0 : 1, r = index % 6, left = g.margin+col*(g.cell+g.gap), top = g.top+r*g.row;
    const x = left+32, center = top+g.row/2;
    ctx.strokeStyle = '#e3e9ed'; ctx.lineWidth = .7; ctx.setLineDash([]);
    for (let ms = 0; ms <= window.duration + 1e-8; ms += .2) {
      const xx = x+ms*g.pxPerSecond; ctx.beginPath();ctx.moveTo(xx,top+6);ctx.lineTo(xx,top+g.row-6);ctx.stroke();
    }
    for (let mv = -view.rangeMv; mv <= view.rangeMv; mv += .5) {
      const yy = center-mv*g.pxPerMv;ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+g.plotWidth,yy);ctx.stroke();
    }
    ctx.strokeStyle = '#a7b8c1'; ctx.beginPath();ctx.moveTo(x,center);ctx.lineTo(x+g.plotWidth,center);ctx.stroke();
    text(lead,left,center+4,true,12);
    if (view.alignment === 'beat') {
      ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(x+.2*g.pxPerSecond,top+6);ctx.lineTo(x+.2*g.pxPerSecond,top+g.row-6);ctx.stroke();ctx.setLineDash([]);
    }
    const draw = (trace:ComparisonTrace,start:number,color:string,dash:number[]) => {
      const first = Math.round(start*trace.signal.fs), count = Math.round(window.duration*trace.signal.fs);
      const samples = trace.signal.leads[lead]; let clipped = 0, drawing = false;
      ctx.save();ctx.beginPath();ctx.rect(x,top+6,g.plotWidth,g.row-12);ctx.clip();
      ctx.strokeStyle = color;ctx.lineWidth=1.45;ctx.setLineDash(dash);ctx.beginPath();
      for (let k=0;k<count;k++) {
        const value=samples[first+k];
        if (!Number.isFinite(value)) { drawing=false;continue; }
        if (Math.abs(value)>view.rangeMv) clipped++;
        const xx=x+(k/trace.signal.fs)*g.pxPerSecond,yy=center-value*g.pxPerMv;
        if (drawing)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);
        drawing=true;
      }
      ctx.stroke();ctx.restore();return clipped;
    };
    clippedA+=draw(a,window.startA,'#2b6b9b',[5,3]);
    clippedB+=draw(b,window.startB,'#b44f31',[]);
    if (r===5) for (let i=0;i<=window.duration+1e-8;i+=.2)
      text((window.axisStart+i).toFixed(1),x+i*g.pxPerSecond-8,top+g.row+12,false,10);
  });
  text(`Origen en cada registro: A ${(traceStart(a)+window.startA).toFixed(3)} s · B ${(traceStart(b)+window.startB).toFixed(3)} s · ${a.signal.fs} Hz · muestras originales mV`,18,676);
  text(`Sin validación clínica. ${clippedA+clippedB ? 'Hay muestras fuera del rango vertical: amplía la escala.' : 'No es papel calibrado para imprimir a 25 mm/s.'}`,18,696);
  canvas.setAttribute('aria-label',`Comparación de doce derivaciones. A: ${traceName(a)}. B: ${traceName(b)}. Escala compartida ±${view.rangeMv} mV. Línea discontinua A y continua B. ${view.alignment==='beat'?'QRS sintéticos alineados sin estirar tiempo.':view.alignment==='manual'?'Orígenes manuales, sin remuestreo.':'Tiempo relativo al tramo copiado.'}`);
  return {clippedA,clippedB,window,geometry:g};
}
