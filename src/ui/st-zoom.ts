import type { Lead, Signal } from "../engine/types";
import { LEADS } from "../engine/types";
import { stMarks, ST_LENS, type StMark } from "../render/st-lens";
import { dominantBeats } from "./structured-description";
import { esc } from "./helpers";

const SPEED = 50, GAIN = 10, BEFORE = 0.16, AFTER = 0.62, RANGE_MV = 1.3, HEADER_PX = 52;
const mmText = (mv: number) => `${mv >= 0 ? "+" : "−"}${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;
const msText = (s: number) => { const v = Math.round(s * 1000); return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ms`; };

/** Select once in the opening lead, then retain that event across every lead. */
export function stZoomMark(s: Signal, lead: Lead, beat?: number): StMark | null {
  // The paper displays the first 10 s: the chosen event can be located there.
  const end = Math.min(10, s.leads.I.length / s.fs);
  const marks = stMarks(s, lead, BEFORE + 0.05, end - AFTER);
  if (beat !== undefined) return marks.find((m) => m.beat === beat) ?? null;
  const dominant = new Set(dominantBeats(s));
  const eligible = marks.filter((m) => dominant.has(m.beat)).sort((a, b) => a.j0 - b.j0);
  return eligible.length ? eligible[Math.floor(eligible.length / 2)] : null;
}
/** Lead whose representative ST deviates most; selection does not diagnose a cause. */
export function defaultZoomLead(s: Signal): Lead {
  let best: Lead = "V2", value = -1;
  for (const lead of LEADS) { const m = stZoomMark(s, lead); if (m && Math.abs(m.j0) > value) { value = Math.abs(m.j0); best = lead; } }
  return best;
}

export function stZoomHtml(lead: Lead): string {
  return `<div class="st-zoom"><button type="button" class="text-button st-distribution-link" data-action="st-distribution">Ver distribución del ST en las 12 derivaciones</button><div class="st-zoom-leads" role="group" aria-label="Derivación">${LEADS.map((l) => `<button type="button" class="btn${l === lead ? " active" : ""}" data-zoom-lead="${l}" aria-pressed="${l === lead}">${l}</button>`).join("")}</div>` +
    `<p class="st-zoom-event"></p><canvas class="st-zoom-canvas" tabindex="0" role="img" aria-label="Latido ampliado de ${esc(lead)} con el punto J y el ST marcados" aria-describedby="st-zoom-scale st-zoom-values st-zoom-clip st-zoom-readout"></canvas>` +
    `<p class="st-zoom-clip" id="st-zoom-clip" hidden></p><dl class="st-zoom-values" id="st-zoom-values"></dl>` +
    `<p class="st-zoom-scale" id="st-zoom-scale">50 mm/s · 10 mm/mV: cada cuadro pequeño son 20 ms y 0,1 mV. Niveles respecto del segmento PR (franja gris). J indica el final del QRS del modelo.</p>` +
    `<output class="st-zoom-readout" id="st-zoom-readout" aria-live="polite"></output>` +
    `<button type="button" class="text-button" data-zoom-clear>Borrar puntos</button></div>`;
}

