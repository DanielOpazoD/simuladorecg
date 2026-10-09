import './activation.css';
import { cloneCase, type ECGCase, type Beat } from '../engine/types';
import { LEADS, type Lead } from '../engine/lead-registry';
import { activationAt, activationCandidate, activationPair, activationOptions, activationLimitation, ACTIVATION_SCOPE, ensureLearnedModel, learnedModelReady, type ActivationPair } from './activation-model';
import { activationCharts, activationSvg, updateActivationCursor } from '../render/activation';
import { esc, options } from './helpers';
import { download } from './persistence';
import { buildProvenance } from './build-provenance';

export type ActivationApplyResult =
  | { status: 'applied' | 'cancelled' | 'stale' }
  | { status: 'rejected'; message: string };
export interface ActivationInput { case: ECGCase; beats: Beat[] }
const KIND: Record<Beat['kind'], string> = { normal: 'conducido', pvc: 'EV', ventricular: 'ventricular', paced: 'estimulado' };
const CHANGES = [['conduction', 'Conducción'], ['pr', 'PR programado (ms)'], ['qrs', 'QRS programado (ms)'], ['axis', 'Eje solicitado (°)'], ['ventricularSource', 'Fuente ventricular'], ['activationModel', 'Modelo de activación']] as const;
const fmt = (v: number | null, places = 1) => v === null ? 'No definido' : v.toFixed(places);

/** Owns only a temporary, explicit what-if experiment. The main trace remains the worker's.
 * No source decision from a diagnosis label, no modification until Apply, no stale exports.
 */
