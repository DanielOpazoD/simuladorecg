import type { ECGCase, Signal, Lead } from "../engine/types";
import { buildAvLadder, avLadderSvg, type AvLadder } from "./av-ladder";

/** Lección estática de lectura AV: ventana elegida en el calendario del modelo (0–10 s) y
 * figura inline con tira II y escalera debajo sobre el mismo eje X. No mide, no delinea,
 * no afirma nivel de bloqueo y nunca altera muestras ni modelo. */
export interface AvReadingLesson { from: number; to: number; lead: Lead; ladder: AvLadder }

const SPEED = 50, GAIN = 10, LEFT = 8, TOP = 5, RIGHT = 2, LADDER_H = 28, MARGIN_MV = 0.2, TOL = 1e-9;
const LEAD: Lead = "II";
const PRE_S = 0.2, POST_S = 0.3, GENERIC_S = 4;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const freeze = (from: number, to: number, ladder: AvLadder): AvReadingLesson =>
  Object.freeze({ from, to, lead: LEAD, ladder });

/** Último instante muestreado de II: (n-1)/fs; null si la tira no es utilizable. */
function lastSampleTime(s: Signal): number | null {
  const a = s.leads?.[LEAD];
  if (!(a instanceof Float64Array) || a.length < 2 || !finite(s.fs) || s.fs <= 0 || !finite(s.duration) || s.duration <= 0) return null;
  return Math.min(s.duration, (a.length - 1) / s.fs);
}

/** Latido exactamente en el instante previsto por el modelo (tolerancia 1e-9), nunca el más cercano. */
const beatAt = (s: Signal, t: number) =>
  s.events.beats.filter(b => finite(b.time) && Math.abs(b.time - t) <= TOL).length === 1;

/** Wenckebach: tres o más P conducidas de PR creciente, una P no conducida y
 * la respuesta de la siguiente P con PR menor. El margen cubre su QRS real.
 * Se comprueba en los eventos, no por el nombre del caso; sin ciclo completo no hay lección. */
function wenckebach(c: ECGCase, s: Signal, limit: number): AvReadingLesson | null {
  const atria = s.events.atria;
  const blocked = atria.flatMap((a, i) => a.conducted === false && finite(a.time) && a.time >= 0 && a.time <= limit ? [i] : []);
  for (let k = 0; k + 1 < blocked.length; k++) {
    const i0 = blocked[k], i1 = blocked[k + 1], run = atria.slice(i0 + 1, i1), next = atria[i1 + 1];
    const rising = run.every((a, j) => a.conducted && finite(a.pr) && (j === 0 || a.pr > (run[j - 1].pr as number) + TOL));
    if (run.length < 3 || !rising || !next?.conducted || !finite(next.pr) || !finite(next.time) || next.pr >= run.at(-1)!.pr! - TOL) continue;
    const v = next.time + next.pr;
    if (!beatAt(s, v)) continue;
    const beat = s.events.beats.find(b => Math.abs(b.time - v) <= TOL)!;
    if (!finite(beat.qrs) || beat.qrs <= 0) continue;
    const from = Math.max(0, run[0].time - PRE_S), to = v + Math.max(POST_S, beat.qrs + .05);
    if (to > limit + TOL) continue;
    const ladder = buildAvLadder(c, s, from, to);
    if (ladder && ladder.atria.some(a => !a.conducted)) return freeze(from, to, ladder);
  }
  return null;
}

/** Resto de BAV: ventana de varios eventos desde el origen (~4 s) validada por buildAvLadder. */
function generic(c: ECGCase, s: Signal, limit: number): AvReadingLesson | null {
  const to = Math.min(GENERIC_S, limit), ladder = buildAvLadder(c, s, 0, to);
  return ladder && ladder.atria.length >= 2 && ladder.ventricles.length >= 1 ? freeze(0, to, ladder) : null;
}

/** Pura y sin efectos: null fuera del dominio del helper, con electrodos invertidos, vista
 * Cabrera, calendario ausente o tira II inutilizable. Nunca selecciona datos más allá de 10 s. */
export function avReadingLesson(c: ECGCase, s: Signal): AvReadingLesson | null {
  if (!c || !s?.events || !Array.isArray(s.events.atria) || !Array.isArray(s.events.beats)) return null;
  if (c.artifacts?.reversed || c.view?.cabrera) return null;
  const last = lastSampleTime(s);
  if (last === null) return null;
  const limit = Math.min(10, last);
  return c.av === "mobitz1" ? wenckebach(c, s, limit) : generic(c, s, limit);
}

const f4 = (v: number): string => {
  if (!finite(v)) throw new Error("Lección AV: valor no finito en el SVG.");
  return v.toFixed(4);
};

