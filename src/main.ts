import { applyTheme, currentTheme, readTheme } from "./ui/theme";
import { aboutDialogHtml } from "./ui/about-dialog";
import { regionalActivationControls } from "./ui/regional-activation";
import "./style.css";
import { APP_VERSION } from "./ui/version";
import { ActivationLab } from "./ui/activation-lab";
import { familyLabel } from "./ui/catalog-presentation";
import { metricCards, metricsHtml, monitorRate } from "./ui/metric-cards";
import { openDialog, closeDialog } from "./ui/dialog";
import { exportDialogHtml } from "./ui/export-dialog";
import { diagnosisFamilies, diagnosisForPreset } from "./ui/diagnosis-navigation";
import { createExplorationOrigin, explorationChanges, restoreExplorationOrigin, sameExplorationModel, type ExplorationOrigin } from "./ui/exploration-origin";
import type { SyntheticComparisonTrace } from "./ui/comparison-model";
import { ComparisonLab } from "./ui/comparison-lab";
import { captureTrace } from "./ui/comparison-model";
import { ExternalLab } from "./ui/external-lab";
import {
  DEFAULT_CASE,
  cloneCase,
  type ECGCase,
} from "./engine/types";
import { SignalController } from "./ui/signal-controller";
import { TraceSession } from "./ui/trace-session";
import { CaliperEditor } from "./ui/caliper-editor";
import { initialCaliper, placeCaliper, moveCaliper } from "./render/caliper-geometry";
import { practiceQuestion, practiceFeedback, type PracticeId } from "./ui/practice-feedback";
import { changeCase, isCaseControlKey, controlValue } from "./ui/case-state";
import { beatDetail, representativeBeat, nearestBeat } from "./ui/beat-detail";
import { measurementDialog } from "./ui/measurement-dialog";
import { auditMeasurement } from "./engine/analysis/model-audit";
import {
  PRESETS,
  fromPreset,
  presetById,
  type Preset,
} from "./presets/catalog";
import {
  renderPaper,
  renderRhythm,
  drawCaliper,
  Monitor,
  type Layout,
  type Caliper,
} from "./render/ecg";
import { icon, btn, esc, select, options } from "./ui/helpers";
import { controls, leadOptions, amplitudeControlState } from "./ui/controls";
import { caseContext, caseReading, normalizeImportedCase } from "./presets/case-context";
import {
  decodeCase,
  encodeCase,
  download,
  savedCases,
  saveCase,
  pngWithDpi,
} from "./ui/persistence";

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const session = new TraceSession();
let c = cloneCase(DEFAULT_CASE),
  layout: Layout | null = null,
  monitor: Monitor | null = null;
let annotations = false,
  caliper: Caliper | null = null,
  dragging = false,
  lastFrame = 0,
  audioOn = false,
  audioContext: AudioContext | null = null,
  lastBeep = -1;
let timer = 0,
  activePanel = "base",
  search = "",
  group = "",
  quiz: { preset: Preset; choices: Preset[]; answer: string | null } | null =
    null;
