import { applyTheme, currentTheme, readTheme } from "./ui/theme";
import { acquisitionDescription, readAcquisitionPreference, saveAcquisitionPreference } from "./ui/acquisition-preference";
import { aboutDialogHtml, keyboardHelpHtml } from "./ui/about-dialog";
import { regionalActivationControls } from "./ui/regional-activation";
import "./style.css";
import "./ui/reading-interactions.css";
import { findingTarget } from "./ui/reading-focus";
import { readingOverlay } from "./ui/reading-overlay";
import { mountLeadExplorer } from "./ui/lead-explorer";
import { presetTitle } from "./presets/nomenclature";
import { APP_VERSION } from "./ui/version";
import { catalogGroup, familyLabel } from "./ui/catalog-presentation";
import { lesionBaseline } from "./engine/lesion-baseline";
import { omiSheetHtml, omiReferencesHtml, structuredDescriptionHtml } from "./ui/omi-sheet";
import { structuredDescription, type DescriptionInfo, type StructuredDescription } from "./ui/structured-description";
import { descriptionInfoHtml, descriptionInfoTitle } from "./ui/description-info";
import { concealMetricCards, metricsHtml, modelMetricCards } from "./ui/metric-cards";
import { defaultZoomLead, mountStZoom, stZoomHtml } from "./ui/st-zoom";
import { mountStDistribution, stDistributionHtml } from "./ui/st-distribution";
import type { TeachingSnapshot } from "./ui/teaching-workspace";
import { signalFingerprint, teachingCaseIdentity, type TeachingNote } from "./ui/teaching-notes";
import { drawTeachingNotes, projectTeachingNote } from "./ui/teaching-export";
import { visiblePaperLeads } from "./render/paper-viewport";
import type { Lead } from "./engine/types";
import { openDialog, closeDialog } from "./ui/dialog";
import { exportDialogHtml } from "./ui/export-dialog";
import { handleExportAction } from "./ui/export-actions";
import { diagnosisForPreset } from "./ui/diagnosis-navigation";
import { catalogView, VariantNavigation } from "./ui/catalog-view";
import { WorkspaceNavigation } from "./ui/workspace-navigation";
import { createExplorationOrigin, explorationContextHtml, explorationChanges, restoreExplorationOrigin, type ExplorationOrigin } from "./ui/exploration-origin";
import {
  cloneCase,
  NATURAL_CONTROLS,
  type ECGCase,
  type NaturalControl,
  type Signal,
  type Measurement,
} from "./engine/types";
import { SignalController } from "./ui/signal-controller";
import { TraceSession } from "./ui/trace-session";
import { CaliperEditor } from "./ui/caliper-editor";
import { initialCaliper, placeCaliper, moveCaliper, segmentIndexAt, sheetPoint } from "./render/caliper-geometry";
import { practiceFeedback, type PracticeId } from "./ui/practice-feedback";
import { createPractice, answerPractice, type PracticeState } from "./ui/practice-session";
import { practicePanelHtml } from "./ui/practice-panel";
import { changeCase, isCaseControlKey, controlValue, keepsPractice, withInterfaceView } from "./ui/case-state";
import { representativeBeat } from "./ui/beat-selection";
import { measurementDialog } from "./ui/measurement-dialog";
import { auditMeasurement } from "./engine/analysis/model-audit";
import {
  PRESETS,
  fromPreset,
  presetById,
} from "./presets/catalog";
import {
  renderPaper,
  renderPaperSkeleton,
  renderRhythm,
  palettes,
  drawCaliper,
  Monitor,
  type Layout,
  type Caliper,
} from "./render/ecg";
import { icon, btn, esc, keepInView, select } from "./ui/helpers";
import { GAINS, SPEEDS, gainOptions, nextInCycle, speedOptions } from "./ui/view-scales";
import { syncPauseControl } from "./ui/pause-control";
import { controls, filterSelect, leadOptions, amplitudeControlState, tAxisControlState } from "./ui/controls";
import { caseContext, caseReading, normalizeImportedCase } from "./presets/case-context";
import { modelProvenance } from "./presets/model-provenance";
import { usesRealisticBase } from "./engine/realistic/scope";
import {
  decodeCase,
  savedCaseState,
  savedCaseAt,
} from "./ui/persistence";

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const session = new TraceSession();
const teachingNotes = new Map<string, TeachingNote[]>(), teachingSnapshots: TeachingSnapshot[] = [];
const teachingSignalKeys = new WeakMap<Signal, string>();
let teachingMarksVisible = true;
let teachingOpening = false;
let activeFinding: string | null = null;
function teachingKey(signal: Signal) {
  let key = teachingSignalKeys.get(signal);
  if (!key) { key = signalFingerprint(signal); teachingSignalKeys.set(signal, key); }
  return key + teachingCaseIdentity(c);
}
// Start on the sinus preset itself (textbook patient, resting HRV), not on the
// bare defaults it is built from.
let c = fromPreset(presetById("sinus")!),
  layout: Layout | null = null,
  paperAmplitudeMm: number | undefined,
  monitor: Monitor | null = null;
// Five seconds per lead makes the initial reading less fragmented. Imported
// cases keep their selected format, and catalog changes retain the current view.
c.view.format = "6x2";
c.acquisition = readAcquisitionPreference() ?? c.acquisition;
let stHighlight = false;
// The contrafactual remains inside the advanced Aula, never presented as a prior recording.
let previousSignal: Signal | null = null;
let annotations = false,
  caliper: Caliper | null = null,
  dragging = false,
  lastFrame = 0,
  audioOn = false,
  audioContext: AudioContext | null = null,
  lastBeep = -1;
let timer = 0,
  activePanel = "conduction",
  search = "",
  group = "",
  quiz: PracticeState | null = null;
