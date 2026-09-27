import './external.css';
import { LEADS, type Measurement, type MetricKey } from '../engine/types';
import { exportECGCsv, externalWindow, MAX_FILE_BYTES, type ExternalECG, type CsvOptions } from '../io/external-ecg';
import { renderExternal, type ExternalView } from '../render/external';
import { download } from './persistence';
import { esc } from './helpers';
import { APP_VERSION } from './version';

const value = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : v.toFixed(1);
const status = (s: string) => s === 'usable' ? 'Consistente*' : s === 'review' ? 'Revisar' : 'No estimable';
const rows: [MetricKey, string, string][] = [['hr', 'FC', 'lpm'], ['pr', 'PR', 'ms'], ['qrs', 'QRS', 'ms'], ['qt', 'QT', 'ms'], ['axis', 'Eje QRS', '°']];

/** Independent, ephemeral viewer: cannot replace synthetic session data or invoke model audit. */
export class ExternalLab {
  private dialog = document.createElement('dialog');
  private record: ExternalECG | null = null;
  private measurement: Measurement | null = null;
  private view: ExternalView = { start: 0, offset: 0, seconds: 2, range: 2, marks: false };
  private worker: Worker | null = null;
  private epoch = 0;
  private timer = 0;
  private busy = false;
  private message = '';
  constructor() {
    this.dialog.id = 'external-lab'; this.dialog.className = 'external-lab';
    this.dialog.setAttribute('aria-labelledby', 'external-title');
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this.clear(); });
    this.dialog.addEventListener('input', e => {
      if ((e.target as HTMLElement).id !== 'external-start' || !this.record) return;
      this.cancel(); this.measurement = null;
      this.dialog.querySelector('#external-analysis')?.remove();
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-external=png],[data-external=json]').forEach(b => { b.disabled = true; });
      this.message = 'Inicio modificado: se retiraron medidas y marcas. Pulsa Analizar 10 s.'; this.notify(); this.draw();
    });
    this.dialog.addEventListener('click', e => this.click((e.target as HTMLElement).closest<HTMLButtonElement>('[data-external]')?.dataset.external));
    this.dialog.addEventListener('change', e => this.change(e.target as HTMLInputElement));
  }
  open() {
    if (this.dialog.open) return;
    this.clear();
    this.dialog.innerHTML = `<div class="external-heading"><div><div class="section-label">LECTOR DE SEÑALES DIGITALES</div><h2 id="external-title">Del archivo al trazado</h2></div><button class="btn" data-external="close">Cerrar y borrar</button></div>
      <p class="dialog-lead">Abre un CSV o selecciona juntos un .hea y su .dat. No digitaliza imágenes/PDF. Este espacio es independiente del simulador: no asigna diagnósticos ni referencias sintéticas.</p>
      <div class="external-import"><label class="external-files">Archivos locales<input id="external-files" type="file" multiple accept=".hea,.dat,.csv"/></label>
      <label>Hz del CSV*<input id="external-fs" type="number" min="100" max="1000" step="1" placeholder="Ej. 500"/></label>
      <label>Unidad del CSV*<select id="external-unit"><option value="">Declarar…</option><option value="mV">mV</option><option value="uV">µV</option></select></label>
      <button class="btn primary" data-external="load">Abrir archivos</button></div>
      <p class="control-note">*Solo para CSV sin metadatos. CSV: columnas I, II, III, aVR, aVL, aVF, V1–V6; time_s opcional, decimal con punto, separador coma. WFDB: formato 16 multiplexado, ganancia/unidades explícitas, checksum; sin offsets, skew ni segmentos. Doce canales completos, 100–1000 Hz, 10–60 s. No se rellenan ni se fabrican derivaciones.</p>
      <details><summary>Privacidad y límites</summary><p class="control-note">Lectura y análisis en un worker local, sin subir archivos ni guardarlos en el navegador. Cerrar o borrar libera el registro. No se copian comentarios del encabezado, nombres de paciente ni nombres de archivo a las exportaciones. Las señales exportadas pueden seguir siendo datos sensibles: usa datos autorizados y desidentificados. Integridad de archivo no equivale a autenticidad ni validez clínica. El analizador es exploratorio y no está validado para tomar decisiones clínicas.</p></details>
      <p id="external-message" class="external-message" role="status" aria-live="polite"></p><div id="external-results"></div>`;
    this.dialog.showModal();
  }
  private cancel() { this.epoch++; this.worker?.terminate(); this.worker = null; window.clearTimeout(this.timer); this.busy = false; }
  private clear() { this.cancel(); this.record = null; this.measurement = null; this.message = ''; this.view = {start:0, offset:0, seconds:2, range:2, marks:false}; this.dialog.innerHTML = ''; }
  private notify() { const el = this.dialog.querySelector('#external-message'); if (el) el.textContent = this.message; }
  private run(request: object, accept: (data: {record?: ExternalECG; measurement: Measurement}) => void) {
    this.cancel(); const epoch = this.epoch; this.busy = true; this.measurement = null; this.message = 'Procesando localmente…'; this.render();
    const fail = (message: string) => { if (epoch !== this.epoch) return; this.cancel(); this.message = message; this.render(); };
    try {
      this.worker = new Worker(new URL('./external-worker.ts', import.meta.url), {type:'module'});
      this.worker.onmessage = ({data}) => {
        if (epoch !== this.epoch || !this.dialog.open) return;
        if (data.error) { fail(data.error); return; }
        this.cancel(); accept(data); this.message = 'Archivo leído. Estimaciones exploratorias, sin auditoría contra un modelo sintético.'; this.render();
      };
      this.worker.onerror = e => { e.preventDefault(); fail('Error del worker local. Vuelve a abrir el archivo; no se muestra un análisis anterior.'); };
      this.worker.onmessageerror = () => fail('Respuesta del worker no legible. No se acepta un resultado incompleto.');
      this.timer = window.setTimeout(() => fail('Se agotó el tiempo de lectura/análisis. Reduce la duración del archivo.'), 30000);
      this.worker.postMessage(request);
    } catch { fail('No se pudo iniciar el worker local. No hay envío alternativo a un servidor.'); }
  }
  private click(action?: string) {
    if (!action) return;
    try {
      if (action === 'close') { this.dialog.close(); return; }
      if (action === 'clear') {
        this.cancel(); this.record = null; this.measurement = null; this.message = 'Archivo borrado de esta sesión.';
        this.dialog.querySelector<HTMLInputElement>('#external-files')!.value = ''; this.render(); return;
      }
      if (action === 'load') {
        const files = Array.from(this.dialog.querySelector<HTMLInputElement>('#external-files')!.files ?? []);
        if (!files.length || files.length > 2 || files.some(f => f.size > MAX_FILE_BYTES)) throw Error('Selecciona un CSV o una pareja WFDB. Máximo 32 MiB por archivo.');
        const fsText = this.dialog.querySelector<HTMLInputElement>('#external-fs')!.value, unit = this.dialog.querySelector<HTMLSelectElement>('#external-unit')!.value;
        let csv: CsvOptions | undefined;
        if (files.some(f => /\.csv$/i.test(f.name)) && (fsText || unit)) {
          if (!fsText || !unit) throw Error('Para CSV declara tanto Hz como unidades, o deja ambos vacíos si contiene metadatos.');
          csv = { fs: Number(fsText), unit };
        }
        this.record = null; this.view = { start:0, offset:0, seconds:2, range:2, marks:false };
        this.run({kind:'read', files, csv}, data => { this.record = data.record!; this.measurement = data.measurement; });
      }
      if (action === 'analyze' && this.record) {
        const text = this.dialog.querySelector<HTMLInputElement>('#external-start')!.value;
        if (text === '') throw Error('Declara un inicio de ventana.');
        const start = Number(text);
        const samples = externalWindow(this.record, start);
        this.view.start = Math.round(start * this.record.fs) / this.record.fs;
        this.run({kind:'analyze', samples}, data => { this.measurement = data.measurement; });
      }
      if (action === 'csv' && this.record) download(new Blob([exportECGCsv(this.record)], {type:'text/csv'}), 'ecg-samples.csv');
      if (action === 'json' && this.record && this.measurement && !this.busy) {
        const samples = externalWindow(this.record, this.view.start);
        const data = {kind:'ecg-external-analysis', schemaVersion:1, appVersion:APP_VERSION, clinicalValidation:false, modelAuditUsed:false,
          provenance:this.record.provenance, fs:this.record.fs, units:'mV', recordSamples:this.record.samples,
          window:{startSample:Math.round(this.view.start*this.record.fs), seconds:10, timeBase:'measurement times relative to this window'},
          leads:Object.fromEntries(LEADS.map(l=>[l,Array.from(samples.leads[l])])), measurement:this.measurement};
        download(new Blob([JSON.stringify(data)], {type:'application/json'}), 'ecg-external-analysis.json');
      }
      if (action === 'png' && this.record && this.measurement && !this.busy) {
        const canvas = document.createElement('canvas'); renderExternal(canvas, this.record, this.measurement, this.view, 1500);
        const epoch = this.epoch; canvas.toBlob(blob => { if (blob && this.dialog.open && epoch === this.epoch) download(blob, 'ecg-external.png'); });
      }
    } catch (e) { this.message = e instanceof Error ? e.message : 'No se pudo completar la operación.'; this.notify(); }
  }
  private change(el: HTMLInputElement) {
    if (['external-files','external-fs','external-unit'].includes(el.id)) {
      this.cancel(); this.record = null; this.measurement = null; this.message = 'Selección lista. Pulsa Abrir archivos para verificarla.'; this.render(); return;
    }
    if (!this.record) return;
    if (el.id === 'external-start') {
      this.cancel(); this.measurement = null;
      try {
        if (el.value === '') throw Error('Declara un inicio de ventana.');
        externalWindow(this.record, Number(el.value));
        this.view.start = Math.round(Number(el.value) * this.record.fs) / this.record.fs;
        this.message = 'Nueva ventana: pulsa Analizar 10 s. Se retiraron las medidas anteriores.';
      } catch(e) { this.message = (e as Error).message; }
      this.render();
    }
    if (el.id === 'external-range') this.view.range = Number(el.value);
    if (el.id === 'external-seconds') { this.view.seconds = Number(el.value); this.view.offset = Math.min(this.view.offset, 10 - this.view.seconds); this.render(); }
    if (el.id === 'external-offset') { const value = Number(el.value); if (Number.isFinite(value) && value >= 0 && value <= 10 - this.view.seconds) this.view.offset = Math.round(value * this.record.fs) / this.record.fs; else { this.message = 'Desplazamiento fuera de la ventana.'; this.render(); } }
    if (el.id === 'external-marks') this.view.marks = el.checked;
    this.draw();
  }
  private draw() {
    const canvas = this.dialog.querySelector<HTMLCanvasElement>('#external-canvas');
    if (!canvas || !this.record) return;
    const proof = renderExternal(canvas, this.record, this.measurement, this.view, this.dialog.clientWidth - 60);
    this.dialog.querySelector('#external-clipping')!.textContent = proof.clipped ? `${proof.clipped} muestras fuera del rango. Amplía ±mV; las muestras no se recortan ni se normalizan.` : 'Sin recorte visual. El desplazamiento horizontal pertenece solo al gráfico.';
  }
  private render() {
    this.notify(); const target = this.dialog.querySelector('#external-results'); if (!target) return;
    if (!this.record) { target.innerHTML = ''; return; }
    const r = this.record, m = this.measurement;
    target.innerHTML = `<div class="external-summary"><strong>${r.provenance.format === 'wfdb16' ? 'WFDB 16 · checksum verificado' : 'CSV · escala declarada'}</strong><span>${r.fs} Hz · ${r.samples} muestras/canal · ${r.duration.toFixed(3)} s · 12 derivaciones</span><button class="btn subtle" data-external="clear">Borrar archivo</button></div>
      <div class="external-controls"><label>Inicio del análisis (s)<input id="external-start" type="number" value="${this.view.start}" min="0" max="${r.duration - 10}" step="0.1"/></label><button class="btn" data-external="analyze">Analizar 10 s</button>
      <label>Vista por panel<select id="external-seconds">${[2,5,10].map(n=>`<option value="${n}" ${n===this.view.seconds?'selected':''}>${n} s</option>`).join('')}</select></label>
      <label>Desplazar vista (s)<input id="external-offset" type="number" min="0" max="${10-this.view.seconds}" value="${this.view.offset}" step="0.1"/></label>
      <label>Rango compartido<select id="external-range">${[1,2,4,8,16].map(n=>`<option value="${n}" ${n===this.view.range?'selected':''}>±${n} mV</option>`).join('')}</select></label>
      <label class="external-check"><input id="external-marks" type="checkbox" ${this.view.marks?'checked':''}/>Marcas automáticas</label></div>
      <div class="external-scroll" tabindex="0" role="region" aria-label="Doce derivaciones importadas; desplaza sólo el gráfico"><canvas id="external-canvas" role="img"></canvas></div><p id="external-clipping" class="control-note"></p>
      <div class="external-actions"><button class="btn" data-external="csv">Exportar CSV completo</button><button class="btn" data-external="json" ${m?'':'disabled'}>Informe JSON · 10 s</button><button class="btn" data-external="png" ${m?'':'disabled'}>Exportar PNG</button></div>
      ${m ? `<div id="external-analysis"><h3>Estimaciones de ${this.view.start.toFixed(3)} a ${(this.view.start+10).toFixed(3)} s</h3><p class="control-note">*Consistente describe repetibilidad interna, no exactitud clínica. No se utiliza la referencia de los casos sintéticos ni se completa un valor ausente. La detección usa I, II, V1 y V5: las marcas son globales, no anotaciones por derivación.</p>
      <div class="external-table"><table id="external-metrics"><thead><tr><th>Variable</th><th>Estimación</th><th>Estado</th><th>Soporte / motivo</th></tr></thead><tbody>${rows.map(([key,label,unit])=>`<tr><td>${label}</td><td>${value(m[key])} ${unit}</td><td>${status(m.evidence[key].status)}</td><td>${m.evidence[key].count}/${m.evidence[key].total} · ${esc(m.evidence[key].reason)}</td></tr>`).join('')}</tbody></table></div>
      <p class="control-note">QTc (ms): ${Object.entries(m.qtc).map(([name,v])=>`${name}: ${value(v)}`).join(' · ')}. Son estimaciones no validadas; pueden fallar con ruido, alteraciones de conducción o repolarización.</p>
      <details><summary>Candidatos por latido (${m.beats.length})</summary><p class="control-note">Tiempos absolutos del registro. Candidatos crudos; no implican que PR/QT globales sean utilizables.</p><div class="external-table"><table><thead><tr><th>#</th><th>Inicio QRS (s)</th><th>Final QRS (s)</th><th>Final T (s)</th><th>QRS (ms)</th><th>QT (ms)</th></tr></thead><tbody>${m.beats.map((b,i)=>`<tr><td>${i+1}</td><td>${(b.onset+this.view.start).toFixed(3)}</td><td>${(b.offset+this.view.start).toFixed(3)}</td><td>${b.tEnd===null?'—':(b.tEnd+this.view.start).toFixed(3)}</td><td>${value(b.qrs)}</td><td>${value(b.qt)}</td></tr>`).join('')}</tbody></table></div></details></div>` : '<p class="control-note">Análisis pendiente o no disponible. No se conservan cifras ni marcas de la ventana anterior.</p>'}`;
    this.draw();
  }
}