/** Grilla de 1 mm (fina) y 5 mm (gruesa) limitada a la región de la onda. */
function grid(width: number, height: number): string {
  const fine: string[] = [], bold: string[] = [];
  for (let i = 0; i <= Math.floor(width + TOL); i++) (i % 5 ? fine : bold).push(`M${f4(LEFT + i)} ${f4(TOP)}v${f4(height)}`);
  for (let j = 0; j <= Math.floor(height + TOL); j++) (j % 5 ? fine : bold).push(`M${f4(LEFT)} ${f4(TOP + j)}h${f4(width)}`);
  return `<path class="lesson-grid-fine" d="${fine.join("")}"/><path class="lesson-grid-bold" d="${bold.join("")}"/>`;
}

/** Figura estática: tira II a 50 mm/s y 10 mm/mV anclada a índices de muestra (sin normalizar,
 * suavizar ni estirar), escalera debajo con el mismo eje X y viewBox en mm (5 px/mm).
 * Sin botones ni desplegables; un pico alto alarga la figura, nunca recorta ondas. */
export function avReadingHtml(lesson: AvReadingLesson, s: Signal): string {
  const { from, to, ladder } = lesson, a = s.leads?.[lesson.lead], fs = s.fs;
  if (!(a instanceof Float64Array) || !finite(fs) || fs <= 0 || !finite(from) || !finite(to) || to <= from)
    throw new Error("Lección AV: tira o ventana no utilizable.");
  const i0 = Math.max(0, Math.ceil(from * fs - TOL)), i1 = Math.min(a.length - 1, Math.floor(to * fs + TOL));
  if (i1 <= i0) throw new Error("Lección AV: ventana sin muestras.");
  let peak = 0;
  for (let i = i0; i <= i1; i++) {
    if (!finite(a[i])) throw new Error("Lección AV: muestra no finita.");
    peak = Math.max(peak, Math.abs(a[i]));
  }
  const range = Math.ceil((peak + MARGIN_MV) * 10 - TOL) / 10;
  const width = (to - from) * SPEED, heightWave = 2 * range * GAIN, baseline = TOP + range * GAIN;
  const ladderTop = TOP + heightWave + 5, totalW = LEFT + width + RIGHT, totalH = ladderTop + LADDER_H;
  const d: string[] = [];
  for (let i = i0; i <= i1; i++)
    d.push(`${i === i0 ? "M" : "L"}${f4(LEFT + (i / fs - from) * SPEED)} ${f4(baseline - a[i] * GAIN)}`);
  const clip = `<clipPath id="teach-av-clip"><rect x="${f4(LEFT)}" y="${f4(ladderTop)}" width="${f4(width)}" height="${f4(LADDER_H)}"/></clipPath>`;
  const visibleP = ladder.atria.filter(p => p.time >= from - TOL && p.time <= to + TOL);
  const blocked = visibleP.filter(p => !p.conducted).length;
  const prs = visibleP.flatMap(p => p.prMs === null ? [] : [p.prMs]);
  const accessible = ladder.complete
    ? `${visibleP.length} ondas P y ${ladder.ventricles.length} complejos QRS en secuencias independientes; no se trazan asociaciones.`
    : `${visibleP.length} ondas P, ${blocked} sin respuesta ventricular. ${prs.length ? `PR del modelo entre ${Math.round(Math.min(...prs))} y ${Math.round(Math.max(...prs))} ms.` : ''}`;
  const svg =
    `<svg class="lesson-av-svg" role="img" aria-label="Tira de la derivación II y esquema de conducción AV. ${accessible}" ` +
    `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f4(totalW)} ${f4(totalH)}" width="${f4(totalW * 5)}" height="${f4(totalH * 5)}" ` +
    `data-start="${f4(from)}" data-end="${f4(to)}" data-speed="${SPEED}" data-left="${LEFT}" data-gain="${GAIN}" ` +
    `data-baseline="${f4(baseline)}" data-fs="${f4(fs)}" data-ladder-top="${f4(ladderTop)}">` +
    `<defs>${clip}</defs><g class="lesson-av-wave">${grid(width, heightWave)}<path class="lesson-wave" fill="none" d="${d.join("")}"/></g>` +
    `<g class="lesson-av-diagram">${avLadderSvg(ladder, LEFT, SPEED, ladderTop, width)}</g></svg>`;
  return `<figure class="reading-lesson lesson-av"><figcaption class="lesson-av-title">Conducción AV</figcaption>` +
    `<div class="lesson-av-scroll" role="region" tabindex="0" aria-label="Secuencia de conducción AV">${svg}</div>` +
    `<p class="lesson-av-legend">A/AV/V: aurículas · conducción · ventrículos</p>` +
    `<p class="lesson-av-caption">II · 50 mm/s · 10 mm/mV · Esquema de conducción</p></figure>`;
}
