import { applyTheme, currentTheme, readTheme } from "./ui/theme";
import { aboutDialogHtml } from "./ui/about-dialog";
import { regionalActivationControls } from "./ui/regional-activation";
import "./style.css";
import { APP_VERSION } from "./ui/version";
import { catalogGroup, familyGuide, familyLabel } from "./ui/catalog-presentation";
import { lesionBaseline } from "./engine/lesion-baseline";
import { differenceSignal } from "./render/st-lens";
import { omiSheetHtml, structuredDescriptionHtml } from "./ui/omi-sheet";
import { structuredDescription } from "./ui/structured-description";
import { metricsHtml, modelMetricCards } from "./ui/metric-cards";
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
import { initialCaliper, placeCaliper, moveCaliper } from "./render/caliper-geometry";
import { practiceFeedback, type PracticeId } from "./ui/practice-feedback";
import { createPractice, answerPractice, type PracticeState } from "./ui/practice-session";
import { practicePanelHtml } from "./ui/practice-panel";
import { changeCase, isCaseControlKey, controlValue, withInterfaceView } from "./ui/case-state";
import { representativeBeat, nearestBeat } from "./ui/beat-selection";
import { measurementDialog } from "./ui/measurement-dialog";
import { auditMeasurement } from "./engine/analysis/model-audit";
import {
  PRESETS,
  fromPreset,
  presetById,
} from "./presets/catalog";
import {
  renderPaper,
  renderRhythm,
  drawCaliper,
  Monitor,
  type Layout,
  type Caliper,
} from "./render/ecg";
import { icon, btn, esc, select } from "./ui/helpers";
import { syncPauseControl } from "./ui/pause-control";
import { controls, leadOptions, amplitudeControlState, tAxisControlState } from "./ui/controls";
import { caseContext, caseReading, normalizeImportedCase } from "./presets/case-context";
import { usesRealisticBase } from "./engine/realistic/scope";
import {
  decodeCase,
  savedCaseState,
  savedCaseAt,
} from "./ui/persistence";

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const session = new TraceSession();
// Start on the sinus preset itself (textbook patient, resting HRV), not on the
// bare defaults it is built from.
let c = fromPreset(presetById("sinus")!),
  layout: Layout | null = null,
  monitor: Monitor | null = null;
/** OMI lenses on the 12-lead paper: the same patient's previous ECG (grey), the
 * lesion alone (this trace minus that one) and the J point with SDST/IDST. */