let explorationOrigin: ExplorationOrigin | null = null;
let initialError = "";
try {
  const decoded = decodeCase(location.hash);
  if (decoded) c = withInterfaceView(decoded);
} catch (e) {
  initialError = (e as Error).message;
}
applyTheme(readTheme());
const root = $("#app");
root.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="ECG Lab, inicio">${icon("pulse")}<span>ECG<span class="brand-light">lab</span></span></a><nav aria-label="Herramientas"><button class="btn mobile-cases" data-action="catalog">${icon("menu")}<span>Casos</span></button>${btn("quiz", "Practicar", "quiz")}${btn("export", "Exportar", "download")}${btn("theme", "Tema", "sun", "icon-button")}</nav></header>
 <div class="app-layout"><aside class="sidebar" id="catalog"><div class="sidebar-head"><h2>Biblioteca de patrones</h2>${btn("close-catalog", "Cerrar", "close", "mobile-cases icon-button")}</div><label class="search-box">${icon("search")}<input id="case-search" type="search" placeholder="Patrón, sigla o palabra…" aria-label="Buscar caso"/></label><div class="catalog-result-bar"><span id="catalog-count" role="status" aria-live="polite"></span><button type="button" class="catalog-clear" data-action="clear-search" hidden>Limpiar filtros</button></div><div id="case-list" class="case-list"></div></aside>
 <main class="workspace"><section class="case-heading"><div><div class="case-category" id="case-category">RITMOS</div><h1 id="case-title">Ritmo sinusal</h1><p id="case-variant-title" class="case-variant-title" hidden></p><div id="exploration-context" class="exploration-context" hidden></div></div><div class="case-state">${btn("reset", "Restablecer", "reset", "subtle")}</div></section>
 <section id="diagnosis-navigation" class="diagnosis-navigation" aria-label="Variantes del patrón" hidden></section>
 <div id="diagnosis-content">
 <section id="metrics" class="metrics" aria-label="Valores del modelo que generó el ECG"><div class="loading-metrics">Generando señal…</div></section>
 <section class="trace-panel" aria-label="Trazado electrocardiográfico"><div class="trace-toolbar"><div class="view-tabs" role="tablist" aria-label="Vista del ECG"><button role="tab" data-mode="paper" aria-selected="true">${icon("grid")}12 derivaciones</button><button role="tab" data-mode="monitor" aria-selected="false">${icon("monitor")}Monitor</button><button role="tab" data-mode="rhythm" aria-selected="false">${icon("strip")}Tira de ritmo</button></div><div class="trace-tools">${btn("caliper", "Medir", "ruler")}${btn("compare", "Comparar", "strip")}${btn("pause", "Congelar", "pause")}<details class="paper-menu"><summary class="btn" data-action="paper">${icon("settings")}<span>Vista</span>${icon("chevron")}</summary><div class="view-options"><div class="scale-toolbar" id="scale-toolbar"></div><div class="view-overlays" aria-label="Ayudas visuales">${btn("annotations", "Marcar ondas", "eye")}${btn("lens-st", "Resaltar ST", "ruler")}${btn("teaching-marks", "Mostrar mis marcas", "eye")}${btn("teaching", "Aula: anotar y explorar", "book")}</div></div></details></div></div>
 <div id="quiz-panel" hidden></div><div id="caliper-editor" class="caliper-editor" hidden></div><div class="monitor-vitals" id="monitor-vitals" hidden><div><span>FRECUENCIA VENTRICULAR</span><strong id="monitor-rate">72</strong><small id="monitor-rate-note">No estimable</small></div><div class="monitor-controls">${btn("sound", "Sonido", "volume")}<span id="monitor-state">REPRODUCCIÓN</span></div></div>
 <p class="sr-only" id="trace-context" hidden></p><div class="canvas-scroll" id="canvas-wrap"><canvas id="ecg" tabindex="0" aria-describedby="trace-context trace-keyboard-help" role="img" aria-label="ECG sintético de 12 derivaciones"></canvas><div class="signal-loading" id="signal-loading" aria-live="polite">Calculando señal…</div></div><p class="trace-scroll-hint" id="trace-scroll-hint" hidden>Desliza para ver el trazado completo.</p>
 <div id="measurement-readout" class="caliper-readout" hidden><output id="measurement-values" role="status" aria-live="polite" aria-atomic="true"></output><button type="button" data-action="clear-caliper">Limpiar</button></div><p id="trace-keyboard-help" class="sr-only">Con foco en el trazado: M, P y R cambian la vista; V y G, la escala; C activa los calibres y espacio congela el monitor. Con calibres, las flechas mueven el extremo seleccionado; Mayús mueve diez pasos. Pulsa ? para abrir la ayuda de atajos.</p></section>
 </div>
 <section class="reading-guide" aria-labelledby="finding-title"><div class="guide-main"><h2 id="finding-title">Qué observar</h2><p id="case-subtitle" class="guide-lead">Activación auricular sinusal seguida de conducción AV 1:1.</p><ul id="findings"></ul><details id="reading-details"><summary>Lectura paso a paso</summary><div class="reading-detail-content"><div id="structured-description"></div><div id="omi-sheet"></div></div></details></div></section>
 <details id="adjust" class="adjust-panel"><summary><span>Ajustar el caso</span><small>Parámetros del modelo</small></summary><div id="inspector" class="inspector"></div></details>
 <footer class="workspace-footer"><button class="text-button" data-action="about">Información y fuentes ${icon("chevron")}</button><span>Uso educativo · sin validación clínica · <span data-product-version="${APP_VERSION}">v${APP_VERSION}</span></span></footer></main></div>
 <dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><input type="file" id="file-input" accept=".json,application/json" hidden/>`;

const variantNavigation = new VariantNavigation($("#diagnosis-navigation"), $("#diagnosis-content"));
$("#canvas-wrap").insertAdjacentHTML("beforeend", '<div id="reading-overlay" hidden></div>');
$("#canvas-wrap").insertAdjacentHTML("beforebegin", '<div id="finding-focus" hidden><div><strong></strong><p role="status" aria-live="polite"></p></div><button type="button" class="btn" data-action="clear-finding" aria-label="Quitar explicación">Cerrar</button></div>');
const caliperEditor = new CaliperEditor($("#caliper-editor"), $<HTMLCanvasElement>("#ecg"), next => { caliper = next; draw(); });
let toastTimer = 0;
function clearToast() {
  window.clearTimeout(toastTimer);
  $("#toast").classList.remove("visible");
  $("#toast").textContent = "";
}
function toast(message: string) {
  clearToast();
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = window.setTimeout(clearToast, 3500);
}
const workspaceNavigation = new WorkspaceNavigation($("#catalog"), $<HTMLElement>("#inspector"), {
  about: showAbout,
  measurements: showMeasurements,
  export: exportDialog,
  "close-dialog": closeDialog,
});

if (!location.hash) { const p=presetById(c.presetId); if(p) explorationOrigin=createExplorationOrigin(p,c); }
function currentPreset() {
  return caseContext(c).preset;
}
/** Library families the reader opened (the family of the case shown opens by itself). */
const openFamilies = new Set<string>();
// The paper menu closes on a click outside it or on Escape.
document.addEventListener("click", (e) => {
  const menu = document.querySelector<HTMLDetailsElement>(".paper-menu[open]");
  if (menu && !menu.contains(e.target as Node)) menu.open = false;
});
document.addEventListener("keydown", (e) => {
  const menu = document.querySelector<HTMLDetailsElement>(".paper-menu[open]");
  if (e.key === "Escape" && menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
});
// From the reader's click, not the toggle event: re-rendered open families also fire it.
document.addEventListener("click", (e) => {
  const family = (e.target as Element).closest(".case-group > summary")?.parentElement as HTMLDetailsElement | undefined;
  if (!family || search) return;
  if (family.open) openFamilies.delete(family.dataset.family!); else openFamilies.add(family.dataset.family!);
});
function renderCatalog() {
  const view = catalogView(PRESETS, search, group, currentPreset()?.id, openFamilies);
  $("#catalog-count").textContent = view.count;
  $("[data-action=clear-search]").hidden = !view.clearFiltersVisible;
  $("#case-list").innerHTML = view.html;
  // The result count only matters while searching.
  $(".catalog-result-bar").hidden = !view.clearFiltersVisible;
}
function formatExplorationValue(value:unknown){if(typeof value==="boolean")return value?"Sí":"No";return value==null?"—":String(value)}
function renderExplorationContext(concealed:boolean) {
  const root=$("#exploration-context"), changes=explorationOrigin?explorationChanges(explorationOrigin,c):[];
  const custom=!!explorationOrigin && changes.length>0 && !concealed;
  const open=root.querySelector("details")?.open ?? false;
  root.hidden=!custom;
  root.innerHTML=custom ? explorationContextHtml(explorationOrigin!,changes,open) : "";
}

function showExplorationChanges(){if(!explorationOrigin)return;const changes=explorationChanges(explorationOrigin,c);openDialog("Cambios respecto al origen",`<p class="dialog-lead">Origen: <strong>${esc(explorationOrigin.presetName)}</strong>. Se muestran diferencias reales del modelo; la vista no cuenta como ajuste.</p><div class="measurement-table-wrap"><table><thead><tr><th>Parámetro</th><th>Origen</th><th>Actual</th></tr></thead><tbody>${changes.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(formatExplorationValue(x.before))}${x.beforeLabel?`<br><small>${esc(x.beforeLabel)}</small>`:""}</td><td>${esc(formatExplorationValue(x.after))}${x.afterLabel?`<br><small>${esc(x.afterLabel)}</small>`:""}</td></tr>`).join("")}</tbody></table></div><p class="control-note">Una acción puede cambiar varios parámetros coordinados; el recuento describe diferencias del estado resultante, no el número de clics.</p>`)}
/** The description is read from the signal shown: empty while a new one is computed. */
let description: StructuredDescription | null = null;
function renderDescription() {
  const concealed = quiz && !quiz.answer;
  const preset = caseContext(c).preset;
  description = !concealed && session.signal ? structuredDescription(c, session.signal, preset && !c.artifacts.reversed ? caseReading(c).title : undefined) : null;
  $("#structured-description").innerHTML = description ? structuredDescriptionHtml(description, true, true) : "";
  $("#reading-details").hidden = !description;
}
function renderInfo() {
  const context = caseContext(c),
    reading = caseReading(c, context),
    p = context.preset,
    concealed = quiz && !quiz.answer;
  const diagnosis = p && !c.artifacts.reversed ? diagnosisForPreset(p) : undefined;
  const grouped = diagnosis && diagnosis.variants.length > 1;
  const customExploration=!!explorationOrigin&&explorationChanges(explorationOrigin,c).length>0&&!concealed;
  $("#case-title").textContent = concealed ? "Interpreta este ECG" : customExploration ? "Exploración personalizada" : grouped ? diagnosis.title : reading.title;
  $("#case-variant-title").hidden = !!concealed || !grouped || (p ? presetTitle(p) : "") === diagnosis?.title;
  $("#case-variant-title").textContent = !concealed && grouped ? presetTitle(p!) : "";
  variantNavigation.update(p, !!concealed, c.artifacts.reversed);
  $("#case-category").textContent = concealed
    ? "PRÁCTICA"
    : customExploration ? "EXPLORACIÓN"
    : p ? familyLabel(catalogGroup(p)) : "Caso personalizado";
  $("#case-subtitle").textContent = concealed
    ? "Identifica el patrón. Puedes cambiar la vista y utilizar los calibres."
    : customExploration ? "Interpreta la señal actual; el origen solo indica procedencia." : reading.subtitle;
  renderExplorationContext(!!concealed);
  $("#finding-title").textContent = concealed
    ? "Análisis sistemático"
    : "Qué observar";
  $("#findings").innerHTML = (
    concealed
      ? [
          "Frecuencia y regularidad",
          "Actividad auricular y relación AV",
          "QRS, eje y repolarización",
        ]
      : reading.findings
  )
    .map((f) => `<li>${!concealed && !c.artifacts.reversed && session.canExport && findingTarget(f) ? `<button type="button" class="finding-button" data-finding="${esc(f)}" aria-pressed="${activeFinding === f}" aria-controls="finding-focus">${esc(f)}</button>` : esc(f)}</li>`)
    .join("");
  // OMI families (A3): case sheet with expert notes and support; and, for any case,
  // the structured description read from the trace shown.
  // With reversed arm electrodes the trace no longer shows the sheet's picture.
  $("#omi-sheet").innerHTML = !concealed && p && !customExploration && !c.artifacts.reversed ? omiSheetHtml(p.id, false, false) : "";
  renderDescription();
  $<HTMLButtonElement>('[data-action="reset"]').hidden = !!concealed || (!!explorationOrigin && !customExploration);
  $<HTMLButtonElement>('[data-action="export"]').disabled = !!concealed;
  $("#adjust").hidden = !!concealed;
  $(".case-state").hidden = $<HTMLButtonElement>('[data-action="reset"]').hidden;
  $("#catalog").classList.toggle("quiz-concealed", !!concealed);
}
function renderMetrics() {
  if (!session.signal || !session.measurement) return;
  // The simulator knows what it generated: show the model's values. The frozen
  // sample analyzer remains an independent estimate inside «Medidas».
  const concealed = !!quiz && !quiz.answer, model = modelMetricCards(c, session.signal);
  const cards = concealed ? concealMetricCards(model) : model, rate = cards[0];
  $("#metrics").innerHTML = metricsHtml(cards);
  $("#metrics").toggleAttribute("data-concealed", concealed);
  $("#monitor-rate").textContent = rate.value === "—" ? "—" : rate.value.replace(/<small>.*<\/small>/, "");
  $("#monitor-rate-note").textContent = concealed ? "oculto en práctica" : rate.value === "—" ? "No estimable" : "lpm · modelo";
}
function renderControls() {
  const previous = activePanel;
  const inspector = $("#inspector");
  const focused = inspector.contains(document.activeElement)
    ? (document.activeElement as HTMLElement).dataset.key : undefined;
  const openGroups = Array.from(inspector.querySelectorAll<HTMLDetailsElement>("details[data-control-details][open]"))
    .map(el => el.dataset.controlDetails);
  inspector.innerHTML = controls(c);
  for (const group of inspector.querySelectorAll<HTMLDetailsElement>("details[data-control-details]")) {
    group.open = openGroups.includes(group.dataset.controlDetails);
  }
  setPanel(previous);
  hideInactiveControls();
  if (focused) {
    const field = Array.from(inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]"))
      .find(el => el.dataset.key === focused);
    if (field && !field.disabled) field.focus({ preventScroll: true });
  }
  renderScales();
}
/** Controls with no effect in the current rhythm or pattern are not shown (their
 * value is kept for other rhythms); so are their notes. */
