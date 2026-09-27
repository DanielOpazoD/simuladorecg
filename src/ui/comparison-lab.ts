import "./comparison.css";
import type { ECGCase, Measurement, Signal } from '../engine/types';
import { APP_VERSION } from './version';
import { esc } from './helpers';
import { download } from './persistence';
import { renderComparison } from '../render/comparison';
import { captureTrace, changedSettings, comparisonExport, comparisonWindow, DEFAULT_COMPARISON_VIEW, leadDifferences, metricDifferences, type ComparisonTrace, type ComparisonView } from './comparison-model';

const fmt = (v:number|null,digits=1) => v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits);
const status = (s:string) => s==='usable'?'Reproducible':s==='review'?'Revisar':'No estimable';
const setting = (x:unknown) => esc(typeof x==='boolean'?(x?'Sí':'No'):String(x ?? '—'));

/** One pinned copy and one current copy; no worker, storage or second analyzer. */
export class ComparisonLab {
  private a: ComparisonTrace | null = null;
  private b: ComparisonTrace | null = null;
  private concealed = false;
  private message = 'Generando señal…';
  private view: ComparisonView = {...DEFAULT_COMPARISON_VIEW};
  constructor(private readonly root: HTMLElement, private readonly notify: (message:string)=>void) {
    root.addEventListener('click',e=>{
      const action=(e.target as Element).closest<HTMLElement>('[data-compare]')?.dataset.compare;
      if (!action) return;
      if (action==='clear') { this.a=null;this.render();return; }
      if (!this.b || this.concealed) return;
      if (action==='pin') { this.a=captureTrace(this.b.case,this.b.signal,this.b.measurement);this.view={...DEFAULT_COMPARISON_VIEW};this.render();return; }
      if (!this.a) return;
      if (action==='json') {
        download(new Blob([JSON.stringify(comparisonExport(this.a,this.b,this.view,APP_VERSION))],{type:'application/json'}),'ecg-lab-comparacion-AB.json');
        this.notify('Comparación exportada: parámetros y muestras de ambos ECG.');
      }
      if (action==='png') {
        const canvas=document.createElement('canvas');renderComparison(canvas,this.a,this.b,this.view,1200);
        canvas.toBlob(blob=>{if(blob){download(blob,'ecg-lab-comparacion-AB.png');this.notify('Comparación PNG exportada con escala común.');}},'image/png');
      }
    });
    root.addEventListener('change',e=>{
      const el=e.target as HTMLInputElement|HTMLSelectElement;
      if (!this.a || !this.b || this.concealed) return;
      if (el.id==='compare-alignment') this.view.alignment=el.value==='beat'?'beat':'record';
      if (el.id==='compare-start') {
        const start=Number(el.value);
        if (!el.value || !Number.isFinite(start) || start<0 || start>8) {this.notify('El inicio debe estar entre 0 y 8 s.');this.render();return;}
        this.view.start=start;
      }
      if (el.id==='compare-range' && [1,2,4,8].includes(Number(el.value))) this.view.rangeMv=Number(el.value);
      if (el.id==='compare-beat-a') this.view.beatA=Number(el.value);
      if (el.id==='compare-beat-b') this.view.beatB=Number(el.value);
      if (el.id.startsWith('compare-')) this.render();
    });
    this.render();
  }
  update(c:ECGCase,s:Signal,m:Measurement) {
    this.b=captureTrace(c,s,m);
    this.view.beatB=0;
    if (!this.b.signal.events.beats.length) this.view.alignment='record';
    this.render();
  }
  invalidate(message='Calculando B…') {this.b=null;this.message=message;this.render();}
  conceal(hidden:boolean) {
    if (hidden===this.concealed) return;
    this.concealed=hidden;
    if(hidden)this.a=null; // Never preserve an answer-bearing reference in a blind quiz.
    this.render();
  }
  focus() { this.root.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});this.root.querySelector<HTMLButtonElement>('[data-compare="pin"]')?.focus({preventScroll:true}); }
  private render() {
    const focused=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'';
    const ready=!!this.b&&!this.concealed;
    this.root.innerHTML=`<div class="comparison-heading"><div><div class="section-label">LABORATORIO COMPARATIVO</div><h2>Un cambio, dos ECG</h2></div><div class="comparison-actions"><button id="compare-pin" class="btn" data-compare="pin" ${ready?'':'disabled'}>${this.a?'Reemplazar referencia A':'Fijar ECG actual como A'}</button>${this.a?'<button class="btn subtle" id="compare-clear" data-compare="clear">Borrar A</button>':''}</div></div>`;
    if (this.concealed) { this.root.insertAdjacentHTML('beforeend','<p class="control-note">Comparación desactivada durante la pregunta. La referencia anterior se ha borrado para no revelar respuestas.</p>');return; }
    if (!this.a) {this.root.insertAdjacentHTML('beforeend','<p class="comparison-intro">Fija una referencia A, cambia un parámetro o selecciona otro caso y observa B con la misma escala. La referencia se conserva solo durante esta sesión. No se normaliza la amplitud ni se estira el tiempo.</p>');return;}
    const a=this.a,b=this.b;
    if (!b) {this.root.insertAdjacentHTML('beforeend',`<p class="comparison-pending" role="status"><strong>A: ${esc(a.case.name)}</strong> permanece fijada. ${esc(this.message)} La comparación y su exportación esperan una señal B válida.</p>`);return;}
    if (!a.signal.events.beats.length || !b.signal.events.beats.length) this.view.alignment='record';
    const beats=(x:ComparisonTrace,selected:number)=>x.signal.events.beats.map((beat,i)=>`<option value="${i}" ${i===selected?'selected':''}>${i+1} · ${beat.time.toFixed(3)} s · ${esc(beat.kind)}</option>`).join('');
    const changes=changedSettings(a.case,b.case), metrics=metricDifferences(a.measurement,b.measurement);
    const window=comparisonWindow(a,b,this.view),differences=leadDifferences(a,b,window);
    this.root.insertAdjacentHTML('beforeend',`<div class="comparison-names"><p><strong class="comparison-a">A ··· Referencia</strong><span>${esc(a.case.name)}</span></p><p><strong class="comparison-b">B ━ Actual</strong><span>${esc(b.case.name)}</span></p></div>
      <div class="comparison-controls"><label>Comparar por<select id="compare-alignment"><option value="record" ${this.view.alignment==='record'?'selected':''}>Tiempo de registro</option><option value="beat" ${this.view.alignment==='beat'?'selected':''} ${!a.signal.events.beats.length||!b.signal.events.beats.length?'disabled':''}>QRS seleccionado del generador</option></select></label>
      ${this.view.alignment==='record'?`<label>Inicio común (s)<input id="compare-start" type="number" min="0" max="8" step="0.2" value="${this.view.start}"/></label>`:`<label>QRS A<select id="compare-beat-a">${beats(a,this.view.beatA)}</select></label><label>QRS B<select id="compare-beat-b">${beats(b,this.view.beatB)}</select></label>`}
      <label>Rango común<select id="compare-range">${[1,2,4,8].map(v=>`<option value="${v}" ${v===this.view.rangeMv?'selected':''}>±${v} mV</option>`).join('')}</select></label>
      <button id="compare-png" class="btn" data-compare="png">Exportar PNG</button><button id="compare-json" class="btn" data-compare="json">Exportar datos A/B</button></div>
      <p class="control-note">${this.view.alignment==='beat'?'Alineación por inicio QRS sintético redondeado a la muestra más cercana. No es una detección clínica ni emparejamiento automático. Cada señal conserva su duración y sus intervalos.':'Ventana común de 2 s. Si cambian la frecuencia o la semilla, los latidos pueden no coincidir; esa diferencia temporal no es un error del trazado.'}</p>
      <div class="comparison-scroll" tabindex="0" role="region" aria-label="Doce derivaciones A/B; desplaza horizontalmente en pantallas pequeñas"><canvas id="comparison-canvas" role="img"></canvas></div><p id="comparison-clipping" class="control-note" role="status"></p>
      <div class="comparison-results"><section><h3>Cambios de modelo y adquisición (${changes.length})</h3>${changes.length?`<div class="measurement-table-wrap"><table id="comparison-settings"><thead><tr><th>Parámetro</th><th>A</th><th>B</th></tr></thead><tbody>${changes.map(r=>`<tr><td>${esc(r.label)}</td><td>${setting(r.a)}</td><td>${setting(r.b)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="control-note">Sin cambios de modelo o adquisición. La vista original de cada caso no altera la escala común de este gráfico.</p>'}</section>
      <section><h3>Medidas de los primeros 10 s</h3><div class="measurement-table-wrap"><table id="comparison-metrics"><thead><tr><th>Variable</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${metrics.map(r=>`<tr><td>${r.label} (${r.unit})</td><td title="${esc(r.reasonA)}">${fmt(r.a)}<small>${status(r.statusA)}</small></td><td title="${esc(r.reasonB)}">${fmt(r.b)}<small>${status(r.statusB)}</small></td><td>${fmt(r.delta)}</td></tr>`).join('')}</tbody></table></div><p class="control-note">Solo se resta cuando ambas medidas son reproducibles y sus ventanas de análisis coinciden. «Revisar» y «No estimable» no se convierten en cero. No se sustituyen por tiempos programados ni se recalculan para el latido alineado.</p></section></div>
      <details class="comparison-data"><summary>Diferencias de las muestras visibles, por derivación</summary><p class="control-note">RMS y máximo de B − A describen esta ventana y alineación, no similitud diagnóstica ni fidelidad clínica. Las muestras fuera del registro se excluyen, no se rellenan con cero.</p><div class="measurement-table-wrap"><table id="comparison-differences"><thead><tr><th>Derivación</th><th>Pares</th><th>Cobertura</th><th>RMS (mV)</th><th>Máximo absoluto (mV)</th></tr></thead><tbody>${differences.map(r=>`<tr><td>${r.lead}</td><td>${r.samples}</td><td>${fmt(r.coverage*100,0)} %</td><td>${fmt(r.rmsMv,5)}</td><td>${fmt(r.maxAbsMv,5)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="control-note">A y B son señales sintéticas. Los datos A/B exportan parámetros, muestras originales en mV y medidas; no son un archivo de caso individual. El PNG es una comparación con ejes compartidos, no papel calibrado a 25 mm/s. Sin validación clínica.</p>`);
    const proof=renderComparison(this.root.querySelector<HTMLCanvasElement>('canvas')!,a,b,this.view,Math.max(900,this.root.clientWidth-40));
    this.root.querySelector('#comparison-clipping')!.textContent=proof.clippedA+proof.clippedB?`Fuera del rango vertical: A ${proof.clippedA} muestras; B ${proof.clippedB}. Amplía el rango; los datos no se han recortado.`:'Escala común sin normalización. En móvil, desplaza solo el gráfico horizontalmente.';
    if(focused)this.root.querySelector<HTMLElement>('#'+focused)?.focus({preventScroll:true});
  }
}
