import type { Lead, Signal } from "../engine/types";
import { LEADS } from "../engine/types";
import { stMarks, ST_LENS, type StMark } from "../render/st-lens";
import { dominantBeats } from "./structured-description";
import { esc } from "./helpers";

/**
 * Magnified beat for reading the J point and the ST by eye (A3+): one representative
 * dominant beat of a lead at 50 mm/s and 10 mm/mV (a small square is 20 ms and
 * 0.1 mV), with the PR reference, J, J+60 and J+80 marked; clicks place points on
 * the trace and read their level against PR, their time from J and the difference
 * between two of them. A view of the samples, not a new measurement.
 */
const SPEED = 50, GAIN = 10, BEFORE = 0.16, AFTER = 0.62, RANGE_MV = 1.3;
const mmText = (mv: number) => `${mv >= 0 ? "+" : "−"}${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;
const msText = (s: number) => { const v = Math.round(s * 1000); return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ms`; };

/** The beat whose J-point ST is the median of the lead's dominant beats. */
function representative(s: Signal, lead: Lead): StMark | null {
  const dominant = new Set(dominantBeats(s)), end = s.leads.I.length / s.fs;
  const marks = stMarks(s, lead, BEFORE + 0.05, end - AFTER).filter((m) => dominant.has(m.beat)).sort((a, b) => a.j0 - b.j0);
  return marks.length ? marks[Math.floor(marks.length / 2)] : null;
}
/** Lead whose ST deviates most: where the reader most likely wants to look. */
export function defaultZoomLead(s: Signal): Lead {
  let best: Lead = "V2", value = -1;
  for (const lead of LEADS) { const m = representative(s, lead); if (m && Math.abs(m.j0) > value) { value = Math.abs(m.j0); best = lead; } }
  return best;
}

export function stZoomHtml(lead: Lead): string {
  return `<div class="st-zoom"><div class="st-zoom-leads" role="group" aria-label="Derivación">${LEADS.map((l) => `<button type="button" class="btn${l === lead ? " active" : ""}" data-zoom-lead="${l}" aria-pressed="${l === lead}">${l}</button>`).join("")}</div>` +
    `<canvas class="st-zoom-canvas" role="img" aria-label="Latido ampliado de ${esc(lead)} con el punto J y el ST marcados"></canvas>` +
    `<p class="st-zoom-scale">50 mm/s · 10 mm/mV: cada cuadro pequeño son 20 ms y 0,1 mV. Niveles en mm respecto del segmento PR (franja gris).</p>` +
    `<output class="st-zoom-readout" aria-live="polite">Haz clic sobre el trazado para marcar un punto; con dos puntos se mide la diferencia.</output>` +
    `<button type="button" class="text-button" data-zoom-clear>Borrar puntos</button></div>`;
}

