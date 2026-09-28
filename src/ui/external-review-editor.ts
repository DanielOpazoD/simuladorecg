import { LEADS, type Lead, type Measurement } from '../engine/types';
import type { ExternalECG } from '../io/external-ecg';
import { importReview, intervalMs, ManualHistory, MAX_ANNOTATIONS, MAX_REVIEW_BYTES, reviewSidecar, validateBounds,
  type SignalIdentity, type ManualBounds, type ManualKind } from '../io/external-review';
import { renderReviewTrace, sampleAtReviewPoint, type ReviewGeometry, type ReviewView } from '../render/external-review';
import { buildProvenance } from './build-provenance';
import { download } from './persistence';
import { esc } from './helpers';

type Endpoint = 'startSample' | 'endSample';
const guidance: Record<ManualKind, string> = {
  PR:'Inicio de P → inicio QRS. Selección manual por derivación; no asociación AV automática.',
  QRS:'Inicio QRS → final QRS. Selecciona ambos límites en la misma derivación.',
  QT:'Inicio QRS → final T. Revisa T/U y superposición; no se calcula QTc manual.'
};

/** One local annotation list + one draft. Never writes to samples or automatic Measurement. */
export class ExternalReviewEditor {
  readonly root = document.createElement('section');
  private history = new ManualHistory();
  private draft: ManualBounds | null = null;
  private editingId: number | null = null;
  private touched = false;
  private endpoint: Endpoint = 'endSample';
  private view: ReviewView = {lead:'II', startSample:0, seconds:1.6, range:2};
  private geometry: ReviewGeometry | null = null;
  private peaks: number[] = [];
  private message = '';
  private alive = true;
  private importing = false;
  private dragging = false;
  private observer: ResizeObserver;
  constructor(private record: ExternalECG, private identity: SignalIdentity) {
    this.root.id = 'external-review'; this.root.className = 'external-review';
    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-review]');
      if (button && !button.disabled) this.action(button.dataset.review!, Number(button.dataset.id));
    });
    this.root.addEventListener('change', e => this.change(e.target as HTMLInputElement));
    this.root.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).id !== 'manual-canvas' || !this.draft || this.importing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelDraft(); return; }
      if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const move = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      this.setEndpoint(this.draft[this.endpoint] + move);
    });
    this.root.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).id !== 'manual-canvas' || !this.draft || this.importing || e.button !== 0) return;
      this.dragging = true; (e.target as HTMLElement).setPointerCapture(e.pointerId);
      (e.target as HTMLElement).focus(); this.pointer(e); e.preventDefault();
    });
    this.root.addEventListener('pointermove', e => { if (this.dragging) this.pointer(e); });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) this.root.addEventListener(type, () => { this.dragging = false; });
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(this.root);
    this.render();
  }
  destroy() { this.alive = false; this.observer.disconnect(); this.root.remove(); }
  exportData() { return reviewSidecar(this.identity, this.history.list, buildProvenance()); }
  setAnalysis(m: Measurement | null, startSeconds: number) {
    this.peaks = m ? m.detectedPeaks.map(t => Math.round((startSeconds + t) * this.record.fs)) : [];
    // Updating automatic candidates must never discard/reposition a manual draft.
    const select = this.root.querySelector<HTMLSelectElement>('#manual-candidate');
    if (select) select.innerHTML = this.candidateOptions();
  }
  private candidateOptions() {
    return '<option value="">Ubicar por tiempo / selección libre</option>' + this.peaks.map((sample, i) =>
      `<option value="${sample}">Candidato ${i + 1} · ${(sample / this.record.fs).toFixed(3)} s</option>`).join('');
  }
  private setEndpoint(sample: number) {
    if (!this.draft) return;
    this.draft[this.endpoint] = Math.max(0, Math.min(this.record.samples - 1, Math.round(sample)));
    this.touched = true; this.updateDraft(); this.draw();
  }
  private pointer(e: PointerEvent) {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#manual-canvas');
    if (!canvas || !this.geometry || !this.draft) return;
    const box = canvas.getBoundingClientRect();
    this.setEndpoint(sampleAtReviewPoint((e.clientX - box.left) * (parseFloat(canvas.style.width) / box.width), this.geometry));
  }
  private cancelDraft() { this.draft = null; this.editingId = null; this.touched = false; this.message = 'Borrador cancelado. Las anotaciones guardadas no cambian.'; this.render(); }
  private change(el: HTMLInputElement) {
    if (!this.alive || this.importing) return;
    try {
      if (el.id === 'manual-import') { void this.readSidecar(el); return; }
      if (el.id === 'manual-lead') { this.view.lead = el.value as Lead; this.draft = null; this.editingId = null; }
      if (el.id === 'manual-span') this.view.seconds = Number(el.value);
      if (el.id === 'manual-range') this.view.range = Number(el.value);
      if (el.id === 'manual-view-start') {
        if (el.value === '' || !Number.isFinite(Number(el.value)) || Number(el.value) < 0 || Number(el.value) > this.record.duration - this.view.seconds) throw Error('Inicio de vista manual fuera del registro.');
        this.view.startSample = Math.round(Number(el.value) * this.record.fs);
      }
      if (el.id === 'manual-candidate' && el.value !== '')
        this.view.startSample = Math.max(0, Number(el.value) - Math.round(.25 * this.record.fs));
      this.view.startSample = Math.min(this.view.startSample, this.record.samples - Math.round(this.view.seconds * this.record.fs));
      if (el.id === 'manual-endpoint') this.endpoint = el.value === 'startSample' ? 'startSample' : 'endSample';
      if (el.id === 'manual-kind' && this.draft) { this.draft.kind = el.value as ManualKind; this.touched = true; }
      if (['manual-start-sample','manual-end-sample'].includes(el.id) && this.draft) {
        const n = Number(el.value);
        if (el.value === '' || !Number.isSafeInteger(n) || n < 0 || n >= this.record.samples) throw Error('Usa un índice de muestra entero dentro del registro.');
        this.draft[el.id === 'manual-start-sample' ? 'startSample' : 'endSample'] = n; this.touched = true;
      }
      this.message = ''; this.render();
    } catch (e) { this.message = (e as Error).message; this.render(); }
  }
  private action(action: string, id: number) {
    if (this.importing) return;
    try {
      if (action === 'new') {
        const count = Math.round(this.view.seconds * this.record.fs);
        this.draft = {lead:this.view.lead, kind:'QRS', startSample:this.view.startSample + Math.round(count * .25), endSample:this.view.startSample + Math.round(count * .5)};
        this.editingId = null; this.touched = false; this.message = 'Borrador geométrico. Coloca límites antes de guardar: no son una detección automática.';
      }
      if (action === 'cancel') { this.cancelDraft(); return; }
      if (action === 'focus') { this.root.querySelector<HTMLElement>('#manual-canvas')!.focus(); return; }
      if (action === 'save' && this.draft && this.touched) {
        const bounds = validateBounds(this.draft, this.record.samples), items = this.history.list;
        const nextId = this.editingId ?? Math.max(0, ...items.map(a => a.id)) + 1;
        const next = items.filter(a => a.id !== nextId);
        next.push({...bounds, id:nextId, origin:'manual', createdWith:buildProvenance()});
        this.history.replace(reviewSidecar(this.identity, next, buildProvenance()).annotations);
        this.draft = null; this.editingId = null; this.message = 'Lectura manual guardada por separado. El análisis automático y las muestras no cambian.';
      }
      if (action === 'edit') {
        const item = this.history.list.find(a => a.id === id); if (!item) throw Error('Anotación no encontrada.');
        this.draft = {lead:item.lead, kind:item.kind, startSample:item.startSample, endSample:item.endSample}; this.editingId = id; this.touched = false;
        this.view.lead = item.lead; this.view.startSample = Math.min(Math.max(0, item.startSample - Math.round(.1 * this.record.fs)), this.record.samples - Math.round(this.view.seconds * this.record.fs));
      }
      if (action === 'remove') { this.history.replace(this.history.list.filter(a => a.id !== id)); this.draft = null; this.message = 'Anotación eliminada; puedes deshacer.'; }
      if (action === 'undo' || action === 'redo') { this.history[action](); this.draft = null; this.editingId = null; this.message = 'Lista manual restaurada. No se alteró el ECG.'; }
      if (action === 'export') {
        download(new Blob([JSON.stringify(this.exportData(), null, 2)], {type:'application/json'}), 'ecg-manual-review.json');
        this.message = 'Exportadas sólo las anotaciones guardadas y su procedencia. El borrador no se exporta.';
      }
      this.render();
    } catch (e) { this.message = (e as Error).message; this.render(); }
  }
  private async readSidecar(input: HTMLInputElement) {
    const file = input.files?.[0]; if (!file) return;
    this.importing = true; this.message = 'Comprobando anotaciones…'; this.render();
    try {
      if (file.size > MAX_REVIEW_BYTES) throw Error('Revisión demasiado grande (máximo 128 KiB).');
      const text = await file.text(); if (!this.alive) return;
      const imported = importReview(text, this.identity);
      this.history.replace(imported.annotations); this.draft = null; this.editingId = null;
      this.message = `Importadas ${imported.annotations.length} lecturas manuales. La lista anterior se puede recuperar con Deshacer. El build original de cada lectura se conserva.`;
    } catch (e) { if (this.alive) this.message = (e as Error).message; }
    finally { if (this.alive) { this.importing = false; this.render(); } }
  }
  private updateDraft() {
    const draft = this.draft; if (!draft) return;
    for (const [id, key] of [['manual-start-sample','startSample'], ['manual-end-sample','endSample']] as const) {
      const input = this.root.querySelector<HTMLInputElement>('#' + id); if (input) input.value = String(draft[key]);
    }
    let valid = true; try { validateBounds(draft, this.record.samples); } catch { valid = false; }
    const out = this.root.querySelector<HTMLOutputElement>('#manual-readout')!;
    out.textContent = valid ? `${draft.kind} manual: ${intervalMs(draft, this.record.fs).toFixed(3)} ms · A ${(draft.startSample / this.record.fs).toFixed(4)} s → B ${(draft.endSample / this.record.fs).toFixed(4)} s` : 'Límites no válidos: coloca A antes de B.';
    out.dataset.ms = valid ? String(intervalMs(draft, this.record.fs)) : '';
    this.root.querySelector<HTMLButtonElement>('[data-review=save]')!.disabled = !valid || !this.touched || this.importing;
  }
  private draw() {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#manual-canvas');
    if (!canvas || !this.alive) return;
    this.geometry = renderReviewTrace(canvas, this.record, this.view, this.draft, (this.root.querySelector('fieldset')?.clientWidth ?? this.root.clientWidth) - 24);
  }
  private render() {
    if (!this.alive) return;
    const d = this.draft, n = this.record.samples, items = this.history.list;
    this.root.innerHTML = `<h3>Revisión manual · señal original</h3>
      <p class="control-note">Lectura por derivación, separada del resumen automático global. Una muestra = ${(1000 / this.record.fs).toFixed(3)} ms: resolución, no precisión clínica. ${items.length}/${MAX_ANNOTATIONS} anotaciones guardadas. Sin diagnóstico, QTc manual ni modificación del ECG.</p>
      <fieldset ${this.importing ? 'disabled' : ''}><legend>Elegir tramo y colocar límites</legend>
      <div class="review-controls">
        <label>Derivación<select id="manual-lead">${LEADS.map(l => `<option ${l === this.view.lead ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Ubicar candidato automático<select id="manual-candidate">${this.candidateOptions()}</select></label>
        <label>Inicio de vista (s)<input id="manual-view-start" type="number" min="0" max="${this.record.duration - this.view.seconds}" step="${1 / this.record.fs}" value="${this.view.startSample / this.record.fs}"/></label>
        <label>Duración visible<select id="manual-span">${[.4,.8,1.6,3.2].map(v => `<option value="${v}" ${v === this.view.seconds ? 'selected' : ''}>${v} s</option>`).join('')}</select></label>
        <label>Escala manual<select id="manual-range">${[.5,1,2,4,8,16].map(v => `<option value="${v}" ${v === this.view.range ? 'selected' : ''}>±${v} mV</option>`).join('')}</select></label>
        <button class="btn" data-review="new">Nueva lectura manual</button>
      </div>
      <canvas id="manual-canvas" tabindex="0" aria-describedby="manual-help"></canvas>
      <p id="manual-help" class="control-note">Elegir un candidato sólo centra la vista; no valida un latido ni copia límites. Arrastra o toca para colocar el extremo activo. Flechas: una muestra; Mayús: diez. Campos numéricos equivalentes. A/B siempre son índices absolutos del registro, empezando en cero.</p>
      ${d ? `<div class="review-controls">
        <label>Intervalo<select id="manual-kind">${(['PR','QRS','QT'] as const).map(k => `<option ${k === d.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Extremo activo<select id="manual-endpoint"><option value="startSample" ${this.endpoint === 'startSample' ? 'selected' : ''}>A · inicio</option><option value="endSample" ${this.endpoint === 'endSample' ? 'selected' : ''}>B · final</option></select></label>
        <label>Inicio A (muestra)<input id="manual-start-sample" type="number" min="0" max="${n - 1}" step="1" value="${d.startSample}"/></label>
        <label>Final B (muestra)<input id="manual-end-sample" type="number" min="0" max="${n - 1}" step="1" value="${d.endSample}"/></label>
        <button class="btn" data-review="focus">Mover en el trazado</button></div>
        <p class="control-note">${guidance[d.kind]}</p><output id="manual-readout" aria-live="polite"></output>
        <div class="external-actions"><button class="btn primary" data-review="save">Guardar lectura manual</button><button class="btn" data-review="cancel">Cancelar borrador</button></div>` : ''}
      <div class="external-actions"><button class="btn" data-review="undo" ${this.history.canUndo ? '' : 'disabled'}>Deshacer</button><button class="btn" data-review="redo" ${this.history.canRedo ? '' : 'disabled'}>Rehacer</button><button class="btn" data-review="export">Exportar anotaciones</button></div>
      <label class="review-import">Recuperar anotaciones de esta señal<input id="manual-import" type="file" accept=".json,application/json"/></label>
      <p class="control-note">Importar reemplaza la lista manual completa, sin combinarla ni tocar medidas automáticas. Se puede deshacer. La huella debe coincidir; no acredita autenticidad ni anonimato.</p>
      </fieldset><p id="manual-message" role="status" aria-live="polite">${esc(this.message)}</p>
      <div class="external-table"><table id="manual-annotations"><caption>Lecturas guardadas · índices absolutos · origen manual</caption><thead><tr><th>Derivación / intervalo</th><th>A → B (muestras)</th><th>Duración manual</th><th>Build que fijó los límites</th><th>Acciones</th></tr></thead><tbody>${items.map(a => `<tr data-annotation="${a.id}"><td>${a.lead} · ${a.kind}</td><td>${a.startSample} → ${a.endSample}</td><td>${intervalMs(a, this.record.fs).toFixed(3)} ms</td><td>${esc(a.createdWith.commit.slice(0, 8))}${a.createdWith.dirty ? ' · no publicado' : ''}</td><td><button class="btn" data-review="edit" data-id="${a.id}" ${this.importing ? 'disabled' : ''}>Editar ${a.id}</button> <button class="btn" data-review="remove" data-id="${a.id}" ${this.importing ? 'disabled' : ''}>Eliminar ${a.id}</button></td></tr>`).join('')}</tbody></table></div>`;
    if (d) this.updateDraft(); this.draw();
  }
}
