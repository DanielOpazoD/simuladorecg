import { cloneCase, type ECGCase, type Signal } from "../engine/types";
import { PRESETS, fromPreset, presetById } from "../presets/catalog";
import { presetTitle } from "../presets/nomenclature";
import { caseReading } from "../presets/case-context";
import { filterLabel, paperLayout, renderPaper } from "../render/ecg";
import { esc } from "./helpers";
import { SignalController } from "./signal-controller";
import "./case-comparison.css";

const available = PRESETS.filter(p => p.strategy !== "pending");

export function caseComparisonHtml(): string {
  const groups = [...new Set(available.map(p => p.group))];
  return `<section class="case-comparison" aria-label="Comparación de ejemplos ECG">
    <div class="comparison-controls"><label for="comparison-reference">Comparar con<select id="comparison-reference">${groups.map(group => `<optgroup label="${esc(group)}">${available.filter(p => p.group === group).map(p => `<option value="${esc(p.id)}"${p.id === "sinus" ? " selected" : ""}>${esc(presetTitle(p))}</option>`).join("")}</optgroup>`).join("")}</select></label><p>Ejemplos independientes, con la misma escala.</p></div>
    <div class="comparison-sheets">
      <figure class="comparison-sheet"><figcaption>ECG actual <strong id="comparison-current-name"></strong></figcaption><div class="comparison-paper" tabindex="0" role="region" aria-label="ECG actual: desplazamiento horizontal"><canvas id="comparison-current" role="img"></canvas></div></figure>
      <figure class="comparison-sheet" id="comparison-reference-sheet" aria-busy="true"><figcaption>Referencia <strong id="comparison-reference-name">Ritmo sinusal</strong></figcaption><p id="comparison-status" role="status" aria-live="polite">Preparando referencia…</p><div class="comparison-paper" tabindex="0" role="region" aria-label="ECG de referencia: desplazamiento horizontal"><canvas id="comparison-example" role="img" hidden></canvas></div></figure>
    </div>
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

/** An isolated worker produces the catalog reference. No result is published to
 * the application's case/session, and no signal arithmetic is offered here. */
export function mountCaseComparison(host: HTMLElement, currentSignal: Signal, currentCase: ECGCase): () => void {
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
  const abort = new AbortController();
  let disposed = false, pendingId = 0, reference: Signal | null = null;
  let referenceCase = comparisonCase("sinus", c)!;
  const currentName = caseReading(c).title;
  find("#comparison-current-name").textContent = currentName;
  currentCanvas.setAttribute("aria-label", `ECG actual: ${currentName}`);

  function draw() {
    if (disposed) return;
    // A single explicit px/mm prevents independently fitting two morphologies
    // (or different row heights) from making their amplitudes incomparable.
    const width = Math.min(...sheets.map(sheet => sheet.clientWidth || root.clientWidth || 760));
    const geometry = paperLayout(c, width);
    const pxPerMm = Math.max(2.4, Math.min(width / geometry.widthMm, c.view.pxPerMm));
    renderPaper(currentCanvas, currentSignal, c, width, { pxPerMm, displayName: currentName, compactHeader: true });
    if (reference) renderPaper(referenceCanvas, reference, referenceCase, width, { pxPerMm, displayName: presetTitle(presetById(referenceCase.presetId)!), compactHeader: true });
  }

  const controller = new SignalController((signal, _measurement, id) => {
    if (disposed || id !== pendingId) return;
    reference = signal;
    referenceCanvas.hidden = false;
    referenceSheet.setAttribute("aria-busy", "false");
    status.textContent = "";
    status.hidden = true;
    draw();
  }, (message, id) => {
    if (disposed || id !== pendingId) return;
    referenceSheet.setAttribute("aria-busy", "false");
    status.textContent = message;
    status.hidden = false;
  });

  function chooseReference() {
    if (disposed) return;
    const next = comparisonCase(referenceSelect.value, c);
    if (!next) { referenceSelect.value = referenceCase.presetId; return; }
    referenceCase = next;
    reference = null;
    referenceCanvas.hidden = true;
    referenceSheet.setAttribute("aria-busy", "true");
    status.hidden = false;
    status.textContent = "Preparando referencia…";
    const title = presetTitle(presetById(next.presetId)!);
    find("#comparison-reference-name").textContent = title;
    referenceCanvas.setAttribute("aria-label", `ECG de referencia: ${title}`);
    const acquisition = find("#comparison-acquisition");
    acquisition.hidden = next.filter === c.filter && next.notch === c.notch;
    acquisition.textContent = acquisition.hidden ? "" : `Filtros distintos: ECG actual, ${filterLabel(c)}; referencia, ${filterLabel(next)}.`;
    pendingId = controller.request(next, Math.max(10, currentSignal.duration));
  }
  referenceSelect.addEventListener("change", chooseReference, { signal: abort.signal });
  sheets.forEach((sheet, i) => sheet.addEventListener("scroll", () => {
    const other = sheets[1 - i];
    if (Math.abs(other.scrollLeft - sheet.scrollLeft) > 1) other.scrollLeft = sheet.scrollLeft;
  }, { passive: true, signal: abort.signal }));
  const observer = new ResizeObserver(draw);
  sheets.forEach(sheet => observer.observe(sheet));
  draw();
  chooseReference();

  return () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    observer.disconnect();
    controller.dispose();
    root.closest("dialog")?.classList.remove("comparison-dialog");
  };
}