export class ActivationLab {
  private readonly dialog = document.createElement('dialog');
  private snapshot: ActivationInput | null = null;
  private pair: ActivationPair | null = null;
  private beatIndex = 0;
  private timeMs = 0;
  private lead: Lead = 'II';
  private raf = 0;
  private opener: HTMLElement | null = null;
  private applying: AbortController | null = null;
  constructor(private readonly current: () => ActivationInput | null,
    private readonly apply: (candidate: ECGCase, original: ECGCase, signal: AbortSignal) => Promise<ActivationApplyResult>,
    private readonly notify: (message: string) => void) {
    this.dialog.id = 'activation-dialog'; this.dialog.className = 'activation-dialog';
    this.dialog.setAttribute('aria-labelledby', 'activation-title');
    this.dialog.setAttribute('aria-describedby', 'activation-scope');
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => {
      this.cancelApply(); this.stop(); this.snapshot = null; this.pair = null; this.dialog.replaceChildren();
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
    this.dialog.addEventListener('cancel', () => this.cancelApply());
    this.dialog.addEventListener('click', event => this.action((event.target as Element).closest<HTMLElement>('[data-activation]')?.dataset.activation));
    this.dialog.addEventListener('change', event => {
      if (this.applying) return;
      const target = event.target as HTMLSelectElement;
      if (target.id === 'activation-beat') {
        const hadFocus = document.activeElement === target;
        this.beatIndex = Number(target.value); this.render();
        if (hadFocus) this.get<HTMLSelectElement>('#activation-beat').focus({ preventScroll: true });
      }
      if (target.id === 'activation-choice') this.refresh(true);
      if (target.id === 'activation-model') this.refresh();
      if (target.id === 'activation-lead' && LEADS.includes(target.value as Lead)) { this.lead = target.value as Lead; this.cursor(); }
    });
    this.dialog.addEventListener('input', event => {
      if (this.applying) return;
      const target = event.target as HTMLInputElement;
      if (target.id === 'activation-qrs') this.refresh();
      if (target.id === 'activation-time') { this.stop(); this.timeMs = Number(target.value); this.cursor(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  open(): void {
    const input = this.current();
    if (!input) { this.notify('Espera a que el simulador tenga una señal válida.'); return; }
    // Any alternative (BRI, HBAI…) may need a learned class model, even from a
    // kernel case: load them all before the first render.
    if (!learnedModelReady()) {
      void ensureLearnedModel().then(() => this.open(), () => this.notify('No se pudo cargar el modelo aprendido.'));
      return;
    }
    if (this.dialog.open) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.snapshot = { case: cloneCase(input.case), beats: input.beats.filter(b => b.time >= 0 && b.time < 10).map(b => ({ ...b })) };
    this.beatIndex = Math.max(0, this.snapshot.beats.findIndex(b => b.kind !== 'normal'));
    this.timeMs = 0; this.lead = 'II'; this.render(); this.dialog.showModal();
  }
  invalidate(): void { this.cancelApply(); this.stop(); if (this.dialog.open) this.dialog.close(); }
  private get<T extends Element = HTMLElement>(selector: string): T { return this.dialog.querySelector<T>(selector)!; }
  private valid(): boolean {
    const live = this.current();
    return !!live && !!this.snapshot && JSON.stringify(live.case) === JSON.stringify(this.snapshot.case);
  }
  private render(): void {
    if (!this.snapshot) return;
    this.stop(); this.pair = null;
    const { case: c, beats } = this.snapshot, beat = beats[this.beatIndex];
    const limitation = activationLimitation(c, beat);
    this.dialog.innerHTML = `<header class="activation-header"><div><p class="activation-kicker">EL VECTOR DETRÁS DEL TRAZADO</p><h2 id="activation-title">Laboratorio de activación QRS</h2><p>Explora el recorrido eléctrico del modelo y su proyección sobre las 12 derivaciones.</p></div><button type="button" class="btn" data-activation="close" autofocus>Cerrar</button></header>
      <p id="activation-apply-status" class="activation-note" role="status" hidden></p>
      <fieldset class="activation-workbench">
      <p id="activation-scope" class="activation-scope">${esc(ACTIVATION_SCOPE)}</p>
      <div class="activation-controls"><label>Latido real del caso<select id="activation-beat" ${beats.length ? '' : 'disabled'}>${beats.map((b, i) => `<option value="${i}" ${i === this.beatIndex ? 'selected' : ''}>${i + 1} · ${KIND[b.kind]} · ${b.time.toFixed(2)} s</option>`).join('')}</select></label><label>Alternativa B ${beat?.kind === 'normal' ? '· conducción' : '· fuente'}<select id="activation-choice" ${limitation ? 'disabled' : ''}>${beat ? options(activationOptions(beat), 'unchanged') : ''}</select></label></div>
      <div class="activation-controls" ${limitation ? 'hidden' : ''}><label>QRS solicitado B (ms)<input id="activation-qrs" type="number" min="60" max="240" step="any" value="${c.qrs}" required aria-describedby="activation-edit-note activation-error"/></label><label>Modelo de activación B<select id="activation-model">${options([['template', 'Sin modelo regional (base del caso)'], ['regional-rbbb-v1', 'BRD regional · experimental'], ['regional-lbbb-v1', 'BRI regional · experimental']], c.activationModel ?? 'template')}</select></label></div>
      <p id="activation-edit-note" class="activation-note" ${limitation ? 'hidden' : ''}>Solo cambia B; A permanece capturado. Cambiar conducción/fuente restablece los parámetros de B. El modelo regional se aplica únicamente dentro de su dominio y a latidos conducidos. La etiqueta de conducción identifica la configuración elegida, no un diagnóstico del QRS ajustado.</p>
      <button type="button" class="btn" data-activation="reset" ${limitation ? 'hidden' : ''}>Restablecer B = A</button>
      <p id="activation-error" role="status" tabindex="-1" ${limitation ? '' : 'hidden'}>${esc(limitation ?? '')}</p>
      <div id="activation-experiment" ${limitation ? 'hidden' : ''}><div class="activation-legend"><span><i class="activation-a"></i>A · caso capturado (discontinuo)</span><span><i class="activation-b"></i>B · alternativa (continuo)</span></div>
      <div id="activation-summary" class="activation-summary"></div><p id="activation-changes" class="activation-note"></p>
      <div class="activation-playback"><button type="button" class="btn" data-activation="play">Reproducir lento</button><label>Recorrer QRS (ms)<input id="activation-time" type="range" min="0" max="240" step="1" value="0"/></label><output id="activation-clock">0 ms</output><label>Lectura instantánea<select id="activation-lead">${options([...LEADS], this.lead)}</select></label><output id="activation-instant"></output></div>
      <div id="activation-charts" class="activation-charts"></div><p id="activation-scale" class="activation-note"></p><p class="activation-note">*Pico vectorial en coordenadas sintéticas del modelo, no voltaje de una derivación ni fuerza eléctrica anatómica. Las dos curvas comparten escala y tiempo absoluto desde el inicio del QRS. No se normaliza cada fuente por separado. Reproducción lenta: un recorrido completo en 2 segundos.</p><p class="activation-note">La alternativa es una vista previa del QRS aislado. Al aplicarla, el motor valida y recalcula el ECG completo, incluida la repolarización; ciertas combinaciones de parámetros pueden quedar fuera de alcance.</p>
      <div class="activation-footer"><button type="button" class="btn primary" data-activation="apply">Aplicar B al caso</button><button type="button" class="btn" data-activation="svg">Exportar SVG</button><button type="button" class="btn" data-activation="json">Exportar experimento JSON</button></div></div></fieldset>`;
    if (!limitation) this.refresh(true);
  }
  private refresh(resetControls = false): void {
    this.stop(); this.pair = null;
    if (!this.snapshot) return;
    try {
      const { case: c, beats } = this.snapshot;
      const beat = beats[this.beatIndex], choice = this.get<HTMLSelectElement>('#activation-choice').value;
      const qrs = this.get<HTMLInputElement>('#activation-qrs'), model = this.get<HTMLSelectElement>('#activation-model');
      if (resetControls) {
        const candidate = activationCandidate(c, beat, choice);
        qrs.value = String(candidate.qrs); model.value = candidate.activationModel ?? 'template';
      }
      const qrsMs = qrs.value.trim() === '' ? NaN : Number(qrs.value);
      const validQrs = Number.isFinite(qrsMs) && qrsMs >= 60 && qrsMs <= 240;
      qrs.setAttribute('aria-invalid', String(!validQrs));
      this.pair = activationPair(c, beat, choice, { qrsMs, activationModel: model.value as NonNullable<ECGCase['activationModel']> });
      const { a, b, durationMs, leadRangeMv } = this.pair;
      this.get('#activation-error').hidden = true; this.get('#activation-experiment').hidden = false;
      const regions = { septal: 'Septal', 'lv-main': 'VI principal', 'lv-terminal': 'VI terminal', 'rv-delayed': 'VD tardío', 'rv-septal': 'VD/septo inicial', 'lv-delayed': 'VI lateral' };
      this.get('#activation-summary').innerHTML = [a, b].map((t, i) => `<div><strong>${i ? 'B' : 'A'} · ${esc(t.label)}</strong><dl><div><dt>QRS efectivo del modelo</dt><dd>${fmt(t.durationMs, 0)} ms</dd></div><div><dt>Eje integrado XYZ→I/II</dt><dd>${fmt(t.summary.frontalAxisDeg)}${t.summary.frontalAxisDeg === null ? "" : "°"}</dd></div><div><dt>Pico vectorial*</dt><dd>${fmt(t.summary.peakMagnitude, 3)}</dd></div></dl><p class="activation-note" data-activation-model="${i ? 'B' : 'A'}"><strong>${esc(t.timing.label)}.</strong> ${esc(t.timing.note)}</p>${t.timing.regions.length ? `<details class="activation-timing"><summary>Soportes programados (ms)</summary><ul>${t.timing.regions.map(r => `<li>${regions[r.region]}: ${r.startMs}–${r.endMs} ms</li>`).join('')}</ul><p>No son tiempos medidos en pacientes.</p></details>` : ''}</div>`).join('');
      const changes = CHANGES.filter(([key]) => a.case[key] !== b.case[key]);
      this.get('#activation-changes').textContent = changes.length
        ? `Cambios coordinados: ${changes.map(([key, label]) => `${label}: ${a.case[key]} → ${b.case[key]}`).join(' · ')}. ${a.case.pr !== b.case.pr ? 'El PR cambia: al aplicar se recalculan los tiempos de los eventos. Las curvas se alinean a sus propios inicios QRS, no al reloj absoluto del ECG.' : 'El ritmo y el calendario de latidos no cambian.'}`
        : 'Control sin cambios: A y B coinciden. Elige otra conducción o fuente para explorar.';
      this.get<HTMLButtonElement>('[data-activation="apply"]').disabled = !changes.length;
      this.get('#activation-charts').innerHTML = activationCharts(this.pair);
      this.get('#activation-charts').setAttribute('aria-label', `Escala común en las 12 derivaciones: ±${leadRangeMv.toFixed(2)} mV. Pico vectorial en coordenadas sintéticas del modelo.`);
      this.get('#activation-scale').textContent = `Las 12 derivaciones comparten un rango de ±${leadRangeMv.toFixed(2)} mV. Filtros, ruido e inversión de electrodos del ECG no se aplican aquí.`;
      const slider = this.get<HTMLInputElement>('#activation-time'); slider.max = String(durationMs);
      this.timeMs = resetControls ? durationMs * .5 : Math.min(this.timeMs, durationMs); this.cursor();
    } catch (error) {
      this.pair = null; this.get('#activation-charts').replaceChildren();
      this.get('#activation-experiment').hidden = true;
      this.get('#activation-error').hidden = false; this.get('#activation-error').textContent = (error as Error).message;
    }
  }
  private cursor(): void {
    if (!this.pair) return;
    const slider = this.get<HTMLInputElement>('#activation-time');
    this.timeMs = Math.min(this.pair.durationMs, Math.max(0, this.timeMs)); slider.value = String(this.timeMs);
    slider.setAttribute('aria-valuetext', `${this.timeMs.toFixed(0)} milisegundos desde el inicio del QRS`);
    this.setCursorText('#activation-clock', `${this.timeMs.toFixed(0)} / ${this.pair.durationMs.toFixed(0)} ms`);
    const a = activationAt(this.pair.a, this.timeMs), b = activationAt(this.pair.b, this.timeMs);
    this.setCursorText('#activation-instant', `${this.lead} · A ${a.leads[this.lead].toFixed(3)} mV · B ${b.leads[this.lead].toFixed(3)} mV`);
    updateActivationCursor(this.get('#activation-charts'), this.pair, this.timeMs);
  }
  // Update Text nodes rather than replacing them on every animation frame.
  // The app's global child-list accessibility observer need not rescan the UI.
  private setCursorText(selector: string, value: string): void {
    const element = this.get(selector), first = element.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) first.nodeValue = value;
    else element.textContent = value;
  }
  private stop(): void {
    cancelAnimationFrame(this.raf); this.raf = 0;
    const play = this.dialog.querySelector('[data-activation="play"]');
    if (play) { play.textContent = 'Reproducir lento'; play.setAttribute('aria-pressed', 'false'); }
  }
  private cancelApply(): void {
    const applying = this.applying;
    this.applying = null;
    applying?.abort();
    this.dialog.querySelector('.activation-workbench')?.removeAttribute('aria-busy');
  }
  private async applyValidated(): Promise<void> {
    if (!this.pair || !this.snapshot || this.applying) return;
    this.stop();
    const attempt = new AbortController(); this.applying = attempt;
    const workbench = this.get<HTMLFieldSetElement>('.activation-workbench');
    const status = this.get('#activation-apply-status');
    const applyButton = this.get<HTMLButtonElement>('[data-activation="apply"]');
    applyButton.textContent = 'Validando ECG completo…';
    workbench.disabled = true; workbench.setAttribute('aria-busy', 'true');
    this.get<HTMLElement>('[data-activation="close"]').focus();
    status.hidden = false;
    status.textContent = 'Validando B con el motor completo. A y el trazado actual se conservan; puedes cancelar con Cerrar o Escape.';
    this.dialog.scrollTop = 0;
    this.get('#activation-error').hidden = true;
    try {
      const result = await this.apply(cloneCase(this.pair.b.case), cloneCase(this.snapshot.case), attempt.signal);
      if (this.applying !== attempt || attempt.signal.aborted || !this.dialog.open) return;
      if (result.status === 'applied') {
        this.dialog.close(); this.notify('Alternativa validada y aplicada. El ECG completo está disponible; el origen se conserva.');
      } else if (result.status === 'stale') {
        this.invalidate(); this.notify('El caso cambió; la alternativa no se aplicó.');
      } else if (result.status === 'rejected') {
        const error = this.get('#activation-error'); error.hidden = false;
        error.textContent = `B no se aplicó. ${result.message} A y el trazado anterior se conservan. Revisa B o restablece B = A.`;
      }
    } catch {
      if (this.applying === attempt && this.dialog.open) {
        const error = this.get('#activation-error'); error.hidden = false;
        error.textContent = 'No se pudo completar la aplicación. Revisa el estado del simulador antes de volver a intentarlo.';
      }
    } finally {
      if (this.applying === attempt) {
        this.applying = null; workbench.removeAttribute('aria-busy');
        workbench.disabled = false; status.hidden = true; applyButton.textContent = 'Aplicar B al caso';
        // Restore the final layout before revealing the result. In WebKit an
        // already-focused Close button can otherwise pull a synchronous failure
        // back to the top after scrollIntoView, leaving the message clipped.
        const error = this.dialog.querySelector<HTMLElement>('#activation-error');
        if (this.dialog.open && error && !error.hidden) {
          error.focus({ preventScroll: true });
          error.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }
    }
  }
  private action(action?: string): void {
    if (action === 'close') { this.invalidate(); return; }
    if (this.applying) return;
    if (action === 'reset' && this.snapshot) {
      if (!this.valid()) { this.invalidate(); return; }
      this.get<HTMLSelectElement>('#activation-choice').value = 'unchanged'; this.refresh(true); return;
    }
    if (!action || !this.pair || !this.snapshot) return;
    if (!this.valid()) { this.invalidate(); this.notify('El caso cambió. Abre de nuevo el laboratorio para evitar una comparación obsoleta.'); return; }
    if (action === 'play') {
      if (this.raf) { this.stop(); return; }
      const start = performance.now(), duration = this.pair.durationMs;
      this.get('[data-activation="play"]').textContent = 'Pausar';
      this.get('[data-activation="play"]').setAttribute('aria-pressed', 'true');
      const tick = (now: number) => {
        if (!this.dialog.open || !this.pair) return;
        this.timeMs = Math.min(1, (now - start) / 2000) * duration; this.cursor();
        if (this.timeMs < duration) this.raf = requestAnimationFrame(tick); else this.stop();
      };
      this.raf = requestAnimationFrame(tick); return;
    }
    if (action === 'apply') {
      if (this.get<HTMLButtonElement>('[data-activation="apply"]').disabled) return;
      void this.applyValidated();
    }
    if (action === 'svg') download(new Blob([activationSvg(this.pair, this.timeMs)], { type: 'image/svg+xml' }), 'ecg-lab-activacion-QRS.svg');
    if (action === 'json') download(new Blob([JSON.stringify({ schemaVersion: 1, kind: 'ecg-lab-activation', build: buildProvenance(), scope: ACTIVATION_SCOPE,
      clinicalValidation: false, sampling: 'QRS isolated, summed temporal kernels (template or regional) plus eligible WPW delta; intervals <= 1 ms, inclusive endpoints; no filtering',
      timeReference: 'Curves aligned to their own QRS onsets. beat.time is the original captured event, not a predicted onset for B; Apply regenerates events.',
      cursorMs: this.timeMs, lead: this.lead, ...this.pair }, null, 2)], { type: 'application/json' }), 'ecg-lab-activacion-QRS.json');
  }
}
