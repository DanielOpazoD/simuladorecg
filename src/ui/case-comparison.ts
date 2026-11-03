import { cloneCase, type ECGCase, type Signal } from "../engine/types";
import { PRESETS, fromPreset, presetById } from "../presets/catalog";
import { presetTitle } from "../presets/nomenclature";
import { caseReading } from "../presets/case-context";
import { catalogFamilyLabel } from "./catalog-view";
import { catalogFamilies } from "./catalog-presentation";
import { filterLabel, paperLayout, paperRowExtents, renderPaper } from "../render/ecg";
import { esc } from "./helpers";
import { conductionObservation } from "./terminal-qrs";
import { SignalController } from "./signal-controller";
import "./case-comparison.css";

const available = PRESETS.filter(p => p.strategy !== "pending");

export function caseComparisonHtml(): string {
  const families = catalogFamilies(available);
  return `<section class="case-comparison" aria-label="Comparación de ejemplos ECG">
    <div class="comparison-sheets">
      <figure class="comparison-sheet"><figcaption>ECG actual <strong id="comparison-current-name"></strong></figcaption><div class="comparison-paper" tabindex="0" role="region" aria-label="ECG actual: desplazamiento sincronizado"><canvas id="comparison-current" role="img"></canvas></div></figure>
      <figure class="comparison-sheet" id="comparison-reference-sheet" aria-busy="true"><figcaption class="comparison-controls"><label for="comparison-reference">Comparar con<select id="comparison-reference">${families.map(f => `<optgroup label="${esc(catalogFamilyLabel(f.id))}">${f.sections.filter(s => !s.crossListed).flatMap(s => s.presets).map(p => `<option value="${esc(p.id)}"${p.id === "sinus" ? " selected" : ""}>${esc(presetTitle(p))}</option>`).join("")}</optgroup>`).join("")}</select></label></figcaption><p id="comparison-status" role="status" aria-live="polite">Preparando referencia…</p><div class="comparison-paper" tabindex="0" role="region" aria-label="ECG de referencia: desplazamiento sincronizado"><canvas id="comparison-example" role="img" hidden></canvas></div></figure>
    </div>
    <p id="comparison-prompt" class="comparison-prompt" hidden></p>
    <p class="comparison-scale">Ejemplos independientes, con la misma escala.</p>
    <p id="comparison-acquisition" class="comparison-acquisition" hidden></p>
  </section>`;
}

/** Independent examples retain their physiology and manual artifacts. Use the
 * selected background-noise setting and the same paper calibration for both. */
export function comparisonCase(referenceId: string, current: ECGCase): ECGCase | null {
  const preset = presetById(referenceId);
  if (!preset || preset.strategy === "pending") return null;
  const reference = fromPreset(preset);
  reference.view = { ...current.view, mode: "paper" };
  reference.acquisition = current.acquisition ?? "realistic";
  return reference;
}

type ConductionFamily = "normal" | "rbbb" | "lbbb";

/** Family of the example, bounded by the preset conduction and the terminal-window observation:
 * 'normal' only when the programmed conduction is normal and the generated QRS is narrow; rbbb/lbbb
 * only when that conduction is programmed and the QRS is not narrow; at least one legible terminal
 * polarity (positive or negative) among V1, I and V6. Categorical readouts orient a question, they
 * are not a clinical detector. Null outside that domain or when everything is flat. */
function conductionFamily(c: ECGCase, s: Signal): ConductionFamily | null {
  const o = conductionObservation(c, s);
  if (!o) return null;
  if (![o.v1, o.i, o.v6].some(p => p === "positive" || p === "negative")) return null;
  if (c.conduction === "normal") return o.narrow ? "normal" : null;
  if (c.conduction === "rbbb" || c.conduction === "lbbb") return o.narrow ? null : c.conduction;
  return null;
}

/** One short question for the reader when the two independent examples belong to different
 * conduction families; empty otherwise. It only names where to look (the end of the QRS in V1, I
 * and V6) and announces no sign, R'/wide S, diagnosis or causality. Pure: no case or signal is mutated. */
export function comparisonPrompt(c: ECGCase, s: Signal, referenceCase: ECGCase, referenceSignal: Signal): string {
  const a = conductionFamily(c, s), b = conductionFamily(referenceCase, referenceSignal);
  if (!a || !b || a === b) return "";
  return "¿Cómo cambia el final del QRS en V1, I y V6 entre estos dos ejemplos?";
}

/** An isolated worker produces the catalog reference. No result is published to
 * the application's case/session, and no signal arithmetic is offered here. */