const lens = { previous: false, change: false, st: false };
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
root.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="ECG Lab, inicio">${icon("pulse")}<span>ECG<span class="brand-light">lab</span></span><span class="brand-divider"></span><small>Explora la electrocardiografía</small></a><nav aria-label="Herramientas"><button class="btn mobile-cases" data-action="catalog">${icon("menu")}<span>Casos</span></button>${btn("quiz", "Practicar", "quiz")}${btn("about", "Guía", "book")}${btn("theme", "Tema", "sun", "icon-button")}${btn("export", "Exportar", "download", "primary")}</nav></header>
 <div class="app-layout"><aside class="sidebar" id="catalog"><div class="sidebar-head"><h2>Biblioteca de patrones</h2>${btn("close-catalog", "Cerrar", "close", "mobile-cases icon-button")}</div><label class="search-box">${icon("search")}<input id="case-search" type="search" placeholder="Patrón, sigla o palabra…" aria-label="Buscar caso"/></label><div class="catalog-result-bar"><span id="catalog-count" role="status" aria-live="polite"></span><button type="button" class="catalog-clear" data-action="clear-search" hidden>Limpiar filtros</button></div><div id="case-list" class="case-list"></div></aside>
 <main class="workspace"><section class="case-heading"><div><div class="case-category" id="case-category">RITMOS</div><h1 id="case-title">Ritmo sinusal</h1><p id="case-variant-title" class="case-variant-title" hidden></p><p id="case-subtitle">Activación auricular sinusal seguida de conducción AV 1:1.</p><div id="exploration-context" class="exploration-context" hidden></div></div><div class="case-state">${btn("parameters", "Ajustar", "settings", "subtle")}${btn("reset", "Restablecer", "reset", "subtle")}</div></section>
 <section id="diagnosis-navigation" class="diagnosis-navigation" aria-label="Variantes del patrón" hidden></section>
 <div id="diagnosis-content">
 <section id="metrics" class="metrics" aria-label="Medidas del ECG"><div class="loading-metrics">Generando señal…</div></section>
 <section class="trace-panel" aria-label="Trazado electrocardiográfico"><div class="trace-toolbar"><div class="view-tabs" role="tablist" aria-label="Vista del ECG"><button role="tab" data-mode="paper" aria-selected="true">${icon("grid")}12 derivaciones</button><button role="tab" data-mode="monitor" aria-selected="false">${icon("monitor")}Monitor</button><button role="tab" data-mode="rhythm" aria-selected="false">${icon("strip")}Tira de ritmo</button></div><div class="trace-tools">${btn("caliper", "Calibres", "ruler")}${btn("annotations", "Ondas", "eye")}<span class="lens-tools" role="group" aria-label="Lentes OMI">${btn("lens-previous", "ECG previo", "strip")}${btn("lens-change", "Solo el cambio", "pulse")}${btn("lens-st", "Punto J y ST", "ruler")}</span>${btn("pause", "Congelar", "pause")}</div></div>
 <div id="quiz-panel" hidden></div><div id="caliper-editor" class="caliper-editor" hidden></div><div class="monitor-vitals" id="monitor-vitals" hidden><div><span>FRECUENCIA VENTRICULAR</span><strong id="monitor-rate">72</strong><small id="monitor-rate-note">No estimable</small></div><div class="monitor-controls">${btn("sound", "Sonido", "volume")}<span id="monitor-state">REPRODUCCIÓN</span></div></div>
 <div class="canvas-scroll" id="canvas-wrap"><canvas id="ecg" tabindex="0" aria-describedby="trace-keyboard-help" role="img" aria-label="ECG sintético de 12 derivaciones"></canvas><div class="signal-loading" id="signal-loading" aria-live="polite">Calculando señal…</div></div>
 <div id="measurement-readout" class="caliper-readout" hidden><output id="measurement-values" role="status" aria-live="polite" aria-atomic="true"></output><button type="button" data-action="clear-caliper">Limpiar</button></div><div class="scale-toolbar" id="scale-toolbar"></div><p id="trace-keyboard-help" class="sr-only">Con foco en el trazado: M, P y R cambian la vista; V y G, la escala; C activa los calibres y espacio congela el monitor. Con calibres, las flechas mueven el extremo seleccionado; Mayús mueve diez pasos.</p></section>
 </div>
 <section class="reading-guide" aria-labelledby="finding-title"><div class="guide-main"><div class="section-label">Guía de lectura</div><h2 id="finding-title">Hallazgos esperados</h2><ul id="findings"></ul><div id="structured-description"></div></div><div class="guide-side"><div id="omi-sheet"></div><div id="limitation" class="model-note"></div><div id="warnings"></div><div class="guide-links"><button class="text-button" data-action="measurements">Medidas y valores del modelo ${icon("chevron")}</button><button class="text-button" data-action="about">Estado y referencias ${icon("chevron")}</button></div></div></section>
 <details id="adjust" class="adjust-panel"><summary><span>Ajustar el caso</span><small>Parámetros del modelo</small></summary><div id="inspector" class="inspector"></div></details>
 <footer class="workspace-footer"><span>ECG Lab · Laboratorio de electrocardiografía</span><span>Morfología normal aprendida de <a href="https://physionet.org/content/ptb-xl/1.0.3/" target="_blank" rel="noopener">PTB-XL</a> y <a href="https://physionet.org/content/ptb-xl-plus/1.0.1/" target="_blank" rel="noopener">PTB-XL+</a> (Wagner et al. 2020; Strodthoff et al. 2023), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>; se distribuyen solo coeficientes derivados.</span><span>Uso educativo. Sin validación clínica. <span data-product-version="${APP_VERSION}">v${APP_VERSION}</span></span></footer></main></div>
 <dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><input type="file" id="file-input" accept=".json,application/json" hidden/>`;

const variantNavigation = new VariantNavigation($("#diagnosis-navigation"), $("#diagnosis-content"));
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
// Open state of the sheet's support and of the description, kept across re-renders.
let refsOpen = false, descriptionOpen = true;
document.addEventListener("toggle", (e) => {
  const el = e.target as HTMLDetailsElement;
  if (el.classList?.contains("omi-refs")) refsOpen = el.open;
  else if (el.classList?.contains("structured-description")) descriptionOpen = el.open;
}, true);
/** The description is read from the signal shown: empty while a new one is computed. */
function renderDescription() {
  const concealed = quiz && !quiz.answer;
  $("#structured-description").innerHTML = !concealed && session.signal ? structuredDescriptionHtml(structuredDescription(c, session.signal), descriptionOpen) : "";
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
  $("#case-variant-title").hidden = !!concealed || !grouped || p?.name === diagnosis?.title;
  $("#case-variant-title").textContent = !concealed && grouped ? p!.name : "";
  variantNavigation.update(p, !!concealed, c.artifacts.reversed);
  $("#case-category").textContent = concealed
    ? "PRÁCTICA"
    : customExploration ? "EXPLORACIÓN"
    : p ? [familyLabel(catalogGroup(p)), familyGuide(catalogGroup(p))].filter(Boolean).join(" · ") : "Caso personalizado";
  $("#case-subtitle").textContent = concealed
    ? "Identifica el patrón. Puedes cambiar la vista y utilizar los calibres."
    : customExploration ? "Interpreta la señal actual; el origen solo indica procedencia." : reading.subtitle;
  renderExplorationContext(!!concealed);
  $("#finding-title").textContent = concealed
    ? "Análisis sistemático"
    : reading.findingsTitle;
  $("#findings").innerHTML = (
    concealed
      ? [
          "Frecuencia y regularidad",
          "Actividad auricular y relación AV",
          "QRS, eje y repolarización",
        ]
      : reading.findings
  )
    .map((f) => `<li>${esc(f)}</li>`)
    .join("");
  // OMI families (A3): case sheet with expert notes and support; and, for any case,
  // the structured description read from the trace shown.
  // With reversed arm electrodes the trace no longer shows the sheet's picture.
  $("#omi-sheet").innerHTML = !concealed && p && !customExploration && !c.artifacts.reversed ? omiSheetHtml(p.id, refsOpen) : "";
  renderDescription();
  $("#limitation").innerHTML = concealed
    ? "El diagnóstico se mostrará al responder."
    : `<strong>${p?.strategy === "local" ? "Ajuste morfológico local" : "Modelo aproximado"}</strong><p>${esc(p?.limitation || "Sin validación clínica de este caso personalizado.")}</p>`;
  $("#warnings").innerHTML = (concealed ? [] : [...context.warnings, ...(session.signal?.warnings || []), ...(c.rhythm === "af" ? [usesRealisticBase(c)
    ? "FA aprendida de pacientes reales (PTB-XL): ondas f e irregularidad del RR propias de cada paciente (CV del RR 0,10–0,35 según la semilla). Intervalos RR independientes (distribución gamma): no simula memoria del nodo AV ni cambios de organización de las ondas f dentro del trazado; la FC programada es una media de largo plazo."
    : "FA representativa: intervalos RR positivos independientes (distribución gamma, CV 0,22). No simula memoria del nodo AV ni toda la variabilidad entre pacientes; la FC programada es una media de largo plazo."] : [])])
    .map((w) => `<p class="warning">${esc(w)}</p>`)
    .join("");
  $<HTMLButtonElement>('[data-action="export"]').disabled = !!concealed;
  $("#adjust").hidden = !!concealed;
  $<HTMLButtonElement>('[data-action="parameters"]').disabled = !!concealed;
  $("#catalog").classList.toggle("quiz-concealed", !!concealed);
}
function renderMetrics() {
  if (!session.signal || !session.measurement) return;
  // The simulator knows what it generated: show the model's values. The frozen
  // sample analyzer remains an independent estimate inside «Medidas».
  const cards = modelMetricCards(c, session.signal), rate = cards[0];
  $("#metrics").innerHTML = metricsHtml(cards);
  $("#monitor-rate").textContent = rate.value === "—" ? "—" : rate.value.replace(/<small>.*<\/small>/, "");
  $("#monitor-rate-note").textContent = rate.value === "—" ? "No estimable" : "lpm · modelo";
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
  if (focused) {
    const field = Array.from(inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]"))
      .find(el => el.dataset.key === focused);
    if (field && !field.disabled) field.focus({ preventScroll: true });
  }
  renderScales();
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
    monitorMode = c.view.mode === "monitor";
  $("#scale-toolbar").innerHTML = `${select(
    "view.speed",
    "Velocidad",
    [
      [12.5, "12,5 mm/s"],
      [25, "25 mm/s"],
      [50, "50 mm/s"],
    ],
    c.view.speed,
  )}${select(
    "view.gain",
    "Ganancia",
    [
      [2.5, "2,5 mm/mV"],
      [5, "5 mm/mV"],
      [10, "10 mm/mV"],
      [20, "20 mm/mV"],
    ],
    c.view.gain,
  )}${
    paper
      ? select(
          "view.format",
          "Formato",
          [
            ["3x4", "3 × 4"],
            ["3x4+1", "3 × 4 + ritmo II"],
            ["3x4+3", "3 × 4 + 3 tiras"],
            ["6x2", "6 × 2"],
            ["12x1", "12 × 1"],
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
  }<div class="scale-toggles"><label class="toggle"><input type="checkbox" data-key="view.grid" ${c.view.grid ? "checked" : ""}/>Grilla</label></div>`;
  document
    .querySelectorAll("[data-mode]")
    .forEach((el) =>
      el.setAttribute(
        "aria-selected",
        String((el as HTMLElement).dataset.mode === c.view.mode),
      ),
    );
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
  $(".lens-tools").hidden = !paper;
  $("#monitor-state").textContent = !ready ? "SIN SEÑAL" : session.paused ? "CONGELADO" : "REPRODUCCIÓN";
  const waves = $<HTMLButtonElement>('[data-action="annotations"]');
  waves.disabled = !paper || !ready;
  waves.hidden = !paper;
  waves.classList.toggle("active", ready && paper && annotations);
  waves.setAttribute("aria-pressed", String(ready && paper && annotations));
  const lesion = !!lesionBaseline(c) && !(quiz && !quiz.answer);
  for (const [action, on, enabled] of [["lens-previous", lens.previous, lesion], ["lens-change", lens.change, lesion], ["lens-st", lens.st, true]] as const) {
    const b = $<HTMLButtonElement>(`[data-action="${action}"]`), active = ready && paper && enabled && on;
    b.disabled = !paper || !ready || !enabled;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
    b.hidden = !enabled;
  }
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
  layout = null;
  monitor = null;
  caliper = null;
  dragging = false;
  lastFrame = 0;
}
function showUnavailableSignal(message: string, unavailable = false) {
  resetTracePresentation();
  const canvas = $<HTMLCanvasElement>("#ecg");
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
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
  $("#warnings").innerHTML = "";
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
  session.expectRequest(controller.request(c, 65, { previous: (lens.previous || lens.change) && !!lesionBaseline(c) }));
}
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
    const practice = !!quiz && !quiz.answer, prior = !practice && lesionBaseline(c) ? previousSignal : null;
    const change = !!prior && lens.change;
    layout = renderPaper(canvas, change ? differenceSignal(session.signal, prior) : session.signal, c, width, {
      annotations: annotations && !change,
      measurement: session.measurement ?? undefined,
      selectedBeat: session.selectedBeat,
      hideName: practice,
      displayName: caseReading(c).title,
      previous: prior && lens.previous && !change ? prior : undefined,
      stLens: lens.st && !practice,
      traceNote: change ? "solo el cambio: este trazado menos el ECG previo del mismo paciente" : prior && lens.previous ? "gris: ECG previo del mismo paciente" : undefined,
    });
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
  caliperEditor.update({active:session.caliperOn, layout, caliper, view:c.view, fs:session.signal.fs});
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
  c = fromPreset(p, c.view);
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
  if (quiz && !key.startsWith("view.")) { quiz = null; renderQuiz(); renderInfo(); }
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
  renderControls();
  renderInfo();
  if (key.startsWith("view.")) {
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
  if (session.signal && session.measurement)
    openDialog(
      "Medidas, límites y consistencia",
      measurementDialog(session.signal, session.measurement, c),
    );
  else
    toast("Las medidas estarán disponibles al generar correctamente la señal.");
}
function showAbout() {
  openDialog(
    "Modelo, alcance y referencias",
    aboutDialogHtml(PRESETS),
  );
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
document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement,
    variant = target.closest<HTMLElement>("[data-variant]"),
    preset = target.closest<HTMLElement>("[data-preset]"),
    panel = target.closest<HTMLElement>("[data-panel]"),
    mode = target.closest<HTMLElement>("[data-mode]"),
    answer = target.closest<HTMLElement>("[data-answer]"),
    saved = target.closest<HTMLElement>("[data-saved]");
  if (variant) {
    if (quiz && !quiz.answer) return;
    const id = variant.dataset.variant!;
    const active = currentPreset();
    if (!active || !diagnosisForPreset(active).variants.some(v => v.id === id) || active.id === id) return;
    quiz = null; renderQuiz(); selectPreset(id);
    document.getElementById(`variant-tab-${id}`)?.focus({preventScroll:true});
    return;
  }
  if (preset) {
    if (quiz && !quiz.answer) return;
    quiz = null;
    renderQuiz();
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
    c = withInterfaceView(selected);
    explorationOrigin=null;
    closeDialog();
    quiz = null;
    renderQuiz();
    renderCatalog();
    renderControls();
    renderInfo();
    generate();
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "clear-search") {
    search = ""; group = "";
    $<HTMLInputElement>("#case-search").value = "";
    renderCatalog(); $("#case-search").focus();
  }
  if(action==="exploration-changes") showExplorationChanges();
  if(action==="restore-origin"&&explorationOrigin){c=restoreExplorationOrigin(explorationOrigin,c);caliper=null;session.resetTools();annotations=false;renderCatalog();renderControls();renderInfo();generate();toast("Origen restaurado; se conserva la vista actual.")}
  if (action === "parameters" && !(quiz && !quiz.answer)) $<HTMLDetailsElement>("#adjust").open = true;
  if (workspaceNavigation.handle(action, !!quiz && !quiz.answer)) return;
  if (action === "pause") {
    if (!session.signal || c.view.mode !== "monitor") return;
    session.togglePause(c.view.mode);
    syncTraceTools();
  }
  if (action === "caliper") {
    if (!session.signal || c.view.mode === "monitor") return;
    session.toggleCaliper(c.view.mode);
    if (!session.caliperOn) caliper = null;
    else if (layout) caliper = initialCaliper(layout, c.view, session.signal.fs);
    draw();
    if (session.caliperOn) $<HTMLCanvasElement>("#ecg").focus();
  }
  if (action === "clear-caliper") {
    caliper = null;
    draw();
  }
  if (action === "annotations") {
    annotations = !annotations;
    draw();
  }
  if (action === "lens-previous" || action === "lens-change" || action === "lens-st") {
    const key = action === "lens-previous" ? "previous" : action === "lens-change" ? "change" : "st";
    lens[key] = !lens[key];
    // The previous ECG comes with the trace from the worker; ask for it once.
    if ((lens.previous || lens.change) && lesionBaseline(c) && !previousSignal) generate();
    else draw();
  }
  if (action === "sound") {
    audioOn = !audioOn;
    if (audioOn) {
      audioContext ??= new AudioContext();
      await audioContext.resume();
    }
    $('[data-action="sound"]').classList.toggle("active", audioOn);
    toast(audioOn ? "Sonido activado" : "Sonido desactivado");
  }
  if (action === "theme") {
    applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    draw();
  }
  if(action==="reset"){if(explorationOrigin&&explorationChanges(explorationOrigin,c).length){c=restoreExplorationOrigin(explorationOrigin,c);caliper=null;session.resetTools();annotations=false;renderCatalog();renderControls();renderInfo();generate();toast("Origen restaurado; se conserva la vista actual.")}else{selectPreset(c.presetId==="custom"?"sinus":c.presetId);toast("Parámetros restablecidos")}}
  if (action === "quiz") startQuiz();
  if (action === "end-quiz") {
    quiz = null;
    renderQuiz();
    renderInfo();
    draw();
  }
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
    c = withInterfaceView(normalizeImportedCase(JSON.parse(await f.text())));
    explorationOrigin=null;
    quiz = null;
    closeDialog();
    renderQuiz();
    renderControls();
    renderCatalog();
    renderInfo();
    generate();
    toast("Caso importado");
  } catch (err) {
    toast("No se pudo importar: " + (err as Error).message);
  }
  el.value = "";
});
const canvas = $<HTMLCanvasElement>("#ecg");
function pointer(e: PointerEvent) {
  if (!layout) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * layout.widthMm,
    y: ((e.clientY - rect.top) / rect.height) * layout.heightMm,
  };
}
canvas.addEventListener("pointerdown", (e) => {
  if (!session.caliperOn && layout && session.measurement && c.view.mode === "paper") {
    const pos = pointer(e);
    const seg = pos
      ? layout.segments.find(
          (s) =>
            pos.x >= s.x &&
            pos.x <= s.x + s.width &&
            pos.y >= s.y &&
            pos.y <= s.y + s.height,
        )
      : null;
    if (seg && pos) {
      session.selectBeat(nearestBeat(
        session.measurement,
        seg.start + (pos.x - seg.x) / c.view.speed,
      ));
      c.view.lead = seg.lead;
      annotations = true;
      draw();
    }
    return;
  }
  if (!session.caliperOn || !layout || (c.view.mode === "monitor" && !session.paused)) return;
  const pos = pointer(e);
  if (!pos) return;
  const i = layout.segments.findIndex(
    (s) =>
      pos.x >= s.x &&
      pos.x <= s.x + s.width &&
      pos.y >= s.y &&
      pos.y <= s.y + s.height,
  );
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
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointercancel", () => (dragging = false));
document.addEventListener("keydown", (e) => {
  // Character shortcuts belong to the focused trace only. Native fields/buttons
  // keep their keyboard behavior; do not intercept screen-reader modifiers.
  if (e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || $<HTMLDialogElement>("#dialog").open) return;
  const key=e.key.toLowerCase();
  if (session.caliperOn && session.signal && layout && e.key.startsWith("Arrow")) {
    e.preventDefault();
    caliper=moveCaliper(caliper??initialCaliper(layout,c.view,session.signal.fs),caliperEditor.endpoint,e.key,layout,c.view,session.signal.fs,e.shiftKey);
    draw();
    const wrap=$("#canvas-wrap"),r=canvas.getBoundingClientRect(),w=wrap.getBoundingClientRect();
    const x=r.left+(caliperEditor.endpoint===1?caliper.x1:caliper.x2)/layout.widthMm*r.width;
    const y=r.top+(caliperEditor.endpoint===1?caliper.y1:caliper.y2)/layout.heightMm*r.height;
    if(x<w.left+20)wrap.scrollLeft+=x-w.left-20;else if(x>w.right-20)wrap.scrollLeft+=x-w.right+20;
    if(y<w.top+20)wrap.scrollTop+=y-w.top-20;else if(y>w.bottom-20)wrap.scrollTop+=y-w.bottom+20;
    return;
  }
  if (!['m','p','r','v','g','c',' '].includes(key)) return;
  e.preventDefault();
  if (key===' ' && c.view.mode==='monitor') $<HTMLButtonElement>('[data-action="pause"]').click();
  if (key==='c') $<HTMLButtonElement>('[data-action="caliper"]').click();
  const mode=({m:'monitor',p:'paper',r:'rhythm'} as Record<string,string>)[key];
  if(mode)$<HTMLButtonElement>(`[data-mode="${mode}"]`).click();
  if(key==='v') {const a=[12.5,25,50];c.view.speed=a[(a.indexOf(c.view.speed)+1)%3];caliper=null;renderScales();draw();}
  if(key==='g') {const a=[2.5,5,10,20];c.view.gain=a[(a.indexOf(c.view.gain)+1)%4];c.view.chestGain=c.view.gain;caliper=null;renderScales();draw();}
});
new ResizeObserver(() => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(draw, 90);
}).observe($("#canvas-wrap"));
let resizeTimer = 0;
window.addEventListener("hashchange", () => {
  try {
    const next = decodeCase(location.hash);
    if (next) {
      c = withInterfaceView(next);
      explorationOrigin=null;
      quiz = null;
      renderQuiz();
      renderCatalog();
      renderControls();
      renderInfo();
      generate();
    }
  } catch (err) {
    toast((err as Error).message);
  }
});
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  quiz = null;
  renderQuiz();
  selectPreset("sinus");
});
renderCatalog();
renderControls();
renderInfo();
generate();
if (initialError) toast(initialError);