function hideInactiveControls() {
  for (const field of $("#inspector").querySelectorAll<HTMLElement>(".range-field, .field")) {
    const input = field.querySelector<HTMLInputElement | HTMLSelectElement>("[data-key]");
    if (input) field.hidden = input.disabled;
  }
  // A panel left without any control says so instead of looking empty.
  for (const panel of $("#inspector").querySelectorAll<HTMLElement>("[data-control-panel]")) {
    const any = [...panel.querySelectorAll<HTMLElement>(".range-field, .field, .toggle")].some((f) => !f.hidden && !f.closest(".inactive-controls, #regional-activation-controls[hidden]"));
    let note = panel.querySelector<HTMLElement>(".controls-empty");
    if (!any && !note) { note = document.createElement("p"); note.className = "control-note controls-empty"; note.textContent = "Ningún control de esta pestaña actúa en este ritmo."; panel.prepend(note); }
    if (note) note.hidden = any;
  }
  const tAxis = document.querySelector<HTMLInputElement>('[data-key="tAxis"]');
  const tNote = document.querySelector<HTMLElement>("#t-axis-note");
  if (tAxis && tNote) tNote.hidden = tAxis.disabled;
}
function syncAmplitudeControls() {
  const state = amplitudeControlState(c);
  $<HTMLInputElement>('[data-key="st"]').disabled = state.stDisabled;
  $<HTMLInputElement>('[data-key="tAmp"]').disabled = state.tDisabled;
  $("#amplitude-note").textContent = state.note;
  const direction = tAxisControlState(c);
  $<HTMLInputElement>('[data-key="tAxis"]').disabled = direction.disabled;
  $("#t-axis-note").textContent = direction.reason;
  $("#regional-activation-controls").innerHTML = regionalActivationControls(c);
  hideInactiveControls();
}
function setPanel(name: string) {
  activePanel = name;
  document
    .querySelectorAll<HTMLElement>("[data-control-panel]")
    .forEach((el) => (el.hidden = el.dataset.controlPanel !== name));
  document
    .querySelectorAll<HTMLElement>("[data-panel]")
    .forEach((el) =>
      el.setAttribute("aria-selected", String(el.dataset.panel === name)),
    );
}
function renderScales() {
  const paper = c.view.mode === "paper",
    monitorMode = c.view.mode === "monitor",
    toolbar = $("#scale-toolbar"),
    focused = toolbar.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.key : undefined;
  toolbar.innerHTML = `${select(
    "view.speed",
    "Velocidad",
    speedOptions,
    c.view.speed,
  )}${select(
    "view.gain",
    "Ganancia",
    gainOptions,
    c.view.gain,
  )}${
    paper
      ? select(
          "view.format",
          "Formato",
          [
            ["3x4", "3 × 4"],
            ["3x4+1", "Compacto · 3 × 4 + ritmo II"],
            ["3x4+3", "3 × 4 + 3 tiras"],
            ["6x2", "5 s por derivación · 6 × 2"],
            ["12x1", "10 s por derivación · 12 × 1"],
          ],
          c.view.format,
        )
      : leadOptions(c)
  }${
    c.view.mode === "rhythm"
      ? select(
          "view.duration",
          "Duración",
          [
            [30, "30 segundos"],
            [60, "60 segundos"],
          ],
          c.view.duration,
        )
      : ""
  }<div class="scale-toggles"><label class="toggle"><input type="checkbox" data-key="view.grid" ${c.view.grid ? "checked" : ""}/>Grilla</label></div>${select("acquisition", "Señal", [["ideal", "Limpia"], ["realistic", "Con ruido de fondo"]], c.acquisition ?? "realistic")}${filterSelect(c)}`;
  document
    .querySelectorAll("[data-mode]")
    .forEach((el) =>
      el.setAttribute(
        "aria-selected",
        String((el as HTMLElement).dataset.mode === c.view.mode),
      ),
    );
  if (focused) toolbar.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus({ preventScroll: true });
  $("#monitor-vitals").hidden = !monitorMode;
  syncTraceTools();
}
/** Project every visible tool state from the same mode, availability and flags. */
function syncTraceTools() {
  const ready = session.canExport,
    monitorMode = c.view.mode === "monitor",
    paper = c.view.mode === "paper",
    measuring = ready && !monitorMode && session.caliperOn;
  const pause = $<HTMLButtonElement>('[data-action="pause"]');
  syncPauseControl(pause, session.paused, monitorMode && ready);
  // Tools that do not apply to this view or case are hidden, not greyed out.
  pause.hidden = !monitorMode;
  $("#monitor-state").textContent = !ready ? "SIN SEÑAL" : session.paused ? "CONGELADO" : "REPRODUCCIÓN";
  const waves = $<HTMLButtonElement>('[data-action="annotations"]');
  waves.disabled = !paper || !ready;
  waves.hidden = !paper;
  waves.classList.toggle("active", ready && paper && annotations);
  waves.setAttribute("aria-pressed", String(ready && paper && annotations));
  const practice = !!quiz && !quiz.answer;
  const teaching = $<HTMLButtonElement>('[data-action="teaching"]');
  teaching.disabled = !ready || practice;
  teaching.hidden = practice;
  const compare = $<HTMLButtonElement>('[data-action="compare"]');
  compare.disabled = !ready || practice;
  compare.hidden = practice;
  const marks = $<HTMLButtonElement>('[data-action="teaching-marks"]');
  marks.hidden = !ready || practice || !paper || !session.signal || !teachingNotes.get(teachingKey(session.signal))?.length;
  marks.setAttribute("aria-pressed", String(teachingMarksVisible));
  const st = $<HTMLButtonElement>('[data-action="lens-st"]');
  st.disabled = !paper || !ready || practice;
  st.hidden = !paper || practice;
  st.setAttribute("aria-pressed", String(ready && paper && !practice && stHighlight));
  st.classList.toggle("active", ready && paper && !practice && stHighlight);
  $('[data-action="theme"]').setAttribute("aria-pressed", String(currentTheme() === "dark"));
  const caliperButton = $<HTMLButtonElement>('[data-action="caliper"]');
  caliperButton.disabled = monitorMode || !ready;
  caliperButton.hidden = monitorMode;
  caliperButton.classList.toggle("active", measuring);
  caliperButton.setAttribute("aria-pressed", String(measuring));
  $("#ecg").classList.toggle("measuring", measuring);
  caliperButton.title = monitorMode
    ? "Calibres disponibles en papel y tira de ritmo"
    : "Calibres por arrastre, teclado o campos numéricos";
  caliperEditor.update({active:measuring, layout, caliper, view:c.view, fs:session.signal?.fs ?? 500});
}
/** Both normal generation and a validated alternative publish the same worker bytes. */
function publishSignal(next: Signal, measured: Measurement, requestId: number, candidate?: ECGCase) {
    if (!candidate && !session.isCurrentRequest(requestId)) return;
    const audited = auditMeasurement(next, measured);
    if (candidate) {
      c = cloneCase(candidate); annotations = false;
      session.expectRequest(requestId);
      clearToast(); renderCatalog(); renderControls();
    }
    if (!session.accept(requestId, next, audited, c.view.mode,
      representativeBeat(audited, visibleSegmentEnd()))) return;
    resetTracePresentation();
    $("#signal-loading").hidden = true;
    renderMetrics();
    syncNaturalAxes(next);
    renderQuiz();
    renderInfo();
    renderScales();
    draw();
}
const controller = new SignalController(
  (next, measured, requestId, previous) => {
    if (session.isCurrentRequest(requestId)) previousSignal = previous ?? null;
    publishSignal(next, measured, requestId);
  },
  (message, requestId) => {
    if (!session.fail(requestId)) return;
    // The persistent live region below carries the error. A duplicate long
    // toast can cover that explanation on mobile and announce it twice.
    clearToast();
    showUnavailableSignal(message, true);
    $("#metrics").innerHTML =
      '<div class="loading-metrics">Medidas no disponibles</div>';
    renderInfo();
  },
);
/** Render caches and pointer coordinates are presentation, not session validity. */
function resetTracePresentation() {
  activeFinding = null;
  $("#reading-overlay").replaceChildren();
  delete $("#reading-overlay").dataset.geometry;
  $("#reading-overlay").hidden = true;
  $("#finding-focus").hidden = true;
  $(".trace-panel").classList.remove("reading-focused");
  layout = null;
  monitor = null;
  caliper = null;
  dragging = false;
  lastFrame = 0;
}
function showUnavailableSignal(message: string, unavailable = false) {
  resetTracePresentation();
  const canvas = $<HTMLCanvasElement>("#ecg");
  if (!unavailable && c.view.mode === "paper") {
    c.view.palette = currentTheme() === "dark" ? "dark" : "paper";
    renderPaperSkeleton(canvas, c, $("#canvas-wrap").clientWidth, undefined, paperAmplitudeMm);
  } else canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.setAttribute("aria-label", "Señal no disponible");
  const loading = $("#signal-loading");
  loading.classList.toggle("signal-unavailable", unavailable);
  if (unavailable) {
    const text = document.createElement("p");
    text.textContent = message;
    loading.replaceChildren(text);
  } else loading.textContent = message;
  loading.hidden = false;
  $("#metrics").innerHTML = '<div class="loading-metrics">Generando señal…</div>';
  $("#monitor-rate").textContent = "—";
  $("#monitor-rate-note").textContent = "No estimable";
  $("#measurement-readout").hidden = true;
  $("#trace-scroll-hint").hidden = true;
  syncTraceTools();
}
function invalidateSignal() {
  clearToast();
  session.invalidate();
  renderDescription();
  renderQuiz();
  showUnavailableSignal("Calculando señal…");
}
function generate() {
  window.clearTimeout(timer);
  timer = 0;
  invalidateSignal();
  // Worker messages are asynchronous; register the returned ID before delivery.
  previousSignal = null;
  session.expectRequest(controller.request(c, 65));
}
/** Preserve native paper scale; describe horizontal overflow without fading the trace. */
const syncTraceOverflow = () => {
  const wrap = $("#canvas-wrap");
  const more = wrap.scrollWidth > wrap.clientWidth + 2;
  wrap.toggleAttribute("data-more-right", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2);
  const context = $("#trace-context");
  $("#trace-scroll-hint").hidden = !layout || c.view.mode === "monitor" || !more;
  context.hidden = !layout || c.view.mode === "monitor";
  if (layout && c.view.mode !== "monitor") {
    const leads = visiblePaperLeads(layout, wrap.scrollLeft, wrap.clientWidth).join(", ");
    const timing = c.view.mode === "paper" ? (c.view.timing === "simultaneous" ? "columnas simultáneas" : "columnas secuenciales") : "tira de ritmo";
    context.textContent = `${leads} · ${c.view.speed} mm/s · ${c.view.gain} mm/mV${c.view.chestGain !== c.view.gain ? ` (precordiales ${c.view.chestGain})` : ""} · ${timing}${more ? c.view.mode === "paper" ? " · Desplaza para ver más derivaciones." : " · Desplaza para recorrer el trazado." : ""}`;
  }
};
function draw() {
  c.view.palette = currentTheme() === "dark" ? "dark" : "paper";
  syncTraceTools();
  if (!session.signal) return;
  const canvas = $<HTMLCanvasElement>("#ecg"),
    width = $("#canvas-wrap").clientWidth;
  canvas.setAttribute(
    "aria-label",
    `ECG sintético, ${c.view.mode === "paper" ? "12 derivaciones" : c.view.lead}, ${quiz && !quiz.answer ? "caso de práctica" : caseReading(c).title}`,
  );
  if (c.view.mode === "paper") {
    monitor = null;
    const practice = !!quiz && !quiz.answer;
    layout = renderPaper(canvas, session.signal, c, width, {
      compactHeader: true,
      annotations,
      measurement: session.measurement ?? undefined,
      selectedBeat: session.selectedBeat,
      hideName: practice,
      displayName: caseReading(c).title,
      stLens: stHighlight && !practice,
      // Fit the available width uniformly. Long sheets continue down the page,
      // rather than shrinking labels and the calibrated trace to viewport height.
    });
    paperAmplitudeMm = layout.amplitudeMm;
  } else if (c.view.mode === "rhythm") {
    monitor = null;
    layout = renderRhythm(canvas, session.signal, c, width);
  } else {
    monitor = new Monitor(canvas, session.signal, c, width);
    layout = monitor.layout;
    monitor.frame(session.elapsed);
  }
  $("#canvas-wrap").classList.toggle(
    "monitor-canvas",
    c.view.mode === "monitor",
  );
  if (caliper && layout && session.caliperOn) drawCaliper(canvas, layout, caliper, c);
  syncTraceOverflow();
  if (layout && c.view.mode === "paper" && !(quiz && !quiz.answer) && teachingMarksVisible) {
    const all = teachingNotes.get(teachingKey(session.signal)) ?? [];
    const visible = all.filter(n => layout!.segments.some(segment => projectTeachingNote(n, segment, c.view)));
    if (visible.length) {
      const ctx = canvas.getContext("2d")!, scale = canvas.width / layout.widthMm;
      ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0); drawTeachingNotes(ctx, layout, c.view, visible, visible.map(n => all.indexOf(n) + 1)); ctx.restore();
    }
    if (all.length) $("#trace-context").textContent += ` · ${visible.length}/${all.length} marcas personales visibles; abre Aula ECG para verlas todas.`;
  }
  caliperEditor.update({active:session.caliperOn, layout, caliper, view:c.view, fs:session.signal.fs});
  syncReadingAids();
}
function syncReadingAids() {
  if (!layout || !session.signal) return;
  const available = c.view.mode === "paper" && session.canExport && !(quiz && !quiz.answer) && !session.caliperOn;
  if (!available) activeFinding = null;
  const overlay = $("#reading-overlay");
  const boxes = readingOverlay(overlay, session.signal, layout, c, activeFinding, available);
  overlay.style.left = `${$<HTMLCanvasElement>("#ecg").offsetLeft}px`;
  const note = $("#finding-focus"); note.hidden = !activeFinding;
  $(".trace-panel").classList.toggle("reading-focused", !!activeFinding);
  if (activeFinding) {
    note.querySelector("strong")!.textContent = activeFinding;
    const explanation = note.querySelector("p")!;
    explanation.textContent = boxes.length ? "" : "No hay un fragmento completo disponible para marcar este hallazgo.";
    explanation.hidden = !!boxes.length;
  }
  document.querySelectorAll<HTMLButtonElement>("[data-finding]").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.finding === activeFinding)));
  return boxes;
}
function openLeadDetail(segment: number, time?: number, opener?: HTMLElement) {
  if (!layout || !session.signal || !session.canExport || c.view.mode !== "paper" || session.caliperOn || (quiz && !quiz.answer)) return;
  const seg = layout.segments[segment]; if (!seg) return;
  const returnTo = opener ?? $<HTMLCanvasElement>("#ecg"), dialog = $<HTMLDialogElement>("#dialog");
  openDialog(`Explorar ${seg.polarity < 0 ? "−" : ""}${seg.lead}`, '<div id="lead-explorer"></div>');
  dialog.classList.add("lead-dialog"); dialog.setAttribute("aria-label", "Explorar una derivación"); dialog.setAttribute("closedby", "any");
  mountLeadExplorer($("#lead-explorer"), session.signal, c, seg, time);
  const fallbackDismiss = (e: MouseEvent) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  };
  if (!("closedBy" in HTMLDialogElement.prototype)) dialog.addEventListener("click", fallbackDismiss);
  dialog.addEventListener("close", () => {
    dialog.classList.remove("lead-dialog"); dialog.removeAttribute("aria-label"); dialog.removeAttribute("closedby");
    dialog.removeEventListener("click", fallbackDismiss);
    if (returnTo.isConnected) returnTo.focus({preventScroll:true});
  }, {once:true});
  $("#dialog-content [data-action=close-dialog]").focus();
}
function animate(t: number) {
  if (c.view.mode === "monitor" && monitor && !session.paused) {
    if (lastFrame) session.advance(Math.min(0.1, (t - lastFrame) / 1000), c.view.mode);
    monitor.frame(session.elapsed);
    if (audioOn && session.signal) {
      const source = monitor.sourceTime(session.elapsed);
      const b = session.signal.events.beats.find(
        (b) => b.time >= source - 0.022 && b.time <= source + 0.008,
      );
      if (b && b.time !== lastBeep) {
        lastBeep = b.time;
        beep();
      }
    }
  }
  lastFrame = t;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
function beep() {
  if (!audioContext) return;
  const o = audioContext.createOscillator(),
    g = audioContext.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.035, audioContext.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.065);
  o.connect(g);
  g.connect(audioContext.destination);
  o.start();
  o.stop(audioContext.currentTime + 0.07);
}
function selectPreset(id: string) {
  const p = presetById(id);
  if (!p || p.strategy === "pending") return;
  const acquisition = c.acquisition;
  c = fromPreset(p, c.view);
  c.acquisition = acquisition;
  explorationOrigin=createExplorationOrigin(p,c);
  caliper = null;
  session.resetTools();
  annotations = false;
  renderCatalog();
  renderControls();
  renderInfo();
  generate();
  $("#catalog").classList.remove("open");
}
function setValue(key: string, value: unknown) {
  if (!isCaseControlKey(key)) return;
  if (quiz && !keepsPractice(key)) { quiz = null; renderQuiz(); renderInfo(); }
  if (key.startsWith("view.")) caliper = null;
  c = changeCase(c, key, value);
  if (session.measurement && (key === "view.timing" || key === "view.format"))
    session.selectBeat(representativeBeat(session.measurement, visibleSegmentEnd()));
  if (!key.startsWith("view.")) { renderCatalog(); renderInfo(); }
  else renderDescription();
}
/** Natural P/T axes: show the patient's actual axis on the slider until it is moved. */
function syncNaturalAxes(s: Signal) {
  for (const key of ["pAxis", "tAxis"] as const) {
    const value = s.truth[key];
    if (value === undefined) continue;
    const shown = Math.round(value / 5) * 5;
    const input = document.querySelector<HTMLInputElement>(`input[data-key="${key}"]`);
    const output = document.querySelector(`[data-output="${key}"]`);
    if (input) input.value = String(shown);
    if (output) output.innerHTML = `${shown} <small>°</small>`;
  }
}
function visibleSegmentEnd(): number {
  if (c.view.mode !== "paper" || c.view.timing !== "simultaneous")
    return Infinity;
  return c.view.format === "12x1" ? 10 : c.view.format === "6x2" ? 5 : 2.5;
}
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "case-search") {
    search = el.value.toLocaleLowerCase("es");
    renderCatalog();
    return;
  }
  const key = el.dataset.key;
  if (!key || el.type !== "range") return;
  const before = c;
  setValue(key, Number(el.value));
  // Moving a slider fixes it: drop the "natural" hint without re-rendering.
  const text = el.closest("label")?.querySelector("span")?.firstChild;
  if (text?.nodeType === Node.TEXT_NODE) text.textContent = (text.textContent ?? "").replace(" (natural del paciente)", "");
  // Controls that still follow the patient may change with it (F2.3: e.g. the
  // precordial rotation picks the person): refresh their sliders in place.
  for (const k of Object.keys(NATURAL_CONTROLS) as NaturalControl[]) {
    if (k === key || c[k] === before[k]) continue;
    const slider = document.querySelector<HTMLInputElement>(`input[type=range][data-key="${k}"]`), out = document.querySelector(`[data-output="${k}"]`);
    if (slider) slider.value = String(c[k]);
    if (out) out.innerHTML = `${c[k]} <small>${out.querySelector("small")?.textContent || ""}</small>`;
  }
  if (!key.startsWith("view.")) syncAmplitudeControls();
  const output = document.querySelector(`[data-output="${key}"]`);
  if (output)
    output.innerHTML = `${el.value} <small>${output.querySelector("small")?.textContent || ""}</small>`;
  if (key.startsWith("view.")) {
    draw();
  } else {
    invalidateSignal();
    window.clearTimeout(timer);
    timer = window.setTimeout(generate, 130);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const key = el.dataset.key;
  if (!key) return;
  if ((el as HTMLInputElement).type === "range") return;
  if (!isCaseControlKey(key)) return;
  const value = controlValue(
    c,
    key,
    el instanceof HTMLInputElement && el.type === "checkbox"
      ? el.checked
      : el.value,
  );
  setValue(key, value);
  if (key === "acquisition") saveAcquisitionPreference(c.acquisition ?? "realistic");
  renderControls();
  renderInfo();
  if (key.startsWith("view.")) {
    // Same trace: the sliders keep showing the patient's natural P/T axes.
    if (session.signal) syncNaturalAxes(session.signal);
    caliper = null;
    draw();
  } else generate();
});
$("#case-search").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Escape") {
    $<HTMLInputElement>("#case-search").value = "";
    search = "";
    renderCatalog();
  }
});