export function mountCaseComparison(host: HTMLElement, currentSignal: Signal, currentCase: ECGCase, referenceId = 'sinus'): () => void {
  const root = host.matches(".case-comparison") ? host : host.querySelector<HTMLElement>(".case-comparison")!;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const c = cloneCase(currentCase);
  c.view.mode = "paper";
  const referenceSelect = find<HTMLSelectElement>("#comparison-reference");
  const currentCanvas = find<HTMLCanvasElement>("#comparison-current");
  const referenceCanvas = find<HTMLCanvasElement>("#comparison-example");
  const sheets = [...root.querySelectorAll<HTMLElement>(".comparison-paper")];
  const referenceSheet = find("#comparison-reference-sheet");
  const status = find("#comparison-status");
  // One paragraph, reused: cleared before every request and on failure/dispose.
  const prompt = find("#comparison-prompt");
  const clearPrompt = () => { prompt.textContent = ""; prompt.hidden = true; };
  const abort = new AbortController();
  let disposed = false, pendingId = 0, reference: Signal | null = null;
  let referenceCase = comparisonCase(referenceId, c) ?? comparisonCase("sinus", c)!;
  referenceSelect.value = referenceCase.presetId;
  find('.comparison-scale').textContent = `Ejemplos independientes · ${c.view.speed} mm/s · ${c.view.gain} mm/mV${c.view.chestGain!==c.view.gain?` · Precordiales ${c.view.chestGain} mm/mV`:''}`;
  const currentName = caseReading(c).title;
  find("#comparison-current-name").textContent = currentName;
  currentCanvas.setAttribute("aria-label", `ECG actual: ${currentName}`);

  function draw() {
    if (disposed) return;
    const captions=[...root.querySelectorAll<HTMLElement>('figcaption')];
    captions.forEach(caption=>caption.style.minHeight='');
    const captionHeight=Math.max(...captions.map(caption=>caption.getBoundingClientRect().height));
    captions.forEach(caption=>caption.style.minHeight=`${captionHeight}px`);
    // A single explicit px/mm prevents independently fitting two morphologies
    // (or different row heights) from making their amplitudes incomparable.
    const width = Math.min(...sheets.map(sheet => sheet.clientWidth || root.clientWidth || 760));
    const geometry = paperLayout(c, width);
    const pxPerMm = Math.max(2.4, Math.min(width / geometry.widthMm, c.view.pxPerMm));
    // Reserve the union of both envelopes; never stretch or normalize either signal.
    const rowExtents=paperRowExtents(c,currentSignal,reference ?? undefined);
    renderPaper(currentCanvas, currentSignal, c, width, { pxPerMm, rowExtents, displayName: currentName, compactHeader: true });
    if (reference) renderPaper(referenceCanvas, reference, referenceCase, width, { pxPerMm, rowExtents, displayName: presetTitle(presetById(referenceCase.presetId)!), compactHeader: true });
  }

  const controller = new SignalController((signal, _measurement, id) => {
    if (disposed || id !== pendingId) return;
    reference = signal;
    referenceCanvas.hidden = false;
    referenceSheet.setAttribute("aria-busy", "false");
    status.textContent = "";
    status.hidden = true;
    draw();
    // Only the accepted answer for the current id feeds the question; no new canvas, no live region.
    const question = comparisonPrompt(c, currentSignal, referenceCase, signal);
    prompt.textContent = question;
    prompt.hidden = !question;
  }, (message, id) => {
    if (disposed || id !== pendingId) return;
    referenceSheet.setAttribute("aria-busy", "false");
    status.textContent = message;
    status.hidden = false;
    clearPrompt();
  });

  function chooseReference() {
    if (disposed) return;
    const next = comparisonCase(referenceSelect.value, c);
    if (!next) { referenceSelect.value = referenceCase.presetId; return; }
    referenceCase = next;
    reference = null;
    clearPrompt();
    referenceCanvas.hidden = true;
    referenceSheet.setAttribute("aria-busy", "true");
    status.hidden = false;
    status.textContent = "Preparando referencia…";
    const title = presetTitle(presetById(next.presetId)!);
    referenceCanvas.setAttribute("aria-label", `ECG de referencia: ${title}`);
    const acquisition = find("#comparison-acquisition");
    acquisition.hidden = next.filter === c.filter && next.notch === c.notch;
    acquisition.textContent = acquisition.hidden ? "" : `Filtros distintos: ECG actual, ${filterLabel(c)}; referencia, ${filterLabel(next)}.`;
    pendingId = controller.request(next, Math.max(10, currentSignal.duration));
  }
  referenceSelect.addEventListener("change", chooseReference, { signal: abort.signal });
  const mirrored=new WeakMap<HTMLElement,{left:number;top:number}>();
  sheets.forEach((sheet, i) => sheet.addEventListener("scroll", () => {
    // A mirrored scroll also emits an event. Do not let that delayed event
    // overwrite a newer gesture on the other axis.
    const expected=mirrored.get(sheet);mirrored.delete(sheet);
    if(expected && Math.abs(sheet.scrollLeft-expected.left)<=1 && Math.abs(sheet.scrollTop-expected.top)<=1)return;
    const other = sheets[1 - i];
    if (Math.abs(other.scrollLeft-sheet.scrollLeft)>1 || Math.abs(other.scrollTop-sheet.scrollTop)>1) {
      other.scrollLeft=sheet.scrollLeft;other.scrollTop=sheet.scrollTop;
      mirrored.set(other,{left:other.scrollLeft,top:other.scrollTop});
    }
  }, { passive: true, signal: abort.signal }));
  const observer = new ResizeObserver(draw);
  sheets.forEach(sheet => observer.observe(sheet));
  draw();
  chooseReference();

  return () => {
    if (disposed) return;
    disposed = true;
    clearPrompt();
    abort.abort();
    observer.disconnect();
    controller.dispose();
    root.closest("dialog")?.classList.remove("comparison-dialog");
  };
}
