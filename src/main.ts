import "./style.css";
import { APP_VERSION } from "./ui/version";
import {
  DEFAULT_CASE,
  cloneCase,
  type ECGCase,
} from "./engine/types";
import { SignalController } from "./ui/signal-controller";
import { TraceSession } from "./ui/trace-session";
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
  filterLabel,
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
let initialError = "";
try {
  c = decodeCase(location.hash) || c;
} catch (e) {
  initialError = (e as Error).message;
}
const root = $("#app");
root.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="ECG Lab, inicio">${icon("pulse")}<span>ECG<span class="brand-light">lab</span></span><span class="brand-divider"></span><small>Laboratorio de electrocardiografía</small></a><nav aria-label="Herramientas"><button class="btn mobile-cases" data-action="catalog">${icon("menu")}<span>Casos</span></button>${btn("quiz", "Practicar", "quiz")}${btn("about", "Modelo", "book")}${btn("theme", "Tema", "sun", "icon-button")}${btn("export", "Exportar", "download", "primary")}</nav></header>
 <div class="app-layout"><aside class="sidebar" id="catalog"><div class="sidebar-head"><div><h2>Casos clínicos</h2><span>${PRESETS.filter((x) => x.strategy !== "pending").length} patrones sintéticos</span></div>${btn("close-catalog", "Cerrar", "close", "mobile-cases icon-button")}</div><label class="search-box">${icon("search")}<input id="case-search" type="search" placeholder="Buscar un patrón…" aria-label="Buscar caso"/></label><label class="category-select"><span class="sr-only">Categoría</span><select id="category">${options([["", "Todas las categorías"], ...Array.from(new Set(PRESETS.map((x) => x.group))).map((x) => [x, x] as [string, string])], "")}</select></label><div id="case-list" class="case-list"></div><div class="sidebar-footer">${icon("pulse")}<div>Señal 100% sintética<small data-product-version="${APP_VERSION}">Modelo educativo · v${APP_VERSION}</small></div></div></aside>
 <main class="workspace"><section class="case-heading"><div><div class="case-category" id="case-category">RITMOS</div><h1 id="case-title">Ritmo sinusal</h1><p id="case-subtitle">Activación auricular sinusal seguida de conducción AV 1:1.</p></div><div class="case-state"><span class="status-label">Prototipo educativo</span>${btn("reset", "Restablecer", "reset", "subtle")}</div></section>
 <section id="metrics" class="metrics" aria-label="Medidas del ECG"><div class="loading-metrics">Generando señal…</div></section>
 <section class="trace-panel" aria-label="Trazado electrocardiográfico"><div class="trace-toolbar"><div class="view-tabs" role="tablist" aria-label="Vista del ECG"><button role="tab" data-mode="paper" aria-selected="true">${icon("grid")}12 derivaciones</button><button role="tab" data-mode="monitor" aria-selected="false">${icon("monitor")}Monitor</button><button role="tab" data-mode="rhythm" aria-selected="false">${icon("strip")}Tira de ritmo</button></div><div class="trace-tools">${btn("caliper", "Calibres", "ruler")}${btn("annotations", "Ondas", "eye")}${btn("focus", "Ampliar", "search")}${btn("pause", "Congelar", "pause")}</div></div>
 <div id="quiz-panel" hidden></div><div class="monitor-vitals" id="monitor-vitals" hidden><div><span>FRECUENCIA VENTRICULAR</span><strong id="monitor-rate">72</strong><small>lpm</small></div><div class="monitor-controls">${btn("sound", "Sonido", "volume")}<span id="monitor-state">REPRODUCCIÓN</span></div></div>
 <div class="canvas-scroll" id="canvas-wrap"><canvas id="ecg" role="img" aria-label="ECG sintético de 12 derivaciones"></canvas><div class="signal-loading" id="signal-loading" aria-live="polite">Calculando señal…</div></div>
 <div id="measurement-readout" class="caliper-readout" hidden></div><div class="scale-toolbar" id="scale-toolbar"></div><div class="trace-caption"><span id="trace-caption">10 s · Columnas secuenciales</span><span id="signal-state">Señal sintética · 500 muestras/s</span></div></section>
 <section id="beat-detail" class="beat-detail" aria-label="Ampliación del latido"><div class="detail-empty">Preparando análisis…</div></section>
 <section class="lower-grid"><div id="inspector" class="inspector"></div><aside class="interpretation"><div class="section-label">LECTURA DEL CASO</div><h2 id="finding-title">Hallazgos esperados</h2><ul id="findings"></ul><div id="limitation" class="model-note"></div><div id="warnings"></div><button class="text-button" data-action="measurements">Ver medidas y valores del modelo ${icon("chevron")}</button><button class="text-button" data-action="about">Estado y referencias ${icon("chevron")}</button></aside></section>
 <footer class="workspace-footer"><span>Motor paramétrico vectorial · Dower + identidades de Einthoven/Goldberger</span><span>Uso educativo. Sin validación clínica.</span></footer></main></div>
 <dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><input type="file" id="file-input" accept=".json,application/json" hidden/>`;

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
function currentPreset() {
  return caseContext(c).preset;
}
function renderCatalog() {
  const selectedId = currentPreset()?.id;
  const matching = PRESETS.filter(
    (p) =>
      (!group || p.group === group) &&
      `${p.name} ${p.short}`.toLocaleLowerCase("es").includes(search),
  );
  $("#case-list").innerHTML =
    Array.from(new Set(matching.map((p) => p.group)))
      .map(
        (g) =>
          `<section class="case-group"><h3>${g}</h3>${matching
            .filter((p) => p.group === g)
            .map(
              (p) =>
                `<button class="case-button ${selectedId === p.id ? "selected" : ""}" data-preset="${p.id}" ${p.strategy === "pending" ? "disabled" : ""} ${selectedId === p.id ? 'aria-current="true"' : ""}><span>${p.short}</span>${p.strategy === "pending" ? "<small>Pendiente</small>" : selectedId === p.id ? icon("check") : ""}</button>`,
            )
            .join("")}</section>`,
      )
      .join("") || '<p class="empty">No se encontraron casos.</p>';
}
function renderInfo() {
  const context = caseContext(c),
    reading = caseReading(c, context),
    p = context.preset,
    concealed = quiz && !quiz.answer;
  $("#case-title").textContent = concealed ? "Interpreta este ECG" : reading.title;
  $("#case-category").textContent = concealed
    ? "PRÁCTICA"
    : p?.group || "CASO PERSONALIZADO";
  $("#case-subtitle").textContent = concealed
    ? "Identifica el patrón. Puedes cambiar la vista y utilizar los calibres."
    : reading.subtitle;
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
  $("#beat-detail").hidden = !!concealed;
  $("#catalog").classList.toggle("quiz-concealed", !!concealed);
}
function display(v: number | null | undefined, unit = "") {
  return v == null || !Number.isFinite(v)
    ? "—"
    : Math.round(v) + (unit ? `<small>${unit}</small>` : "");
}
function renderMetrics() {
  if (!session.signal || !session.measurement) return;
  const noOrganized = ["vf", "asystole"].includes(c.rhythm),
    hasPR =
      (c.rhythm === "sinus" && c.av !== "complete") ||
      (c.rhythm === "paced" && c.pacing !== "VVI");
  const vals: [string, string, string][] = [
    [
      "FC ventricular",
      noOrganized || session.measurement.evidence.hr.status === "unavailable"
        ? "—"
        : display(session.measurement.hr, "lpm"),
      "media · 10 s",
    ],
    [
      "PR",
      hasPR ? display(session.measurement.pr, "ms") : "—",
      hasPR ? "estimado" : "sin relación AV estimable",
    ],
    [
      "QRS",
      noOrganized || session.measurement.evidence.qrs.status === "unavailable"
        ? "—"
        : display(session.measurement.qrs, "ms"),
      "límites medidos",
    ],
    [
      "QTc",
      noOrganized ||
      session.measurement.evidence.qt.status === "unavailable" ||
      ["af", "flutter", "torsades"].includes(c.rhythm)
        ? "—"
        : display(session.measurement.qtc.fridericia, "ms"),
      "Fridericia · estimado",
    ],
    [
      "Eje QRS",
      noOrganized ? "—" : display(session.measurement.axis, "°"),
      "área neta · estimado",
    ],
  ];
  $("#metrics").innerHTML = vals
    .map(
      ([label, v, sub], i) =>
        `<button class="metric ${i === 0 ? "main-metric" : ""}" data-action="measurements" title="${esc(session.measurement!.evidence[(["hr", "pr", "qrs", "qt", "axis"] as const)[i]].reason)}"><span>${label}</span><strong>${v}</strong><small><i class="quality-dot ${session.measurement!.evidence[(["hr", "pr", "qrs", "qt", "axis"] as const)[i]].status}"></i>${session.measurement!.evidence[(["hr", "pr", "qrs", "qt", "axis"] as const)[i]].status === "unavailable" ? "No estimable" : session.measurement!.evidence[(["hr", "pr", "qrs", "qt", "axis"] as const)[i]].status === "review" ? "Revisar" : sub}</small></button>`,
    )
    .join("");
  $("#monitor-rate").textContent =
    noOrganized || session.measurement.evidence.hr.status === "unavailable"
      ? "—"
      : String(Math.round(session.measurement.hr ?? 0));
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
  const caliperButton = $<HTMLButtonElement>('[data-action="caliper"]');
  caliperButton.disabled = monitorMode || !ready;
  caliperButton.classList.toggle("active", measuring);
  caliperButton.setAttribute("aria-pressed", String(measuring));
  $("#ecg").classList.toggle("measuring", measuring);
  caliperButton.title = monitorMode
    ? "Calibres disponibles en papel y tira de ritmo"
    : "Arrastra sobre una derivación para medir";
}
const controller = new SignalController(
  (next, measured, requestId) => {
    if (!session.isCurrentRequest(requestId)) return;
    const audited = auditMeasurement(next, measured);
    if (!session.accept(requestId, next, audited, c.view.mode,
      representativeBeat(audited, visibleSegmentEnd()))) return;
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
  clearToast();
  session.invalidate();
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
  if (caliper && layout) {
    const m = drawCaliper(canvas, layout, caliper, c);
    $("#measurement-readout").hidden = false;
    $("#measurement-readout").innerHTML =
      `<strong>Δt ${m.ms.toFixed(0)} ms</strong><span>ΔV ${m.mv.toFixed(2)} mV · ${m.mm.toFixed(1)} mm</span><span>60.000 / Δt = ${m.ms > 0 ? (60000 / m.ms).toFixed(0) : "—"} lpm</span><button data-action="clear-caliper">Limpiar</button>`;
  } else {
    $("#measurement-readout").hidden = !session.caliperOn;
    $("#measurement-readout").textContent = session.caliperOn
      ? "Arrastra dentro de una derivación para medir tiempo y amplitud."
      : "";
  }
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

function openDialog(title: string, body: string) {
  $("#dialog-content").innerHTML =
    `<div class="dialog-head"><h2>${title}</h2><button class="btn icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div>${body}`;
  $<HTMLDialogElement>("#dialog").showModal();
}
function closeDialog() {
  $<HTMLDialogElement>("#dialog").close();
}
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
    `<div class="about-intro"><div>${icon("pulse")}<h3>Un ECG construido desde la señal</h3><p>Activaciones auriculares y ventriculares → kernels vectoriales XYZ → 8 derivaciones independientes → filtros → 12 derivaciones. No utiliza trazados grabados ni imágenes de pacientes.</p></div></div><h3>Alcance de esta versión</h3><ul class="about-list"><li>Todos los patrones son aproximaciones educativas. Las pruebas técnicas no constituyen validación clínica.</li><li>Modelo de dipolo único inspirado en ECGSYN y Clifford. No es un modelo celular, de torso individual ni una implementación literal de ECGSYN.</li><li>V7–V9 y V3R–V4R; marcapasos a demanda; captura/fusión en TV; comienzo corto–largo–corto de torsades; flutter variable: pendientes.</li><li>Medición automática heurística. En casos complejos utiliza calibres y comparación con eventos; PR/QT pueden no ser estimables. Los límites medidos se muestran por latido; una auditoría contra los mismos latidos sintéticos comprueba cada límite y retira resultados discordantes, sin sustituir las medidas por valores del generador.</li><li>Monitor: barrido de un buffer sintético reproducible. Se vuelve a usar el buffer durante sesiones largas; cambios de parámetros reinician la señal.</li><li>Paso alto diagnóstico causal de 0,05 Hz y antialias FIR centrado antes de reducir a 500 Hz. El paso alto de 2 Hz permite explorar distorsión del ST. La interferencia de red se configura aparte del notch.</li></ul><h3>Lectura clínica</h3><p class="dialog-lead">Describe primero el patrón observado. Integra territorio, reciprocidad, proporcionalidad respecto del QRS y contexto; la etiqueta del caso no demuestra una arteria ocluida. Las fases son estados paramétricos y no una cronología de un paciente. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10691881/" target="_blank" rel="noopener">ACC 2022: patrones isquémicos y contexto.</a></p><h3>Fundamentos de la señal</h3><p class="dialog-lead">QT con memoria exponencial de RR (≈40 s), activación auricular en dos componentes y T asimétrica. Transición de lesión durante el final del QRS para conservar el nivel de ST en J. Son aproximaciones educativas, no un modelo de potenciales celulares.</p><h3>Referencias</h3><ol class="references"><li><a href="https://physionet.org/content/ecgsyn/1.0.0/" target="_blank" rel="noopener">McSharry et al. ECGSYN (2003)</a> · Ritmo, variabilidad y generación sintética.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2927500/" target="_blank" rel="noopener">Clifford, Nemati y Sameni (2010)</a> · Modelo vectorial de ritmos anormales.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9106114/" target="_blank" rel="noopener">Vondrak et al. (2022), tabla 2</a> · Matriz inversa de Dower; comprobación algebraica indirecta de los coeficientes.</li><li><a href="https://www.ahajournals.org/doi/10.1161/circulationaha.108.191095" target="_blank" rel="noopener">AHA/ACCF/HRS (2009), parte III</a> · Trastornos de conducción intraventricular.</li><li><a href="https://www.ahajournals.org/doi/10.1161/circulationaha.106.180200" target="_blank" rel="noopener">AHA/ACCF/HRS (2007), parte I</a> · Tecnología y estandarización del ECG.</li><li><a href="https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag101/8766309" target="_blank" rel="noopener">Quinta Definición Universal de Infarto (2026)</a> · Tabla 5, criterios electrocardiográficos y limitaciones diagnósticas.</li></ol><p class="control-note"><a href="https://link.springer.com/article/10.1007/s10928-018-9587-8" target="_blank" rel="noopener">Malik et al. (2018): historia de RR y adaptación del QT</a> · <a href="https://link.springer.com/article/10.1186/1471-2261-5-29" target="_blank" rel="noopener">Hunt (2005): métodos y sesgo de medición de QT</a></p><h3>Estado por patrón</h3><div class="status-table"><table><thead><tr><th>Patrón</th><th>Estado / estrategia</th><th>Límite</th></tr></thead><tbody>${PRESETS.map((p) => `<tr><td>${p.name}</td><td>${p.strategy === "pending" ? "Pendiente" : p.strategy === "local" ? "Aproximado · ajuste local" : "Aproximado · vectorial"}</td><td>${p.limitation}</td></tr>`).join("")}</tbody></table></div>`,
  );
}
function exportDialog() {
  openDialog(
    "Exportar y guardar",
    `<p class="dialog-lead">Conserva el trazado o comparte exactamente el mismo caso y semilla.</p><div class="export-options"><button data-action="png" ${session.canExport ? "" : "disabled"}>${icon("download")}<div><strong>PNG de impresión</strong><span>Papel completo · 300 píxeles por pulgada</span></div>${icon("chevron")}</button><button data-action="json">${icon("save")}<div><strong>Exportar caso JSON</strong><span>Parámetros, vista y semilla reproducible</span></div>${icon("chevron")}</button><button data-action="import">${icon("book")}<div><strong>Importar caso JSON</strong><span>Carga un caso exportado desde ECG Lab</span></div>${icon("chevron")}</button><button data-action="share">${icon("share")}<div><strong>Copiar enlace del caso</strong><span>El estado completo viaja en el enlace</span></div>${icon("chevron")}</button></div><div class="save-form"><label class="field"><span>Nombre del caso personal</span><input id="save-name" maxlength="100" value="${esc(c.name)}"/></label>${btn("save", "Guardar en este navegador", "save")}</div>${
      savedCases().length
        ? `<h3>Mis casos</h3><div class="saved-list">${savedCases()
            .map(
              (x, i) =>
                `<button data-saved="${i}">${esc(x.name)}${icon("chevron")}</button>`,
            )
            .join("")}</div>`
        : ""
    }`,
  );
}
function renderQuiz() {
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
    preset = target.closest<HTMLElement>("[data-preset]"),
    panel = target.closest<HTMLElement>("[data-panel]"),
    mode = target.closest<HTMLElement>("[data-mode]"),
    answer = target.closest<HTMLElement>("[data-answer]"),
    saved = target.closest<HTMLElement>("[data-saved]");
  if (preset) {
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
    draw();
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
    document.documentElement.classList.toggle("dark");
    c.view.palette = document.documentElement.classList.contains("dark")
      ? "dark"
      : "paper";
    draw();
    renderDetail();
  }
  if (action === "reset") {
    selectPreset(c.presetId === "custom" ? "sinus" : c.presetId);
    toast("Parámetros restablecidos");
  }
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
  caliper = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, segment: i };
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  draw();
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging || !caliper || !layout) return;
  const pos = pointer(e);
  if (!pos) return;
  const seg = layout.segments[caliper.segment];
  caliper.x2 = Math.max(seg.x, Math.min(seg.x + seg.width, pos.x));
  caliper.y2 = Math.max(seg.y, Math.min(seg.y + seg.height, pos.y));
  draw();
});
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointercancel", () => (dragging = false));
document.addEventListener("keydown", (e) => {
  if (
    (e.target as HTMLElement).matches("input,select,textarea") ||
    $<HTMLDialogElement>("#dialog").open
  )
    return;
  if (e.code === "Space" && c.view.mode === "monitor") {
    e.preventDefault();
    $<HTMLButtonElement>('[data-action="pause"]').click();
  }
  if (e.key === "m") $<HTMLButtonElement>('[data-mode="monitor"]').click();
  if (e.key === "p") $<HTMLButtonElement>('[data-mode="paper"]').click();
  if (e.key === "r") $<HTMLButtonElement>('[data-mode="rhythm"]').click();
  if (e.key === "v") {
    const a = [12.5, 25, 50];
    c.view.speed = a[(a.indexOf(c.view.speed) + 1) % 3];
    renderScales();
    draw();
  }
  if (e.key === "g") {
    const a = [2.5, 5, 10, 20];
    c.view.gain = a[(a.indexOf(c.view.gain) + 1) % 4];
    c.view.chestGain = c.view.gain;
    renderScales();
    draw();
  }
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