function showMeasurements() {
  if (session.signal && session.measurement) showAbout(true);
  else
    toast("Las medidas estarán disponibles al generar correctamente la señal.");
}
function showAbout(showAnalyzer = false) {
  const concealed = !!quiz && !quiz.answer, p = currentPreset();
  let caseInfo = "";
  if (!concealed) {
    const provenance = modelProvenance(c, p);
    const warnings = [...caseContext(c).warnings, ...(session.signal?.warnings ?? [])];
    if (c.rhythm === "af") warnings.push(usesRealisticBase(c)
      ? "FA aprendida de PTB-XL: intervalos RR independientes (gamma, CV 0,10–0,35 según la semilla). No simula memoria del nodo AV ni cambios de organización de las ondas f; la FC programada es una media de largo plazo."
      : "FA representativa: intervalos RR independientes (gamma, CV 0,22). No simula memoria del nodo AV ni toda la variabilidad entre pacientes; la FC programada es una media de largo plazo.");
    caseInfo = `<details class="information-section"><summary>El ECG actual: origen y límites</summary><p>${esc(acquisitionDescription(c))}</p><div class="model-note"><p>${esc(provenance.summary)}</p><p>${esc(provenance.evidence)}</p>${provenance.limitations.map(limit => `<p>${esc(limit)}</p>`).join("")}</div>${warnings.map(w => `<p class="warning">${esc(w)}</p>`).join("")}${p ? omiReferencesHtml(p.id) : ""}</details>`;
    if (session.signal && session.measurement) caseInfo += `<details class="information-section" id="analyzer-info"${showAnalyzer ? " open" : ""}><summary>Medidas del analizador</summary>${measurementDialog(session.signal, session.measurement, c)}</details>`;
  }
  openDialog(
    "Información y fuentes",
    `<div class="information-content">${caseInfo}${aboutDialogHtml()}</div>`,
  );
  if (showAnalyzer) $("#analyzer-info")?.scrollIntoView({ block: "start" });
}
let savedCaseSnapshot: ECGCase[] = [];
function exportDialog() {
  const stored = savedCaseState();
  savedCaseSnapshot = stored.cases;
  openDialog(
    "Exportar y guardar",
    exportDialogHtml(c, session.canExport, savedCaseSnapshot, stored.warning),
  );
}
function renderQuiz() {
  renderMetrics();
  const panel = $("#quiz-panel");
  panel.hidden = !quiz;
  if (!quiz) return;
  const q = quiz, feedback = q.answer ? practiceFeedback(q.preset.id as PracticeId, c, session.signal, session.measurement) : null;
  panel.innerHTML = practicePanelHtml(q, session.canExport, feedback);
}
function startQuiz() {
  const rng = new Uint32Array(2);
  crypto.getRandomValues(rng);
  quiz = createPractice(Array.from(rng));
  selectPreset(quiz.preset.id);
  renderQuiz();
  renderInfo();
  $("#quiz-panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function leavePractice() {
  quiz = null;
  renderQuiz();
}
/** A whole case from outside the catalog (saved, imported file or shared link). */
function openCase(next: ECGCase) {
  c = withInterfaceView(next);
  explorationOrigin = null;
  leavePractice();
  renderCatalog();
  renderControls();
  renderInfo();
  generate();
}
/** Back to the preset the exploration started from, keeping the current view. */
function restoreOrigin(origin: ExplorationOrigin) {
  c = restoreExplorationOrigin(origin, c);
  caliper = null;
  session.resetTools();
  annotations = false;
  renderCatalog();
  renderControls();
  renderInfo();
  generate();
  toast("Origen restaurado; se conserva la vista actual.");
}
/** Buttons ([data-action]) owned here; workspace navigation and export have their own. */
/** Magnified beat for reading J and the ST by hand (not during practice). */
function openStZoom(lead?: Lead, beat?: number) {
  if (!session.signal || (quiz && !quiz.answer)) return;
  const chosen = lead ?? defaultZoomLead(session.signal);
  openDialog("ST ampliado: punto J y medición manual", stZoomHtml(chosen));
  mountStZoom($("#dialog-content .st-zoom"), session.signal, chosen, palettes[currentTheme() === "dark" ? "dark" : "paper"], beat);
  $("#dialog-content [data-action=close-dialog]").focus();
}
function openStDistribution(lead?: Lead, beat?: number) {
  if (!session.signal || (quiz && !quiz.answer)) return;
  openDialog("Distribución del ST: derivaciones y orientación", stDistributionHtml());
  mountStDistribution($("#dialog-content .st-distribution"), session.signal, c.artifacts.reversed, openStZoom, { lead, beat });
  $("#dialog-content [data-action=close-dialog]").focus();
}
let comparisonOpening = false;
async function openComparison() {
  if (comparisonOpening || !session.signal || !session.canExport || (quiz && !quiz.answer)) return;
  const signal = session.signal, ecg = cloneCase(c);
  comparisonOpening = true;
  try {
    const { caseComparisonHtml, mountCaseComparison } = await import("./ui/case-comparison");
    if (signal !== session.signal || !session.canExport || (quiz && !quiz.answer)) return;
    openDialog("Comparar ECG", caseComparisonHtml());
    const dialog = $<HTMLDialogElement>("#dialog"), host = $(".case-comparison");
    dialog.classList.add("comparison-dialog");
    const dispose = mountCaseComparison(host, signal, ecg);
    let finished = false;
    const cleanup = () => {
      if (finished) return; finished = true;
      dispose(); observer.disconnect(); dialog.classList.remove("comparison-dialog");
      dialog.removeEventListener("close", cleanup);
    };
    const observer = new MutationObserver(() => { if (!host.isConnected) cleanup(); });
    observer.observe($("#dialog-content"), { childList: true });
    dialog.addEventListener("close", cleanup);
  } catch { toast("No se pudo abrir la comparación. Inténtalo de nuevo."); }
  finally { comparisonOpening = false; }
}
async function openTeachingWorkspace() {
  if (teachingOpening || !session.signal || !session.canExport || (quiz && !quiz.answer)) return;
  const signal = session.signal, ecg = cloneCase(c), key = teachingKey(signal);
  teachingOpening = true;
  let mountTeachingWorkspace: typeof import("./ui/teaching-workspace").mountTeachingWorkspace;
  try { ({ mountTeachingWorkspace } = await import("./ui/teaching-workspace")); }
  catch { toast("No se pudo cargar el Aula ECG. Inténtalo de nuevo."); return; }
  finally { teachingOpening = false; }
  // A new case or practice question may have arrived while the optional module loaded.
  if (signal !== session.signal || !session.canExport || (quiz && !quiz.answer)) return;
  const menu = $<HTMLDetailsElement>(".paper-menu");
  menu.open = false;
  menu.querySelector<HTMLElement>("summary")!.focus({ preventScroll: true });
  openDialog("Aula ECG · observar, anotar y relacionar", '<div id="teaching-root"></div>');
  const dialog = $<HTMLDialogElement>("#dialog"), host = $("#teaching-root");
  dialog.classList.add("teaching-dialog"); dialog.setAttribute("aria-label", "Aula ECG");
  let auxiliary: SignalController | null = null, cancelLoad: (() => void) | null = null;
  const dispose = mountTeachingWorkspace(host, {
    signal, c: ecg, previous: previousSignal,
    loadPrevious: lesionBaseline(ecg) ? () => new Promise<Signal>((resolve, reject) => {
      if (previousSignal && signal === session.signal) { resolve(previousSignal); return; }
      auxiliary = new SignalController((current, _m, _id, previous) => {
        auxiliary?.dispose(); auxiliary = null; cancelLoad = null;
        if (!previous || signalFingerprint(current) !== signalFingerprint(signal)) { reject(new Error("No se puede vincular el basal a estas muestras. El registro actual se conserva.")); return; }
        if (signal === session.signal) previousSignal = previous;
        resolve(previous);
      }, message => { auxiliary?.dispose(); auxiliary = null; cancelLoad = null; reject(new Error(message)); });
      cancelLoad = () => reject(new Error("Comparación cancelada al cerrar el Aula."));
      auxiliary.request(ecg, signal.duration, { previous: true });
    }) : undefined,
    notes: teachingNotes.get(key) ?? [],
    onNotesChange: notes => { teachingNotes.set(key, notes); draw(); },
    snapshots: teachingSnapshots,
    onSnapshot: snapshot => { teachingSnapshots.push(snapshot); },
  });
  let finished = false;
  const cleanup = () => {
    if (finished) return; finished = true;
    dispose(); auxiliary?.dispose(); cancelLoad?.(); observer.disconnect();
    dialog.classList.remove("teaching-dialog"); dialog.removeAttribute("aria-label"); dialog.removeEventListener("close", cleanup);
  };
  const observer = new MutationObserver(() => { if (!host.isConnected) cleanup(); });
  observer.observe($("#dialog-content"), { childList: true });
  dialog.addEventListener("close", cleanup);
  $("#dialog-content [data-action=close-dialog]").focus();
}
const ACTIONS: Record<string, (target: HTMLElement) => void | Promise<void>> = {
  compare: () => openComparison(),
  teaching: () => openTeachingWorkspace(),
  "teaching-marks": () => { teachingMarksVisible = !teachingMarksVisible; draw(); },
  "clear-search": () => {
    search = ""; group = "";
    $<HTMLInputElement>("#case-search").value = "";
    renderCatalog(); $("#case-search").focus();
  },
  "exploration-changes": () => showExplorationChanges(),
  "description-info": (target) => {
    if (!description) return;
    const kind = target.closest<HTMLElement>("[data-info]")!.dataset.info as DescriptionInfo;
    openDialog(descriptionInfoTitle(kind), descriptionInfoHtml(kind, description.measures, description.axis, description.axisContext));
  },
  "st-zoom": () => openStZoom(),
  "st-distribution": target => {
    const zoom = target.closest<HTMLElement>(".st-zoom");
    openStDistribution(zoom?.dataset.selectedLead as Lead | undefined, zoom?.dataset.zoomBeat === undefined ? undefined : Number(zoom.dataset.zoomBeat));
  },
  "present-30": () => {
    if (!description) return;
    openDialog("Presentación en 30 s", `<p class="dialog-lead">${esc(description.summary)}</p><p class="control-note">Orden: técnica, ritmo y frecuencia, intervalos, eje, ST, onda T y ondas Q, y conclusión.</p>`);
  },
  "restore-origin": () => { if (explorationOrigin) restoreOrigin(explorationOrigin); },
  pause: () => {
    if (!session.signal || c.view.mode !== "monitor") return;
    session.togglePause(c.view.mode);
    syncTraceTools();
  },
  caliper: () => {
    if (!session.signal || c.view.mode === "monitor") return;
    session.toggleCaliper(c.view.mode);
    if (!session.caliperOn) caliper = null;
    else if (layout) caliper = initialCaliper(layout, c.view, session.signal.fs);
    draw();
    if (session.caliperOn) $<HTMLCanvasElement>("#ecg").focus();
  },
  "clear-caliper": () => { caliper = null; draw(); },
  annotations: () => { annotations = !annotations; draw(); },
  "lens-st": () => { if (!quiz || quiz.answer) { stHighlight = !stHighlight; draw(); } },
  sound: async () => {
    audioOn = !audioOn;
    if (audioOn) {
      audioContext ??= new AudioContext();
      await audioContext.resume();
    }
    $('[data-action="sound"]').classList.toggle("active", audioOn);
    toast(audioOn ? "Sonido activado" : "Sonido desactivado");
  },
  theme: () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    draw();
  },
  reset: () => {
    if (explorationOrigin && explorationChanges(explorationOrigin, c).length) restoreOrigin(explorationOrigin);
    else { selectPreset(c.presetId === "custom" ? "sinus" : c.presetId); toast("Parámetros restablecidos"); }
  },
  quiz: () => startQuiz(),
  "end-quiz": () => { leavePractice(); renderInfo(); draw(); },
};
document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement,
    variant = target.closest<HTMLElement>("[data-variant]"),
    preset = target.closest<HTMLElement>("[data-preset]"),
    panel = target.closest<HTMLElement>("[data-panel]"),
    mode = target.closest<HTMLElement>("[data-mode]"),
    answer = target.closest<HTMLElement>("[data-answer]"),
    saved = target.closest<HTMLElement>("[data-saved]");
  const leadButton = target.closest<HTMLElement>("[data-reading-segment]"), findingButton = target.closest<HTMLElement>("[data-finding]");
  if (leadButton) { openLeadDetail(Number(leadButton.dataset.readingSegment), undefined, leadButton); return; }
  if (findingButton && session.canExport && !(quiz && !quiz.answer)) {
    const label = findingButton.dataset.finding!;
    activeFinding = activeFinding === label ? null : label;
    if (c.view.mode !== "paper") { c.view.mode = "paper"; session.changeMode("paper"); renderScales(); }
    if (session.caliperOn) { session.toggleCaliper("paper"); caliper = null; }
    draw();
    const first = syncReadingAids()?.[0];
    if (first) {
      const wrap = $("#canvas-wrap"); wrap.scrollLeft = Math.max(0, first.x * layout!.pxPerMm - 32);
      const top = window.scrollY + $("#ecg").getBoundingClientRect().top + first.y * layout!.pxPerMm - 120;
      window.scrollTo({top:Math.max(0,top),behavior:"instant"});
    }
    return;
  }
  if (target.closest('[data-action="clear-finding"]')) { activeFinding = null; draw(); return; }
  if (variant) {
    if (quiz && !quiz.answer) return;
    const id = variant.dataset.variant!;
    const active = currentPreset();
    if (!active || !diagnosisForPreset(active).variants.some(v => v.id === id) || active.id === id) return;
    leavePractice(); selectPreset(id);
    document.getElementById(`variant-tab-${id}`)?.focus({preventScroll:true});
    return;
  }
  if (preset) {
    if (quiz && !quiz.answer) return;
    leavePractice();
    selectPreset(preset.dataset.preset!);
    return;
  }
  if (panel) {
    setPanel(panel.dataset.panel!);
    return;
  }
  if (mode) {
    c.view.mode = mode.dataset.mode as ECGCase["view"]["mode"];
    caliper = null;
    session.changeMode(c.view.mode);
    renderScales();
    draw();
    return;
  }
  if (answer && answerPractice(quiz, answer.dataset.answer, session.canExport)) {
    renderQuiz();
    renderInfo();
    draw();
    return;
  }
  if (saved) {
    const selected = savedCaseAt(savedCaseSnapshot, Number(saved.dataset.saved));
    if (!selected) { toast("El caso seleccionado no está disponible; vuelve a abrir la lista."); return; }
    closeDialog();
    openCase(selected);
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;
  // The 30-second button sits inside the description's <summary>: do not toggle it.
  if (action === "present-30") e.preventDefault();
  if (action === "parameters" && !(quiz && !quiz.answer)) $<HTMLDetailsElement>("#adjust").open = true;
  if (workspaceNavigation.handle(action, !!quiz && !quiz.answer)) return;
  if (Object.hasOwn(ACTIONS, action)) await ACTIONS[action](target);
  await handleExportAction(action, {
    c,
    signal: session.signal,
    canExport: session.canExport,
    hideName: !!quiz && !quiz.answer,
    toast,
    refreshDialog: exportDialog,
  });
});
$<HTMLInputElement>("#file-input").addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement,
    f = el.files?.[0];
  if (!f) return;
  try {
    if (f.size > 50000)
      throw new Error("El caso excede el tamaño máximo de 50 kB.");
    const next = normalizeImportedCase(JSON.parse(await f.text()));
    closeDialog();
    openCase(next);
    toast("Caso importado");
  } catch (err) {
    toast("No se pudo importar: " + (err as Error).message);
  }
  el.value = "";
});
const canvas = $<HTMLCanvasElement>("#ecg");
let leadTap: { x: number; y: number; segment: number; time: number; left: number; top: number; stamp: number } | null = null;
function pointer(e: PointerEvent) {
  return layout ? sheetPoint(canvas.getBoundingClientRect(), e.clientX, e.clientY, layout) : null;
}
canvas.addEventListener("pointerdown", (e) => {
  if (!session.caliperOn && layout && session.signal && c.view.mode === "paper" && e.isPrimary && e.button === 0) {
    const pos = pointer(e);
    const seg = pos ? layout.segments[segmentIndexAt(layout, pos)] : undefined;
    if (seg && pos) {
      leadTap = { x:e.clientX, y:e.clientY, segment:layout.segments.indexOf(seg), time:seg.start + (pos.x - seg.x) / c.view.speed,
        left:$("#canvas-wrap").scrollLeft, top:window.scrollY, stamp:e.timeStamp };
    }
    return;
  }
  if (!session.caliperOn || !layout || (c.view.mode === "monitor" && !session.paused)) return;
  const pos = pointer(e);
  if (!pos) return;
  const i = segmentIndexAt(layout, pos);
  if (i < 0) return;
  if (!session.signal) return;
  caliper = placeCaliper(initialCaliper(layout,c.view,session.signal.fs,i),1,pos,layout,c.view,session.signal.fs);
  caliper = placeCaliper(caliper,2,pos,layout,c.view,session.signal.fs);
  canvas.focus({preventScroll:true});
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  draw();
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging || !caliper || !layout) return;
  const pos = pointer(e);
  if (!pos) return;
  if (!session.signal) return;
  caliper = placeCaliper(caliper,2,pos,layout,c.view,session.signal.fs);
  draw();
});
canvas.addEventListener("pointerup", e => {
  dragging = false;
  const tap = leadTap; leadTap = null;
  if (tap && Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<6 && e.timeStamp-tap.stamp<800 &&
      Math.abs($("#canvas-wrap").scrollLeft-tap.left)<2 && Math.abs(window.scrollY-tap.top)<2) openLeadDetail(tap.segment,tap.time);
});
canvas.addEventListener("pointercancel", () => { dragging = false; leadTap = null; });
document.addEventListener("keydown", (e) => {
  // Character shortcuts belong to the focused trace only. Native fields/buttons
  // keep their keyboard behavior; do not intercept screen-reader modifiers.
  if (e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || $<HTMLDialogElement>("#dialog").open) return;
  const key=e.key.toLowerCase();
  if (key === "?") {
    e.preventDefault();
    openDialog("Atajos de teclado", keyboardHelpHtml());
    return;
  }
  if (session.caliperOn && session.signal && layout && e.key.startsWith("Arrow")) {
    e.preventDefault();
    caliper=moveCaliper(caliper??initialCaliper(layout,c.view,session.signal.fs),caliperEditor.endpoint,e.key,layout,c.view,session.signal.fs,e.shiftKey);
    draw();
    const r=canvas.getBoundingClientRect(), end=caliperEditor.endpoint===1;
    keepInView($("#canvas-wrap"),
      r.left+(end?caliper.x1:caliper.x2)/layout.widthMm*r.width,
      r.top+(end?caliper.y1:caliper.y2)/layout.heightMm*r.height);
    return;
  }
  if (!['m','p','r','v','g','c',' '].includes(key)) return;
  e.preventDefault();
  if (key===' ' && c.view.mode==='monitor') $<HTMLButtonElement>('[data-action="pause"]').click();
  if (key==='c') $<HTMLButtonElement>('[data-action="caliper"]').click();
  const mode=({m:'monitor',p:'paper',r:'rhythm'} as Record<string,string>)[key];
  if(mode)$<HTMLButtonElement>(`[data-mode="${mode}"]`).click();
  if (key === 'v' || key === 'g') {
    if (key === 'v') c.view.speed = nextInCycle(SPEEDS, c.view.speed);
    else c.view.gain = c.view.chestGain = nextInCycle(GAINS, c.view.gain);
    caliper = null;
    renderScales();
    renderDescription();
    draw();
  }
});
new ResizeObserver(() => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(draw, 90);
}).observe($("#canvas-wrap"));
$("#canvas-wrap").addEventListener("scroll", syncTraceOverflow, { passive: true });
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(draw, 90);
});
let resizeTimer = 0;
window.addEventListener("hashchange", () => {
  try {
    const next = decodeCase(location.hash);
    if (next) openCase(next);
  } catch (err) {
    toast((err as Error).message);
  }
});
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  leavePractice();
  selectPreset("sinus");
});
renderCatalog();
renderControls();
renderInfo();
generate();
if (initialError) toast(initialError);