interface Palette { bg: string; fine: string; bold: string; trace: string; text: string; sdst: string; idst: string }
export function mountStZoom(root: HTMLElement, s: Signal, lead: Lead, palette: Palette) {
  const canvas = root.querySelector<HTMLCanvasElement>(".st-zoom-canvas")!, out = root.querySelector<HTMLOutputElement>(".st-zoom-readout")!;
  const mark = representative(s, lead);
  if (!mark) { out.textContent = "Esta derivación no tiene complejos organizados para ampliar."; canvas.hidden = true; return; }
  const a = s.leads[lead], fs = s.fs, t0 = s.events.beats[mark.beat].time - BEFORE, t1 = mark.jTime + AFTER;
  const widthMm = (t1 - t0) * SPEED, heightMm = 2 * RANGE_MV * GAIN;
  const cssWidth = Math.min(root.clientWidth || 640, 820), px = cssWidth / widthMm, dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`; canvas.style.height = `${heightMm * px}px`;
  canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round(heightMm * px * dpr);
  const X = (t: number) => (t - t0) * SPEED * px, Y = (mv: number) => (RANGE_MV - (mv - mark.prLevel)) * GAIN * px;
  const T = (x: number) => t0 + x / (SPEED * px), at = (t: number) => a[Math.max(0, Math.min(a.length - 1, Math.round(t * fs)))];
  const points: number[] = [];
  const draw = (hover?: number) => {
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, cssWidth, heightMm * px);
    for (let mm = 0; mm <= Math.max(widthMm, heightMm); mm++) {
      ctx.strokeStyle = mm % 5 ? palette.fine : palette.bold; ctx.lineWidth = mm % 5 ? 0.6 : 1;
      if (mm <= widthMm) { ctx.beginPath(); ctx.moveTo(mm * px, 0); ctx.lineTo(mm * px, heightMm * px); ctx.stroke(); }
      if (mm <= heightMm) { ctx.beginPath(); ctx.moveTo(0, mm * px); ctx.lineTo(cssWidth, mm * px); ctx.stroke(); }
    }
    // PR reference window and level.
    const p0 = s.events.beats[mark.beat].time + ST_LENS.prFromS, p1 = s.events.beats[mark.beat].time + ST_LENS.prToS;
    ctx.fillStyle = "rgba(120,130,140,0.18)"; ctx.fillRect(X(p0), 0, X(p1) - X(p0), heightMm * px);
    ctx.setLineDash([6, 4]); ctx.strokeStyle = palette.text; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(mark.prLevel)); ctx.lineTo(cssWidth, Y(mark.prLevel)); ctx.stroke();
    // J, J+60 and J+80.
    ctx.font = "12px 'DM Sans', sans-serif"; ctx.fillStyle = palette.text;
    for (const [dt, label, row] of [[0, "J", 0], [ST_LENS.j60S, "J+60", 0], [0.08, "J+80", 1]] as const) {
      const x = X(mark.jTime + dt);
      ctx.strokeStyle = dt === 0 ? palette.sdst : palette.text; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, heightMm * px); ctx.stroke();
      ctx.fillText(label, x + 3, 14 + row * 15);
    }
    ctx.setLineDash([]);
    // Trace.
    ctx.strokeStyle = palette.trace; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = Math.floor(t0 * fs); i <= Math.ceil(t1 * fs); i++) { const x = X(i / fs), y = Y(a[i]); i === Math.floor(t0 * fs) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    // J and J+60 on the trace (instantaneous samples; the description's J is the mean
    // of its first 10 ms, given in the readout).
    for (const dt of [0, ST_LENS.j60S]) {
      const x = X(mark.jTime + dt), v = at(mark.jTime + dt) - mark.prLevel, y = Y(mark.prLevel + v);
      ctx.fillStyle = v >= 0 ? palette.sdst : palette.idst; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(mmText(v), x + 6, y - 6);
    }
    // Manual points.
    const dot = (t: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(t), Y(at(t)), 5, 0, Math.PI * 2); ctx.fill(); };
    points.forEach((t, i) => dot(t, i ? "#b06a00" : "#0b7a75"));
    if (points.length === 2) { ctx.strokeStyle = "#b06a00"; ctx.beginPath(); ctx.moveTo(X(points[0]), Y(at(points[0]))); ctx.lineTo(X(points[1]), Y(at(points[1]))); ctx.stroke(); }
    if (hover !== undefined) { ctx.strokeStyle = "rgba(11,122,117,0.5)"; ctx.beginPath(); ctx.moveTo(X(hover), 0); ctx.lineTo(X(hover), heightMm * px); ctx.stroke(); }
  };
  const describe = (t: number) => `${msText(t - mark.jTime)} desde J, nivel ${mmText(at(t) - mark.prLevel)}`;
  const report = (hover?: number) => {
    const parts = points.map((t, i) => `Punto ${i + 1}: ${describe(t)}`);
    if (points.length === 2) parts.push(`Diferencia: ${Math.round(Math.abs(points[1] - points[0]) * 1000)} ms, ${mmText(at(points[1]) - at(points[0]))}`);
    if (!points.length && hover !== undefined) parts.push(`Cursor: ${describe(hover)}`);
    out.textContent = parts.join(" · ") || `Lectura de la descripción: J ${mmText(mark.j0)} (media de sus primeros 10 ms) y J+60 ${mmText(mark.j60)}. Haz clic para marcar puntos.`;
  };
  const timeOf = (e: PointerEvent) => T(e.clientX - canvas.getBoundingClientRect().left);
  canvas.addEventListener("pointermove", (e) => { const t = timeOf(e); draw(t); report(t); });
  canvas.addEventListener("pointerleave", () => { draw(); report(); });
  canvas.addEventListener("click", (e) => { if (points.length === 2) points.length = 0; points.push(timeOf(e)); draw(); report(); });
  root.querySelector("[data-zoom-clear]")?.addEventListener("click", () => { points.length = 0; draw(); report(); });
  draw(); report();
}
