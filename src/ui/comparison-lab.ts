import './comparison.css';
import type { ECGCase, Measurement, Signal } from '../engine/types';
import { APP_VERSION } from './version';
import { esc } from './helpers';
import { download } from './persistence';
import { renderComparison } from '../render/comparison';
import {
  captureTrace, changedSettings, comparisonExport, comparisonWindow, DEFAULT_COMPARISON_VIEW,
  hasGeneratorBeats, leadDifferences, metricDifferences, traceMetricDifferences, traceName, traceStart,
  type ComparisonTrace, type ComparisonView, type ExternalComparisonTrace, type SyntheticComparisonTrace,
} from './comparison-model';

const fmt = (v:number|null,digits=1) => v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits);
const status = (s:string) => s==='usable'?'Consistente*':s==='review'?'Revisar':'No estimable';
const setting = (x:unknown) => esc(typeof x==='boolean'?(x?'Sí':'No'):String(x ?? '—'));
interface Navigation {
  currentSynthetic: () => SyntheticComparisonTrace | null;
  openExternal: () => void;
  focusSynthetic: () => void;
}

/** Only two owned snapshots. B follows the generator OR is an explicit external copy.
 * The reader remains owner of its original record, manual history and worker.
 */
export class ComparisonLab {
  private a: ComparisonTrace | null = null;
  private b: ComparisonTrace | null = null;
  private sourceB: 'synthetic' | 'external' = 'synthetic';
  private concealed = false;
  private message = 'Generando señal…';
  private view: ComparisonView = {...DEFAULT_COMPARISON_VIEW};
  private viewPending = false;
  private revision = 0;
  constructor(private readonly root:HTMLElement,private readonly notify:(message:string)=>void,private readonly navigation:Navigation) {
    root.addEventListener('click',e=>{
      const action=(e.target as Element).closest<HTMLElement>('[data-compare]')?.dataset.compare;
      if (!action || this.concealed) return;
      try {
        if (action==='reader') {this.navigation.openExternal();return;}
        if (action==='simulator') {this.navigation.focusSynthetic();return;}
        if (action==='synthetic') {
          this.sourceB='synthetic';this.b=this.navigation.currentSynthetic();this.message='El simulador todavía no tiene una señal válida.';
          this.resetView();this.render();return;
        }
        if (action==='clear') {this.a=null;this.revision++;this.render();return;}
        if (action==='clear-all') {
          this.a=null;this.sourceB='synthetic';this.b=this.navigation.currentSynthetic();this.resetView();this.render();
          this.notify('Copias A/B borradas. El lector conserva su propia sesión hasta cerrarlo.');return;
        }
        if (!this.b) return;
        if (action==='pin') {this.a=structuredClone(this.b);this.resetView();this.render();return;}
        if (!this.a || this.viewPending) return;
        comparisonWindow(this.a,this.b,this.view); // Revalidate at export; never export a stale/invalid view.
        if (action==='json') {
          download(new Blob([JSON.stringify(comparisonExport(this.a,this.b,this.view,APP_VERSION))],{type:'application/json'}),'ecg-lab-comparacion-AB.json');
          this.notify('Comparación exportada: origen, muestras y medidas separados.');
        }
        if (action==='png') {
          const canvas=document.createElement('canvas'),revision=this.revision;
          renderComparison(canvas,this.a,this.b,this.view,1200);
          canvas.toBlob(blob=>{if(blob && revision===this.revision && !this.concealed && !this.viewPending){
            download(blob,'ecg-lab-comparacion-AB.png');this.notify('Comparación PNG exportada con escala común.');
          }},'image/png');
        }
      } catch(error) {this.notify(error instanceof Error?error.message:'No se pudo comparar.');}
    });
    root.addEventListener('input',e=>{
      if (!(e.target instanceof HTMLInputElement) || !e.target.id.startsWith('compare-')) return;
      this.viewPending=true;this.revision++;
      root.querySelectorAll<HTMLButtonElement>('#compare-json,#compare-png').forEach(b=>b.disabled=true);
    });
    root.addEventListener('change',e=>{
      const el=e.target as HTMLInputElement|HTMLSelectElement;
      if (!this.a || !this.b || this.concealed || !el.id.startsWith('compare-')) return;
      if (el.id==='compare-alignment') this.view.alignment=el.value==='beat'?'beat':el.value==='manual'?'manual':'record';
      if (el.id==='compare-start') this.view.start=el.value===''?NaN:Number(el.value);
      if (el.id==='compare-range' && [1,2,4,8].includes(Number(el.value))) this.view.rangeMv=Number(el.value);
      if (el.id==='compare-beat-a') this.view.beatA=Number(el.value);
      if (el.id==='compare-beat-b') this.view.beatB=Number(el.value);
      if (el.id==='compare-manual-a') this.view.manualA=el.value===''?NaN:Number(el.value);
      if (el.id==='compare-manual-b') this.view.manualB=el.value===''?NaN:Number(el.value);
      this.viewPending=false;this.revision++;this.render();
    });
    this.render();
  }
  private resetView() {this.view={...DEFAULT_COMPARISON_VIEW};this.viewPending=false;this.revision++;}
  acceptExternal(slot:'A'|'B',trace:ExternalComparisonTrace) {
    if (this.concealed) throw Error('La comparación está oculta durante la pregunta.');
    const snapshot=structuredClone(trace);
    if (slot==='A') this.a=snapshot;
    else {this.b=snapshot;this.sourceB='external';}
    this.resetView();this.render();
    this.notify(`Copia externa fijada como ${slot}. Cerrar el lector no borra las copias A/B.`);
  }
  update(c:ECGCase,s:Signal,m:Measurement) {
    if (this.sourceB==='external') return; // A pinned external B must not follow unrelated generator changes.
    this.b=captureTrace(c,s,m);this.view.beatB=0;this.revision++;
    if (!hasGeneratorBeats(this.b) && this.view.alignment==='beat') this.view.alignment='record';
    this.render();
  }
  invalidate(message='Calculando B…') {
    if (this.sourceB==='external') return;
    this.b=null;this.message=message;this.revision++;this.render();
  }
  conceal(hidden:boolean) {
    if (hidden===this.concealed) return;
    this.concealed=hidden;
    if(hidden){this.a=null;this.b=null;this.sourceB='synthetic';this.resetView();}
    this.render();
  }
  focus() {
    this.root.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    this.root.querySelector<HTMLButtonElement>('#compare-pin:not(:disabled),[data-compare=reader]')?.focus({preventScroll:true});
  }
  private sourceDetails(x:ComparisonTrace,slot:string) {
    if(x.sourceKind==='synthetic') return `<p>${slot}: señal sintética · primeros 10 s · ${x.signal.fs} Hz · medidas con auditoría del modelo.</p>`;
    return `<p>${slot}: archivo ${x.external.provenance.format==='wfdb16'?'WFDB':'CSV'}, origen no verificado · ${x.signal.fs} Hz · muestras ${x.external.startSample}–${x.external.startSample+10*x.signal.fs-1} del registro.</p>
      <p>Huella del registro completo: <code>${x.external.identity.sha256}</code>. No es una huella exclusiva del tramo ni acredita identidad de paciente.</p>
      <p>Control técnico: ${x.external.assessment.analysisAllowed?'análisis exploratorio ejecutado':'sólo revisión manual, sin estimaciones automáticas'} · ${esc(x.external.assessment.policy)}.</p>
      <p>Build de captura: <code>${esc(x.capturedWith.commit)}</code>. Ganancias/unidades de adquisición se conservan en JSON; no son normalización de pantalla.</p>`;
  }
  private render() {
    const focused=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'';
    const ready=!!this.b&&!this.concealed;
    this.root.innerHTML=`<div class="comparison-heading"><div><div class="section-label">LABORATORIO COMPARATIVO</div><h2>Un cambio, dos ECG</h2></div><div class="comparison-actions"><button id="compare-pin" class="btn" data-compare="pin" ${ready?'':'disabled'}>${this.a?'Reemplazar referencia A':this.sourceB==='external'?'Fijar copia externa B como A':'Fijar ECG actual como A'}</button>${this.a?'<button class="btn subtle" id="compare-clear" data-compare="clear">Borrar A</button>':''}</div></div>`;
    if(this.concealed){
      this.root.insertAdjacentHTML('beforeend','<p class="control-note">Comparación desactivada durante la pregunta. Las copias anteriores se han borrado para no revelar respuestas.</p>');return;
    }
    this.root.insertAdjacentHTML('beforeend',`<nav class="comparison-navigation" aria-label="Cambiar entre lector, comparador y simulador">
      <button class="btn" data-compare="reader">Abrir / volver al lector</button>
      <button class="btn" data-compare="synthetic">Usar simulador en B</button>
      <button class="btn subtle" data-compare="simulator">Ir al simulador</button>
      <button class="btn subtle" data-compare="clear-all">Borrar copias A/B</button></nav>
      <p class="control-note" id="comparison-mode" role="status">${this.sourceB==='external'?'B es una copia externa fija: no cambia al editar el simulador ni al abrir otro archivo.':'B sigue la señal vigente del simulador.'} En el lector, usa «Copiar tramo como A/B». No se guardan copias al recargar; la práctica las borra.</p>`);
    if(!this.a){
      this.root.insertAdjacentHTML('beforeend','<p class="comparison-intro">Fija una referencia A desde B o desde el lector. Conservamos copias de 10 s, sin normalizar amplitudes, fabricar derivaciones ni estirar el tiempo.</p>');return;
    }
    const a=this.a,b=this.b;
    if(!b){
      this.root.insertAdjacentHTML('beforeend',`<p class="comparison-pending" role="status"><strong>A: ${esc(traceName(a))}</strong> permanece fijada. ${esc(this.message)} La comparación y su exportación esperan una señal B válida.</p>`);return;
    }
    if ((!hasGeneratorBeats(a)||!hasGeneratorBeats(b)) && this.view.alignment==='beat') this.view.alignment='record';
    const bothSynthetic=a.sourceKind==='synthetic'&&b.sourceKind==='synthetic';
    const changes=bothSynthetic?changedSettings(a.case,b.case):null;
    const metrics=bothSynthetic?metricDifferences(a.measurement,b.measurement):traceMetricDifferences(a,b);
    const beats=(x:ComparisonTrace,selected:number)=>x.sourceKind==='synthetic'?x.signal.events.beats.map((beat,i)=>`<option value="${i}" ${i===selected?'selected':''}>${i+1} · ${beat.time.toFixed(3)} s · ${esc(beat.kind)}</option>`).join(''):'';
    this.root.insertAdjacentHTML('beforeend',`<div class="comparison-names"><p data-source="${a.sourceKind}"><strong class="comparison-a">A ··· Referencia</strong><span>${esc(traceName(a))}</span></p><p data-source="${b.sourceKind}"><strong class="comparison-b">B ━ ${this.sourceB==='external'?'Copia externa fija':'Simulador actual'}</strong><span>${esc(traceName(b))}</span></p></div>
      <details class="comparison-provenance"><summary>Origen, adquisición y ventanas de cada señal</summary>${this.sourceDetails(a,'A')}${this.sourceDetails(b,'B')}
      <p>Archivos distintos pueden tener adquisiciones distintas. No se infiere que pertenezcan a la misma persona o a momentos sucesivos. Las anotaciones manuales del lector se exportan allí por separado; no sustituyen estas medidas automáticas.</p></details>`);
    if(a.signal.fs!==b.signal.fs){
      this.root.insertAdjacentHTML('beforeend',`<p class="comparison-pending" id="comparison-error" role="alert">Muestreo incompatible: A ${a.signal.fs} Hz / B ${b.signal.fs} Hz. Las copias se conservan. Selecciona fuentes con la misma frecuencia; no se remuestrea, no se dibuja una falsa superposición ni se exportan diferencias.</p>`);return;
    }
    this.root.insertAdjacentHTML('beforeend',`<div class="comparison-controls"><label>Comparar por<select id="compare-alignment">
      <option value="record" ${this.view.alignment==='record'?'selected':''}>Tiempo relativo al tramo</option>
      <option value="beat" ${this.view.alignment==='beat'?'selected':''} ${!hasGeneratorBeats(a)||!hasGeneratorBeats(b)?'disabled':''}>QRS seleccionado del generador</option>
      <option value="manual" ${this.view.alignment==='manual'?'selected':''}>Orígenes manuales por muestra</option></select></label>
      ${this.view.alignment==='record'?`<label>Inicio común (s)<input id="compare-start" type="number" min="0" max="8" step="0.2" value="${Number.isFinite(this.view.start)?this.view.start:''}"/></label>`:
        this.view.alignment==='beat'?`<label>QRS A<select id="compare-beat-a">${beats(a,this.view.beatA)}</select></label><label>QRS B<select id="compare-beat-b">${beats(b,this.view.beatB)}</select></label>`:
        `<label>Muestra origen A (del tramo)<input id="compare-manual-a" type="number" min="0" max="${a.signal.leads.I.length-1}" step="1" value="${Number.isFinite(this.view.manualA??0)?(this.view.manualA??0):''}"/></label><label>Muestra origen B (del tramo)<input id="compare-manual-b" type="number" min="0" max="${b.signal.leads.I.length-1}" step="1" value="${Number.isFinite(this.view.manualB??0)?(this.view.manualB??0):''}"/></label>`}
      <label>Rango común<select id="compare-range">${[1,2,4,8].map(v=>`<option value="${v}" ${v===this.view.rangeMv?'selected':''}>±${v} mV</option>`).join('')}</select></label>
      <button id="compare-png" class="btn" data-compare="png">Exportar PNG</button><button id="compare-json" class="btn" data-compare="json">Exportar datos A/B</button></div>`);
    let window:ReturnType<typeof comparisonWindow>;
    try {window=comparisonWindow(a,b,this.view);}
    catch(error){
      this.root.insertAdjacentHTML('beforeend',`<p id="comparison-error" role="alert">${esc((error as Error).message)} Las copias no cambian.</p>`);
      this.root.querySelectorAll<HTMLButtonElement>('#compare-json,#compare-png').forEach(button=>button.disabled=true);return;
    }
    const differences=leadDifferences(a,b,window);
    this.root.insertAdjacentHTML('beforeend',`<p class="control-note">${this.view.alignment==='beat'?'Origen QRS del generador redondeado a muestra; no es detección clínica.':
      this.view.alignment==='manual'?'Cada origen es una muestra elegida por el operador dentro de su copia. Alinear no valida un QRS ni modifica intervalos.':'Tiempo relativo al tramo copiado, no sincronización entre pacientes o adquisiciones.'}
      Origen en cada registro: A ${(traceStart(a)+window.startA).toFixed(3)} s · B ${(traceStart(b)+window.startB).toFixed(3)} s.</p>
      <div class="comparison-scroll" tabindex="0" role="region" aria-label="Doce derivaciones A/B; desplaza horizontalmente en pantallas pequeñas"><canvas id="comparison-canvas" role="img"></canvas></div><p id="comparison-clipping" class="control-note" role="status"></p>
      <div class="comparison-results"><section><h3>${changes?'Cambios de modelo y adquisición ('+changes.length+')':'Fuentes y adquisición no equivalentes'}</h3>
      ${changes?changes.length?`<div class="measurement-table-wrap"><table id="comparison-settings"><thead><tr><th>Parámetro</th><th>A</th><th>B</th></tr></thead><tbody>${changes.map(r=>`<tr><td>${esc(r.label)}</td><td>${setting(r.a)}</td><td>${setting(r.b)}</td></tr>`).join('')}</tbody></table></div>`:
        '<p class="control-note">Sin cambios de modelo o adquisición. La presentación no cambia la escala común.</p>':
        '<p class="control-note">Los archivos no reciben parámetros, diagnóstico, eventos ni truth del generador. Las ganancias/unidades de lectura se conservan; los filtros anteriores a la adquisición pueden ser desconocidos.</p>'}</section>
      <section><h3>Medidas de los tramos capturados de 10 s</h3><div class="measurement-table-wrap"><table id="comparison-metrics"><thead><tr><th>Variable</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${metrics.map(r=>`<tr><td>${r.label} (${r.unit})</td><td title="${esc(r.reasonA)}">${fmt(r.a)}<small>${status(r.statusA)}</small></td><td title="${esc(r.reasonB)}">${fmt(r.b)}<small>${status(r.statusB)}</small></td><td ${'reasonDelta' in r?`title="${esc(r.reasonDelta)}"`:''}>${fmt(r.delta)}</td></tr>`).join('')}</tbody></table></div>
      <p class="control-note">*Consistencia interna no es exactitud clínica. Sólo se resta con medidas utilizables y ventanas relativas equivalentes. En pares mixtos no se restan estimaciones con auditorías diferentes; en externas se exige el mismo código conocido del analizador. No se recalcula para la ventana visible ni se completa una ausencia.</p></section></div>
      <details class="comparison-data"><summary>Diferencias de las muestras visibles, por derivación</summary><p class="control-note">RMS, sesgo y máximo de B − A describen esta ventana y alineación. No son similitud diagnóstica, fidelidad clínica ni evolución. Datos ausentes se excluyen, no se rellenan.</p><div class="measurement-table-wrap"><table id="comparison-differences"><thead><tr><th>Derivación</th><th>Pares</th><th>Cobertura</th><th>Sesgo (mV)</th><th>RMS (mV)</th><th>Máximo (mV)</th></tr></thead><tbody>${differences.map(r=>`<tr><td>${r.lead}</td><td>${r.samples}</td><td>${fmt(r.coverage*100,0)} %</td><td>${fmt(r.biasMv,5)}</td><td>${fmt(r.rmsMv,5)}</td><td>${fmt(r.maxAbsMv,5)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="control-note">Copias de muestras originales en mV. No se remuestrea ni normaliza. JSON A/B no es un caso individual ni un archivo de anotaciones importable. PNG comparativo, no papel calibrado a 25 mm/s. Datos externos pueden seguir siendo sensibles. Sin validación clínica.</p>`);
    const proof=renderComparison(this.root.querySelector<HTMLCanvasElement>('canvas')!,a,b,this.view,Math.max(900,this.root.clientWidth-40));
    this.root.querySelector('#comparison-clipping')!.textContent=proof.clippedA+proof.clippedB?
      `Fuera del rango vertical: A ${proof.clippedA} muestras; B ${proof.clippedB}. Amplía el rango; los datos no se han recortado.`:
      'Escala común sin normalización. En móvil, desplaza sólo el gráfico horizontalmente.';
    if(focused)this.root.querySelector<HTMLElement>('#'+focused)?.focus({preventScroll:true});
  }
}