interface Palette { bg: string; fine: string; bold: string; trace: string; text: string; sdst: string; idst: string }
/** A view of the original samples: lead changes retain the same model event. */
export function mountStZoom(root: HTMLElement, s: Signal, initialLead: Lead, palette: Palette, requestedBeat?: number) {
  const canvas = root.querySelector<HTMLCanvasElement>(".st-zoom-canvas")!, out = root.querySelector<HTMLOutputElement>(".st-zoom-readout")!;
  const initial = stZoomMark(s, initialLead, requestedBeat);
  if (!initial) { out.textContent = "Esta derivación no tiene complejos organizados para ampliar."; canvas.hidden = true; return; }
  const beat = initial.beat, fs = s.fs, t0 = s.events.beats[beat].time - BEFORE, t1 = initial.jTime + AFTER;
  const widthMm = (t1 - t0) * SPEED, heightMm = 2 * RANGE_MV * GAIN;
  let lead = initialLead, mark = initial, a = s.leads[lead], cssWidth = 0, px = 0, dpr = 1;
  const points: number[] = [];
  root.dataset.zoomBeat = String(beat);
  root.querySelector<HTMLElement>(".st-zoom-event")!.textContent = `QRS ${beat + 1} · inicio a ${s.events.beats[beat].time.toFixed(3).replace(".", ",")} s del registro · mismo latido en todas las derivaciones`;
  const X = (t: number) => (t - t0) * SPEED * px, Y = (mv: number) => HEADER_PX + (RANGE_MV - (mv - mark.prLevel)) * GAIN * px;
  const at = (t: number) => a[Math.max(0, Math.min(a.length - 1, Math.round(t * fs)))];
  const sampleTime = (t: number) => Math.max(Math.ceil(t0 * fs), Math.min(Math.floor(t1 * fs), Math.round(t * fs))) / fs;
  const draw = (hover?: number) => {
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, cssWidth, heightMm * px + HEADER_PX);
    for (let mm = 0; mm <= Math.max(widthMm, heightMm); mm++) {
      ctx.strokeStyle = mm % 5 ? palette.fine : palette.bold; ctx.lineWidth = mm % 5 ? 0.6 : 1;
      if (mm <= widthMm) { ctx.beginPath(); ctx.moveTo(mm * px, HEADER_PX); ctx.lineTo(mm * px, heightMm * px + HEADER_PX); ctx.stroke(); }
      if (mm <= heightMm) { ctx.beginPath(); ctx.moveTo(0, HEADER_PX + mm * px); ctx.lineTo(cssWidth, HEADER_PX + mm * px); ctx.stroke(); }
    }
    const p0 = s.events.beats[beat].time + ST_LENS.prFromS, p1 = s.events.beats[beat].time + ST_LENS.prToS;
    ctx.fillStyle = "rgba(120,130,140,0.18)"; ctx.fillRect(X(p0), HEADER_PX, X(p1) - X(p0), heightMm * px);
    ctx.setLineDash([6, 4]); ctx.strokeStyle = palette.text; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(mark.prLevel)); ctx.lineTo(cssWidth, Y(mark.prLevel)); ctx.stroke();
    ctx.font = "12px 'DM Sans', sans-serif";
    // Separate rows remain legible even when J+60 and J+80 are only a few pixels apart.
    for (const [dt, label, row] of [[0, "J", 0], [ST_LENS.j60S, "J+60", 1], [0.08, "J+80", 2]] as const) {
      const x = X(mark.jTime + dt);
      ctx.strokeStyle = dt === 0 ? palette.sdst : palette.text; ctx.beginPath(); ctx.moveTo(x, HEADER_PX); ctx.lineTo(x, heightMm * px + HEADER_PX); ctx.stroke();
      const w = ctx.measureText(label).width + 6;
      ctx.fillStyle = palette.bg; ctx.fillRect(x + 1, row * 16 + 1, w, 15);
      ctx.fillStyle = palette.text; ctx.fillText(label, x + 3, 13 + row * 16);
    }
    ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(0, HEADER_PX, cssWidth, heightMm * px); ctx.clip();
    ctx.strokeStyle = palette.trace; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = Math.floor(t0 * fs); i <= Math.ceil(t1 * fs); i++) { const x = X(i / fs), y = Y(a[i]); i === Math.floor(t0 * fs) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    // Only markers on the trace; numeric labels live in DOM, away from each other.
    for (const dt of [0, ST_LENS.j60S]) {
      const x = X(mark.jTime + dt), v = at(mark.jTime + dt) - mark.prLevel, y = Y(mark.prLevel + v);
      ctx.fillStyle = v >= 0 ? palette.sdst : palette.idst; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    const dot = (t: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(t), Y(at(t)), 5, 0, Math.PI * 2); ctx.fill(); };
    points.forEach((t, i) => dot(t, i ? "#b06a00" : "#0b7a75"));
    if (points.length === 2) { ctx.strokeStyle = "#b06a00"; ctx.beginPath(); ctx.moveTo(X(points[0]), Y(at(points[0]))); ctx.lineTo(X(points[1]), Y(at(points[1]))); ctx.stroke(); }
    if (hover !== undefined) { ctx.strokeStyle = "rgba(11,122,117,0.5)"; ctx.beginPath(); ctx.moveTo(X(hover), HEADER_PX); ctx.lineTo(X(hover), heightMm * px + HEADER_PX); ctx.stroke(); }
    ctx.restore();
  };
  const describe = (t: number) => `${msText(t - mark.jTime)} desde J, nivel ${mmText(at(t) - mark.prLevel)}`;
  const report = (hover?: number) => {
    const parts = points.map((t, i) => `Punto ${i + 1}: ${describe(t)}`);
    if (points.length === 2) parts.push(`Diferencia: ${Math.round(Math.abs(points[1] - points[0]) * 1000)} ms, ${mmText(at(points[1]) - at(points[0]))}`);
    if (!points.length && hover !== undefined) parts.push(`Cursor: ${describe(hover)}`);
    out.textContent = parts.join(" · ") || "Clic para marcar puntos. Con el gráfico enfocado: flechas para mover el cursor, Intro para marcar y Escape para borrar. Dos puntos miden su diferencia.";
  };
  const updateLead = () => {
    root.dataset.selectedLead = lead;
    canvas.setAttribute("aria-label", `${lead}, QRS ${beat + 1}, inicio ${s.events.beats[beat].time.toFixed(3)} s; J y ST respecto de PR`);
    root.querySelectorAll<HTMLButtonElement>("[data-zoom-lead]").forEach((button) => { const active = button.dataset.zoomLead === lead; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    root.querySelector<HTMLElement>(".st-zoom-values")!.innerHTML = [["J · muestra", at(mark.jTime) - mark.prLevel], ["J · media de 10 ms", mark.j0], ["J+60 · muestra", mark.j60]].map(([label, value]) => `<div><dt>${label}</dt><dd>${mmText(Number(value))}</dd></div>`).join("");
    let clipped = false;
    for (let i = Math.floor(t0 * fs); i <= Math.ceil(t1 * fs); i++) if (Math.abs(a[i] - mark.prLevel) > RANGE_MV) { clipped = true; break; }
    const warning = root.querySelector<HTMLElement>(".st-zoom-clip")!;
    warning.hidden = !clipped;
    warning.textContent = "Recorte vertical: parte del complejo supera ±1,3 mV respecto de PR. La escala se conserva para medir el ST; consulta el complejo completo en el papel.";
    draw(); report();
  };
  const resize = () => {
    const next = Math.min(root.clientWidth || 640, 820), nextDpr = window.devicePixelRatio || 1;
    if (next === cssWidth && nextDpr === dpr) return;
    cssWidth = next; px = cssWidth / widthMm; dpr = nextDpr;
    canvas.style.width = `${cssWidth}px`; canvas.style.height = `${heightMm * px + HEADER_PX}px`;
    canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round((heightMm * px + HEADER_PX) * dpr);
    draw();
  };
  const timeOf = (e: MouseEvent) => { const rect = canvas.getBoundingClientRect(); return sampleTime(t0 + (e.clientX - rect.left - canvas.clientLeft) / canvas.clientWidth * (t1 - t0)); };
  const addPoint = (t: number) => { if (points.length === 2) points.length = 0; points.push(t); draw(); report(); };
  canvas.addEventListener("pointermove", (e) => { const t = timeOf(e); draw(t); report(t); });
  canvas.addEventListener("pointerleave", () => { draw(); report(); });
  canvas.addEventListener("click", (e) => addPoint(timeOf(e)));
  let cursor = sampleTime(mark.jTime);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); cursor = sampleTime(cursor + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5 : 1) / fs); draw(cursor); report(cursor); }
    if (e.key === "Enter") { e.preventDefault(); addPoint(cursor); }
    if (e.key === "Escape" && points.length) { e.preventDefault(); e.stopPropagation(); points.length = 0; draw(); report(); }
  });
  root.querySelector("[data-zoom-clear]")?.addEventListener("click", () => { points.length = 0; draw(); report(); });
  root.querySelectorAll<HTMLButtonElement>("[data-zoom-lead]").forEach((button) => button.addEventListener("click", () => {
    const next = button.dataset.zoomLead as Lead, nextMark = stZoomMark(s, next, beat);
    if (!nextMark) return;
    lead = next; mark = nextMark; a = s.leads[lead]; points.length = 0; cursor = sampleTime(mark.jTime); updateLead();
  }));
  resize(); updateLead();
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  window.addEventListener("resize", resize);
  // Dialogs replace their content when opening another view; stop observing detached roots.
  const dialog = root.closest("dialog");
  const cleanup = () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", resize); dialog?.removeEventListener("close", cleanup); };
  const mutations = new MutationObserver(() => { if (!root.isConnected) cleanup(); });
  mutations.observe(root.parentElement!, { childList: true });
  dialog?.addEventListener("close", cleanup, { once: true });
}