let explorationOrigin: ExplorationOrigin | null = null;
let explorationOriginTrace: SyntheticComparisonTrace | null = null;
let initialError = "";
try {
  c = decodeCase(location.hash) || c;
} catch (e) {
  initialError = (e as Error).message;
}
applyTheme(readTheme());
const root = $("#app");
root.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="ECG Lab, inicio">${icon("pulse")}<span>ECG<span class="brand-light">lab</span></span><span class="brand-divider"></span><small>Explora la electrocardiografía</small></a><nav aria-label="Herramientas"><button class="btn mobile-cases" data-action="catalog">${icon("menu")}<span>Casos</span></button>${btn("quiz", "Practicar", "quiz")}${btn("about", "Guía", "book")}${btn("theme", "Tema", "sun", "icon-button")}${btn("export", "Exportar", "download", "primary")}</nav></header>
 <div class="app-layout"><aside class="sidebar" id="catalog"><div class="sidebar-head"><div><h2>Biblioteca de patrones</h2><span>${PRESETS.filter((x) => x.strategy !== "pending").length} ejemplos · agrupados por patrón</span></div>${btn("close-catalog", "Cerrar", "close", "mobile-cases icon-button")}</div><label class="search-box">${icon("search")}<input id="case-search" type="search" placeholder="Patrón, sigla o palabra…" aria-label="Buscar caso"/></label><label class="category-select"><span class="sr-only">Categoría</span><select id="category">${options([["", "Todas las familias"], ...Array.from(new Set(PRESETS.map((x) => x.group))).map((x) => [x, familyLabel(x)] as [string, string])], "")}</select></label><div class="catalog-result-bar"><span id="catalog-count" role="status" aria-live="polite"></span><button type="button" class="catalog-clear" data-action="clear-search" hidden>Limpiar filtros</button></div><div id="case-list" class="case-list"></div><div class="sidebar-footer">${icon("pulse")}<div>Señal 100% sintética<small data-product-version="${APP_VERSION}">Modelo educativo · v${APP_VERSION}</small></div></div></aside>
 <main class="workspace"><nav class="workspace-nav" aria-label="Espacios de trabajo"><span class="workspace-current" aria-current="page">${icon("pulse")}Simulador</span>${btn("external", "Abrir señal", "book")}${btn("compare", "Comparar A/B", "strip")}${btn("activation", "Activación QRS", "pulse")}<button type="button" class="btn workspace-adjust" data-action="parameters">${icon("settings")}<span>Ajustar el caso</span></button></nav><section class="case-heading"><div><div class="case-category" id="case-category">RITMOS</div><h1 id="case-title">Ritmo sinusal</h1><p id="case-variant-title" class="case-variant-title" hidden></p><p id="case-subtitle">Activación auricular sinusal seguida de conducción AV 1:1.</p><div id="exploration-context" class="exploration-context" hidden></div></div><div class="case-state"><span class="status-label">Ejemplo sintético</span>${btn("reset", "Restablecer", "reset", "subtle")}</div></section>
 <section id="diagnosis-navigation" class="diagnosis-navigation" aria-label="Variantes del patrón" hidden></section>
 <div id="diagnosis-content">
 <section id="metrics" class="metrics" aria-label="Medidas del ECG"><div class="loading-metrics">Generando señal…</div></section>
 <section class="trace-panel" aria-label="Trazado electrocardiográfico"><div class="trace-toolbar"><div class="view-tabs" role="tablist" aria-label="Vista del ECG"><button role="tab" data-mode="paper" aria-selected="true">${icon("grid")}12 derivaciones</button><button role="tab" data-mode="monitor" aria-selected="false">${icon("monitor")}Monitor</button><button role="tab" data-mode="rhythm" aria-selected="false">${icon("strip")}Tira de ritmo</button></div><div class="trace-tools">${btn("caliper", "Calibres", "ruler")}${btn("annotations", "Ondas", "eye")}${btn("focus", "Ampliar", "search")}${btn("pause", "Congelar", "pause")}</div></div>
 <div id="quiz-panel" hidden></div><div id="caliper-editor" class="caliper-editor" hidden></div><div class="monitor-vitals" id="monitor-vitals" hidden><div><span>FRECUENCIA VENTRICULAR</span><strong id="monitor-rate">72</strong><small>lpm</small></div><div class="monitor-controls">${btn("sound", "Sonido", "volume")}<span id="monitor-state">REPRODUCCIÓN</span></div></div>
 <div class="canvas-scroll" id="canvas-wrap"><canvas id="ecg" tabindex="0" aria-describedby="trace-keyboard-help" role="img" aria-label="ECG sintético de 12 derivaciones"></canvas><div class="signal-loading" id="signal-loading" aria-live="polite">Calculando señal…</div></div>
 <div id="measurement-readout" class="caliper-readout" hidden><output id="measurement-values" role="status" aria-live="polite" aria-atomic="true"></output><button type="button" data-action="clear-caliper">Limpiar</button></div><div class="scale-toolbar" id="scale-toolbar"></div><div class="trace-caption"><span id="trace-caption">10 s · Columnas secuenciales</span><span id="signal-state">Señal sintética · 500 muestras/s</span></div><details class="keyboard-help"><summary>Teclado y calibres</summary><p id="trace-keyboard-help">Con foco en el trazado: M/P/R cambia vista, V/G cambia escala, C activa calibres y espacio congela el monitor. Calibres: flechas mueven el extremo seleccionado una muestra horizontal o 0,01 mV vertical; Mayús mueve diez pasos. También puedes usar los campos de tiempo y amplitud. Tab sale del trazado.</p></details></section>
 <section id="beat-detail" class="beat-detail" aria-label="Ampliación del latido"><div class="detail-empty">Preparando análisis…</div></section>
 </div>
 <section id="comparison-lab" class="comparison-lab" aria-label="Laboratorio comparativo A/B"></section>
 <section class="lower-grid"><div id="inspector" class="inspector"></div><aside class="interpretation"><div class="section-label">Guía de lectura</div><h2 id="finding-title">Hallazgos esperados</h2><ul id="findings"></ul><div id="limitation" class="model-note"></div><div id="warnings"></div><button class="text-button" data-action="measurements">Ver medidas y valores del modelo ${icon("chevron")}</button><button class="text-button" data-action="about">Estado y referencias ${icon("chevron")}</button></aside></section>
 <footer class="workspace-footer"><span>ECG Lab · Laboratorio de electrocardiografía</span><span>Uso educativo. Sin validación clínica.</span></footer></main></div>
 <dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><input type="file" id="file-input" accept=".json,application/json" hidden/>`;

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
const comparison = new ComparisonLab($("#comparison-lab"), toast, {
  currentSynthetic: () => session.canExport && session.signal && session.measurement && (!quiz || quiz.answer)
    ? captureTrace(c, session.signal, session.measurement) : null,
  openExternal: () => { if (!quiz || quiz.answer) external.open(); },
  focusSynthetic: () => { $("#canvas-wrap").scrollIntoView({block:"center"}); $("#ecg").focus({preventScroll:true}); },
});
const external = new ExternalLab((slot, trace) => {
  comparison.acceptExternal(slot, trace);
  external.park();
  comparison.focus();
});

const activation = new ActivationLab(
  () => session.canExport && session.signal && (!quiz || quiz.answer)
    ? { case: c, beats: session.signal.events.beats } : null,
  (candidate, original) => {
    if (!session.canExport || (quiz && !quiz.answer) || JSON.stringify(c) !== JSON.stringify(original)) return false;
    c = cloneCase(candidate);
    caliper = null; session.resetTools(); annotations = false;
    renderCatalog(); renderControls(); renderInfo(); generate();
    return true;
  }, toast,
);

if (!location.hash) { const p=presetById(c.presetId); if(p) explorationOrigin=createExplorationOrigin(p,c); }
function currentPreset() {
  return caseContext(c).preset;
}
function renderCatalog() {
  const selectedId = currentPreset()?.id;
  const families = diagnosisFamilies(PRESETS, search, group, selectedId);
  const available = families.reduce((sum, family) => sum + family.available, 0);
  const entries = families.reduce((sum, family) => sum + family.availableEntries, 0);
  $("#catalog-count").textContent = `${entries} ${entries === 1 ? "patrón" : "patrones"} · ${available} ${available === 1 ? "ejemplo" : "ejemplos"}`;
  $("[data-action=clear-search]").hidden = !search && !group;
  $("#case-list").innerHTML = families.map(family =>
    `<section class="case-group"><h3>${esc(family.label)}<span>${family.entryCount}</span></h3>${family.sections.map(section =>
      `${section.title ? `<h4 class="case-subgroup">${esc(section.title)}</h4>` : ""}${section.entries.map(entry => {
        const {diagnosis, target, selected, matches} = entry;
        const pending = target.strategy === "pending";
        const multiple = diagnosis.variants.length > 1;
        const detail = pending ? "Pendiente" : search && matches.length === 1 && multiple
          ? `Coincide: ${diagnosis.variants.find(v => v.id === target.id)!.label}`
          : multiple ? `${diagnosis.variants.length} variantes` : "";
        return `<button type="button" class="case-button ${selected ? "selected" : ""}" data-diagnosis="${esc(diagnosis.id)}" data-preset="${esc(target.id)}" title="${esc(target.name)}" aria-label="${esc(diagnosis.title)}${detail ? ` · ${esc(detail)}` : ""}" ${pending ? "disabled" : ""} ${selected ? 'aria-current="true"' : ""}><span>${esc(diagnosis.title)}${detail ? `<small class="case-variants-count">${esc(detail)}</small>` : ""}</span>${selected ? icon("check") : multiple ? icon("chevron") : ""}</button>`;
      }).join("")}`
    ).join("")}</section>`
  ).join("") || '<div class="catalog-empty"><strong>No encontramos ese patrón</strong><p>Prueba con el nombre completo o una sigla como FA, BRI o WPW.</p></div>';
}
let renderedVariants = "";
function renderVariants(preset: Preset | undefined, concealed: boolean) {
  const navigation = $("#diagnosis-navigation");
  const content = $("#diagnosis-content");
  const diagnosis = preset && !concealed && !c.artifacts.reversed ? diagnosisForPreset(preset) : null;
  const multi = diagnosis && diagnosis.variants.length > 1;
  const key = multi ? `${diagnosis.id}/${preset!.id}` : "";
  navigation.hidden = !multi;
  if (key !== renderedVariants) {
    navigation.innerHTML = multi ? `<div class="variant-heading"><span id="variant-label">Variantes del patrón</span><small>Cambiar de variante carga su ejemplo original.</small></div><div class="variant-tabs" role="tablist" aria-labelledby="variant-label" data-activation="manual">${diagnosis.variants.map(v => `<button type="button" role="tab" id="variant-tab-${esc(v.id)}" data-variant="${esc(v.id)}" aria-selected="${v.id === preset!.id}" aria-controls="diagnosis-content" tabindex="${v.id === preset!.id ? 0 : -1}">${esc(v.label)}</button>`).join("")}</div>` : "";
    renderedVariants = key;
  }
  if (multi) {
    content.setAttribute("role", "tabpanel");
    content.setAttribute("aria-labelledby", `variant-tab-${preset!.id}`);
  } else {
    content.removeAttribute("role"); content.removeAttribute("aria-labelledby");
  }
}
function formatExplorationValue(value:unknown){if(typeof value==="boolean")return value?"Sí":"No";return value==null?"—":String(value)}
function renderExplorationContext(concealed:boolean){const root=$("#exploration-context"),changes=explorationOrigin?explorationChanges(explorationOrigin,c):[],custom=!!explorationOrigin&&changes.length>0&&!concealed;root.hidden=!custom;if(!custom){root.innerHTML="";return}root.innerHTML=`<div class="exploration-provenance"><span>Basada en: <strong>${esc(explorationOrigin!.presetName)}</strong></span><span class="exploration-count">${changes.length} ${changes.length===1?"ajuste":"ajustes"} respecto al ejemplo original</span></div><div class="exploration-actions"><button type="button" class="text-button" data-action="exploration-changes">Ver cambios</button><button type="button" class="text-button" data-action="compare-origin" ${explorationOriginTrace&&session.canExport?"":"disabled"}>Comparar con origen</button><button type="button" class="text-button" data-action="restore-origin">Restaurar origen</button></div><p>«Basada en» indica procedencia de la exploración; no diagnostica el trazado modificado.</p>`}
function showExplorationChanges(){if(!explorationOrigin)return;const changes=explorationChanges(explorationOrigin,c);openDialog("Cambios respecto al origen",`<p class="dialog-lead">Origen: <strong>${esc(explorationOrigin.presetName)}</strong>. Se muestran diferencias reales del modelo; la vista no cuenta como ajuste.</p><div class="measurement-table-wrap"><table><thead><tr><th>Parámetro</th><th>Origen</th><th>Actual</th></tr></thead><tbody>${changes.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(formatExplorationValue(x.before))}</td><td>${esc(formatExplorationValue(x.after))}</td></tr>`).join("")}</tbody></table></div><p class="control-note">Una acción puede cambiar varios parámetros coordinados; el recuento describe diferencias del estado resultante, no el número de clics.</p>`)}
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
  renderVariants(p, !!concealed);
  $("#case-category").textContent = concealed
    ? "PRÁCTICA"
    : customExploration ? "EXPLORACIÓN"
    : p ? familyLabel(p.group) : "Caso personalizado";
  $("#case-subtitle").textContent = concealed
    ? "Identifica el patrón. Puedes cambiar la vista y utilizar los calibres."
    : customExploration ? "Observa cómo los ajustes modifican el ejemplo de origen sin convertir su nombre en un diagnóstico del estado actual." : reading.subtitle;
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
  $("#limitation").innerHTML = concealed
    ? "El diagnóstico se mostrará al responder."
    : `<strong>${p?.strategy === "local" ? "Ajuste morfológico local" : "Modelo aproximado"}</strong><p>${esc(p?.limitation || "Sin validación clínica de este caso personalizado.")}</p>`;
  $("#warnings").innerHTML = (concealed ? [] : [...context.warnings, ...(session.signal?.warnings || [])])
    .map((w) => `<p class="warning">${esc(w)}</p>`)
    .join("");
  $<HTMLButtonElement>('[data-action="export"]').disabled = !!concealed;
  $("#inspector").hidden = !!concealed;
  $<HTMLButtonElement>('[data-action="parameters"]').disabled = !!concealed;
  $("#beat-detail").hidden = !!concealed;
  if (concealed) activation.invalidate();
  $("#catalog").classList.toggle("quiz-concealed", !!concealed);
}
function renderMetrics() {
  if (!session.signal || !session.measurement) return;
  $("#metrics").innerHTML = metricsHtml(metricCards(c, session.measurement));
  $("#monitor-rate").textContent = monitorRate(c, session.measurement);
}
function renderDetail() {
  if (session.signal && session.measurement)
    $("#beat-detail").innerHTML = beatDetail(
      session.signal,
      session.measurement,
      c,
      session.selectedBeat,
    );
}
function renderControls() {
  const previous = activePanel;
  $("#inspector").innerHTML = controls(c);
  setPanel(previous);
  renderScales();
}
function syncAmplitudeControls() {
  const state = amplitudeControlState(c);
  $<HTMLInputElement>('[data-key="st"]').disabled = state.stDisabled;
  $<HTMLInputElement>('[data-key="tAmp"]').disabled = state.tDisabled;
  $("#amplitude-note").textContent = state.note;
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
    paper
      ? select(
          "view.timing",
          "Registro",
          [
            ["sequential", "Secuencial"],
            ["simultaneous", "Simultáneo"],
          ],
          c.view.timing,
        )
      : ""
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
  }<div class="scale-toggles"><label class="toggle"><input type="checkbox" data-key="view.grid" ${c.view.grid ? "checked" : ""}/>Grilla</label>${!monitorMode ? `<label class="toggle"><input type="checkbox" data-key="view.fit" ${c.view.fit ? "checked" : ""}/>Ajustar al ancho</label>` : ""}</div>`;
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
  pause.disabled = !monitorMode || !ready;
  pause.setAttribute("aria-label", session.paused ? "Reanudar" : "Congelar");
  pause.innerHTML =
    icon(session.paused ? "play" : "pause") +
    `<span>${session.paused ? "Reanudar" : "Congelar"}</span>`;
  $("#monitor-state").textContent = !ready ? "SIN SEÑAL" : session.paused ? "CONGELADO" : "REPRODUCCIÓN";
  const waves = $<HTMLButtonElement>('[data-action="annotations"]');
  waves.disabled = !paper || !ready;
  waves.classList.toggle("active", ready && paper && annotations);
  waves.setAttribute("aria-pressed", String(ready && paper && annotations));
  $<HTMLButtonElement>('[data-action="focus"]').disabled = !ready;
  $<HTMLButtonElement>('[data-action="compare"]').disabled = !!quiz && !quiz.answer;
  $<HTMLButtonElement>('[data-action="external"]').disabled = !!quiz && !quiz.answer;
  $<HTMLButtonElement>('[data-action="activation"]').disabled = !ready || (!!quiz && !quiz.answer);
  $('[data-action="theme"]').setAttribute("aria-pressed", String(currentTheme() === "dark"));
  const caliperButton = $<HTMLButtonElement>('[data-action="caliper"]');
  caliperButton.disabled = monitorMode || !ready;
  caliperButton.classList.toggle("active", measuring);
  caliperButton.setAttribute("aria-pressed", String(measuring));
  $("#ecg").classList.toggle("measuring", measuring);
  caliperButton.title = monitorMode
    ? "Calibres disponibles en papel y tira de ritmo"
    : "Calibres por arrastre, teclado o campos numéricos";
  caliperEditor.update({active:measuring, layout, caliper, view:c.view, fs:session.signal?.fs ?? 500});
}
const controller = new SignalController(
  (next, measured, requestId) => {
    if (!session.isCurrentRequest(requestId)) return;
    const audited = auditMeasurement(next, measured);
    if (!session.accept(requestId, next, audited, c.view.mode,
      representativeBeat(audited, visibleSegmentEnd()))) return;
    comparison.update(c, next, audited);
    if(explorationOrigin&&sameExplorationModel(explorationOrigin,c)) explorationOriginTrace=captureTrace(c,next,audited);
    resetTracePresentation();
    $("#signal-loading").hidden = true;
    $("#signal-state").textContent = "500 muestras/s · análisis independiente";
    renderMetrics();
    renderQuiz();
    renderInfo();
    renderScales();
    draw();
    renderDetail();
  },
  (message, requestId) => {
    if (!session.fail(requestId)) return;
    toast(message);
    comparison.invalidate(message);
    showUnavailableSignal(message, true);
    $("#metrics").innerHTML =
      '<div class="loading-metrics">Medidas no disponibles</div>';
    $("#signal-state").textContent = message.startsWith("Fuera del alcance del modelo:")
      ? "Combinación fuera del alcance del modelo"
      : "No se pudo actualizar la señal";
    $("#beat-detail").innerHTML = '<div class="detail-empty">Ajusta los parámetros o restablece un caso para recuperar el trazado y sus medidas.</div>';
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
  $("#signal-state").textContent = "Generando…";
  $("#metrics").innerHTML = '<div class="loading-metrics">Generando señal…</div>';
  $("#monitor-rate").textContent = "—";
  $("#measurement-readout").hidden = true;
  $("#beat-detail").innerHTML = '<div class="detail-empty">El análisis estará disponible cuando termine de generarse la señal.</div>';
  $("#warnings").innerHTML = "";
  syncTraceTools();
}
function invalidateSignal() {
  activation.invalidate();
  clearToast();
  session.invalidate();
  comparison.invalidate();
  renderQuiz();
  showUnavailableSignal("Calculando señal…");
}
function generate() {
  window.clearTimeout(timer);
  timer = 0;
  invalidateSignal();
  // Worker messages are asynchronous; register the returned ID before delivery.
  session.expectRequest(controller.request(c));
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
    layout = renderPaper(canvas, session.signal, c, width, {
      annotations,
      measurement: session.measurement ?? undefined,
      selectedBeat: session.selectedBeat,
      hideName: !!quiz && !quiz.answer,
      displayName: caseReading(c).title,
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
  $("#trace-caption").textContent =
    c.view.mode === "paper"
      ? `10 s · ${c.view.timing === "simultaneous" ? "Segmentos simultáneos" : "Columnas secuenciales"} · ${c.view.fit ? "Papel ajustado al ancho" : "Escala física calibrada"}`
      : c.view.mode === "rhythm"
        ? `${c.view.duration} s · Tiras sucesivas de 10 s`
        : "Barrido continuo · reproducción de señal sintética";
  if (caliper && layout && session.caliperOn) drawCaliper(canvas, layout, caliper, c);
  caliperEditor.update({active:session.caliperOn, layout, caliper, view:c.view, fs:session.signal.fs});
}
function animate(t: number) {
  if (c.view.mode === "monitor" && monitor && !session.paused) {
    if (lastFrame) session.advance(Math.min(0.1, (t - lastFrame) / 1000), c.view.mode);
    monitor.frame(session.elapsed);
    if (audioOn && session.signal) {
      const seg = monitor.layout.segments[0],
        span = seg.duration,
        cycle = Math.floor(session.elapsed / span),
        source = ((cycle * span) % Math.max(1, 60 - span)) + (session.elapsed % span);
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
  explorationOrigin=createExplorationOrigin(p,c); explorationOriginTrace=null;
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
  setValue(key, Number(el.value));
  if (!key.startsWith("view.")) syncAmplitudeControls();
  const output = document.querySelector(`[data-output="${key}"]`);
  if (output)
    output.innerHTML = `${el.value} <small>${output.querySelector("small")?.textContent || ""}</small>`;
  if (key.startsWith("view.")) {
    if (key === "view.pxPerMm")
      $(".physical-ruler").setAttribute(
        "style",
        `width:${c.view.pxPerMm * 50}px`,
      );
    draw();
  } else {
    invalidateSignal();
    window.clearTimeout(timer);
    timer = window.setTimeout(generate, 130);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "detail-lead") {
    c.view.lead = el.value as ECGCase["view"]["lead"];
    renderDetail();
    return;
  }
  if (el.id === "category") {
    group = el.value;
    renderCatalog();
    return;
  }
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
    renderDetail();
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
function exportDialog() {
  openDialog(
    "Exportar y guardar",
    exportDialogHtml(c, session.canExport, savedCases()),
  );
}
function renderQuiz() {
  comparison.conceal(!!quiz && !quiz.answer);
  if (quiz && !quiz.answer) external.discard();
  const panel = $("#quiz-panel");
  panel.hidden = !quiz;
  if (!quiz) return;
  const q = quiz, feedback = q.answer ? practiceFeedback(q.preset.id as PracticeId, c, session.signal, session.measurement) : null;
  panel.innerHTML = `<div class="quiz-top"><strong>${q.answer ? (q.answer === q.preset.id ? "Coincide con el caso configurado" : "Compara los rasgos del ejercicio") : "¿Qué patrón representa este ejercicio?"}</strong><button data-action="end-quiz">Salir de práctica</button></div><div class="quiz-choices">${q.choices.map((p) => `<button data-answer="${p.id}" ${q.answer || !session.canExport ? "disabled" : ""} class="${q.answer && p.id === q.preset.id ? "correct" : q.answer === p.id ? "incorrect" : ""}">${esc(p.name)}</button>`).join("")}</div>${feedback ? `<div class="practice-feedback" role="status"><section><h3>Observaciones y estimaciones</h3><ul>${feedback.observations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section><section><h3>Referencia del ejercicio</h3><p><strong>${esc(q.preset.name)}</strong> · Etiqueta configurada, no diagnóstico automático.</p><p>${q.answer !== q.preset.id ? `Elegiste ${esc(presetById(q.answer!)?.name || "otra alternativa")}. ` : ""}Revisa ${esc(feedback.leads)}. ${esc(feedback.cue)}</p></section></div><div class="practice-limits">${feedback.limitations.map(x=>`<p>${esc(x)}</p>`).join("")}<p>Modelo aproximado. La puntuación compara tu opción con el ejercicio, no mide precisión clínica.</p></div>${btn("quiz", "Siguiente caso", "chevron", "primary")}` : `<p>Responde después de observar el ECG. Las referencias se muestran al contestar.</p>`}`;
}
function startQuiz() {
  const rng = new Uint32Array(2);
  crypto.getRandomValues(rng);
  const question = practiceQuestion(Array.from(rng));
  quiz = { preset: presetById(question.id)!, choices: question.choices.map(id=>presetById(id)!), answer: null };
  selectPreset(question.id);
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
  if (answer && quiz && !quiz.answer && session.canExport && quiz.choices.some(p=>p.id===answer.dataset.answer)) {
    quiz.answer = answer.dataset.answer!;
    renderQuiz();
    renderInfo();
    draw();
    return;
  }
  if (saved) {
    c = savedCases()[Number(saved.dataset.saved)];
    explorationOrigin=null; explorationOriginTrace=null;
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
    $<HTMLSelectElement>("#category").value = "";
    renderCatalog(); $("#case-search").focus();
  }
  if(action==="exploration-changes") showExplorationChanges();
  if(action==="restore-origin"&&explorationOrigin){c=restoreExplorationOrigin(explorationOrigin,c);caliper=null;session.resetTools();annotations=false;renderCatalog();renderControls();renderInfo();generate();toast("Origen restaurado; se conserva la vista actual.")}
  if(action==="compare-origin"&&explorationOriginTrace&&session.signal&&session.measurement&&session.canExport){comparison.compareSynthetic(explorationOriginTrace,captureTrace(c,session.signal,session.measurement));comparison.focus();}
  if (action === "parameters") {
    if (quiz && !quiz.answer) return;
    $("#inspector").scrollIntoView({block:"start"}); $("#inspector").focus({preventScroll:true});
  }
  if (action === "activation" && (!quiz || quiz.answer)) activation.open();
  if (action === "compare" && (!quiz || quiz.answer)) comparison.focus();
  if (action === "external" && (!quiz || quiz.answer)) external.open();
  if (action === "focus") {
    annotations = true;
    draw();
    $("#beat-detail").scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  if (action === "previous-beat" || action === "next-beat") {
    if (session.measurement) {
      session.selectBeat(session.selectedBeat + (action === "next-beat" ? 1 : -1));
      annotations = true;
      renderDetail();
      draw();
    }
  }
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
    renderDetail();
  }
  if(action==="reset"){if(explorationOrigin&&explorationChanges(explorationOrigin,c).length){c=restoreExplorationOrigin(explorationOrigin,c);caliper=null;session.resetTools();annotations=false;renderCatalog();renderControls();renderInfo();generate();toast("Origen restaurado; se conserva la vista actual.")}else{selectPreset(c.presetId==="custom"?"sinus":c.presetId);toast("Parámetros restablecidos")}}
  if (action === "catalog") $("#catalog").classList.toggle("open");
  if (action === "close-catalog") $("#catalog").classList.remove("open");
  if (action === "about") showAbout();
  if (action === "measurements") showMeasurements();
  if (action === "export") exportDialog();
  if (action === "close-dialog") closeDialog();
  if (action === "quiz") startQuiz();
  if (action === "end-quiz") {
    quiz = null;
    renderQuiz();
    renderInfo();
    draw();
  }
  if (action === "png") {
    if (!session.signal || !session.canExport) {
      toast("El PNG estará disponible al generar correctamente la señal.");
      return;
    }
    const canvas = document.createElement("canvas"),
      exportCase = cloneCase(c);
    exportCase.view.palette = "paper";
    renderPaper(canvas, session.signal, exportCase, 1000, {
      pxPerMm: 300 / 25.4,
      ratio: 1,
      hideName: !!quiz && !quiz.answer,
      displayName: caseReading(c).title,
    });
    canvas.toBlob(async (blob) => {
      if (blob) {
        download(await pngWithDpi(blob, 300), "ecg-lab-300dpi.png");
        toast("PNG exportado a 300 dpi");
      }
    }, "image/png");
  }
  if (action === "json") {
    download(
      new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }),
      "ecg-lab-caso.json",
    );
    toast("Caso JSON exportado");
  }
  if (action === "import") $<HTMLInputElement>("#file-input").click();
  if (action === "share") {
    const url = location.origin + location.pathname + encodeCase(c);
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace del caso copiado");
    } catch {
      openDialog(
        "Enlace del caso",
        `<p>Copia este enlace:</p><textarea readonly rows="5">${esc(url)}</textarea>`,
      );
    }
  }
  if (action === "save") {
    const name = $<HTMLInputElement>("#save-name").value.trim();
    if (!name) {
      toast("Escribe un nombre para el caso");
      return;
    }
    const copy = cloneCase(c);
    copy.name = name;
    try {
      saveCase(copy);
      toast("Caso guardado en este navegador");
      exportDialog();
    } catch {
      toast("No se pudo guardar. Exporta el caso como JSON.");
    }
  }
});
$<HTMLInputElement>("#file-input").addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement,
    f = el.files?.[0];
  if (!f) return;
  try {
    if (f.size > 50000)
      throw new Error("El caso excede el tamaño máximo de 50 kB.");
    c = normalizeImportedCase(JSON.parse(await f.text()));
    explorationOrigin=null; explorationOriginTrace=null;
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
      renderDetail();
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
      c = next;
      explorationOrigin=null; explorationOriginTrace=null;
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
