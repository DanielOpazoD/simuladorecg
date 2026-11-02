import { LEADS, type ECGCase, type Signal, type Beat } from "../engine/types";

/** Escalera AV esquemática construida exclusivamente con el calendario de eventos del
 * modelo (s.events). No delinea muestras, no mide PR y no afirma el tipo de bloqueo ni
 * el nivel anatómico de conducción. Las muestras solo se validan, nunca se modifican. */
export interface AvLadderAtrium { time: number; conducted: boolean; ventricularTime: number | null; prMs: number | null }
export interface AvLadderVentricle { time: number; linked: boolean }
export interface AvLadder { from: number; to: number; atria: AvLadderAtrium[]; ventricles: AvLadderVentricle[]; complete: boolean }

const TOL = 1e-9;
const Y_A = 4, Y_AV = 13, Y_V = 22, TICK = 1.5, LABEL_MIN_MM = 7;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const ordered = (times: number[], duration: number) =>
  times.every((t, i) => finite(t) && t >= 0 && t < duration && (i === 0 || t > times[i - 1]));

/** Dominio: sinusal con BAV seleccionable, sin ectopia y sin inversión de electrodos. */
const inDomain = (c: ECGCase) =>
  c.rhythm === "sinus" && ["first","mobitz1","mobitz2","two_one","high","complete"].includes(c.av) && c.ectopy === "none" && !c.artifacts.reversed;

/** Las 12 derivaciones deben cubrir los primeros 10 s (o el registro completo si es más corto)
 * con la misma longitud y ser finitas dentro de la ventana solicitada. */
function samplesComplete(s: Signal, from: number, to: number): boolean {
  if (!finite(s.fs) || s.fs <= 0 || !finite(s.duration) || s.duration <= 0 || !s.leads) return false;
  const n = s.leads.I instanceof Float64Array ? s.leads.I.length : 0;
  const lo = Math.floor(from * s.fs), hi = Math.ceil(to * s.fs);
  if (n < Math.floor(Math.min(10, s.duration) * s.fs) || hi >= n) return false;
  for (const lead of LEADS) {
    const a = s.leads[lead];
    if (!(a instanceof Float64Array) || a.length !== n) return false;
    for (let i = lo; i <= hi; i++) if (!Number.isFinite(a[i])) return false;
  }
  return true;
}

/** Igual que event-calendar: búsqueda binaria con tolerancia 1e-9; nunca "el más cercano". */
function findBeat(beats: Beat[], expected: number): number | "none" | "ambiguous" {
  let lo = 0, hi = beats.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (beats[mid].time < expected - TOL) lo = mid + 1; else hi = mid; }
  if (lo >= beats.length || Math.abs(beats[lo].time - expected) > TOL) return "none";
  if (lo + 1 < beats.length && Math.abs(beats[lo + 1].time - expected) <= TOL) return "ambiguous";
  return lo;
}

/** Devuelve null ante cualquier vínculo o metadato ausente dentro del registro: es
 * preferible no dibujar a dibujar una P bloqueada falsa. Un evento esperado más allá del
 * final del registro o fuera de la ventana es frontera, no bloqueo. */
export function buildAvLadder(c: ECGCase, s: Signal, from: number, to: number): AvLadder | null {
  if (!inDomain(c) || !finite(from) || !finite(to) || from < 0 || to <= from) return null;
  if (!s?.events || !samplesComplete(s, from, to) || to > s.duration + TOL) return null;
  const { atria, beats } = s.events;
  if (!Array.isArray(s.events.spikes) || s.events.spikes.length) return null;
  if (!Array.isArray(atria) || !Array.isArray(beats)) return null;
  if (!atria.length || !beats.length) return null;
  if (!ordered(atria.map(a => a.time), s.duration) || !ordered(beats.map(b => b.time), s.duration)) return null;
  const complete = c.av === "complete";
  if (atria.some(a => a.kind !== "sinus" || typeof a.conducted !== "boolean")) return null;
  if (beats.some(b => !(b.kind === "normal" || (complete && b.kind === "ventricular")))) return null;
  // Guarda 2: en bloqueo completo ninguna P puede estar conducida ni ningún latido llevar PR.
  for (const a of atria)
    if (a.conducted ? (complete || !finite(a.pr) || a.pr <= 0) : a.pr !== undefined) return null;
  for (const b of beats)
    if (complete ? b.pr !== undefined : !finite(b.pr) || b.pr <= 0) return null;
  if (c.av === "first" && atria.some(a => !a.conducted)) return null;
  // Vínculos calculados sobre el registro completo antes de recortar la ventana.
  const linked = new Array<boolean>(beats.length).fill(false);
  const all: AvLadderAtrium[] = [];
  for (const a of atria) {
    if (!a.conducted) { all.push({ time: a.time, conducted: false, ventricularTime: null, prMs: null }); continue; }
    const pr = a.pr as number, expected = a.time + pr, hit = findBeat(beats, expected);
    if (hit === "ambiguous") return null;
    if (hit === "none") {
      if (expected < s.duration) return null;
      // Guarda 1: respuesta prevista más allá del registro; se conserva la diagonal hacia el
      // instante previsto por el modelo (recortada por el llamador), sin tick V ni bloqueo.
      all.push({ time: a.time, conducted: true, ventricularTime: expected, prMs: pr * 1000 });
      continue;
    }
    const b = beats[hit];
    if (linked[hit] || Math.abs((b.pr as number) - pr) > TOL) return null;
    linked[hit] = true;
    all.push({ time: a.time, conducted: true, ventricularTime: b.time, prMs: pr * 1000 });
  }
  if (!complete)
    for (let i = 0; i < beats.length; i++)
      if (!linked[i] && beats[i].time - (beats[i].pr as number) >= 0) return null;
  const inWin = (t: number) => t >= from - TOL && t <= to + TOL;
  return {
    from, to, complete,
    atria: all.filter(a => a.conducted ? (a.ventricularTime as number) >= from - TOL && a.time <= to + TOL : inWin(a.time)),
    ventricles: beats.flatMap((b, i) => inWin(b.time) ? [{ time: b.time, linked: linked[i] }] : []),
  };
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) throw new Error("Escalera AV: valor no finito en el SVG.");
  return String(Math.round(v * 1e6) / 1e6);
}

/** Fragmento SVG en milímetros, sin elemento <svg>. Niveles A/AV/V en top+4, top+13 y
 * top+22 mm. Las diagonales pueden salir de [left, left+width]: el llamador aplica el
 * clipPath #teach-av-clip. Las etiquetas A/AV/V quedan fuera de ese recorte.
 * El símbolo de P bloqueada es esquemático: no representa tiempo ni sitio. */
export function avLadderSvg(model: AvLadder, left: number, speed: number, top: number, width: number): string {
  if (![left, speed, top, width, model.from, model.to].every(finite) || speed <= 0 || width <= 0) return "";
  const x = (t: number) => left + (t - model.from) * speed;
  const inWin = (t: number) => t >= model.from - TOL && t <= model.to + TOL;
  const yA = top + Y_A, yAV = top + Y_AV, yV = top + Y_V, right = left + width;
  const out: string[] = [], labels: string[] = [];
  for (const [cls, label, y] of [["a", "A", yA], ["av", "AV", yAV], ["v", "V", yV]] as const) {
    out.push(`<line class="av-level av-level-${cls}" x1="${fmt(left)}" y1="${fmt(y)}" x2="${fmt(right)}" y2="${fmt(y)}"/>`);
    labels.push(`<text class="av-level-label" x="${fmt(left - 1.5)}" y="${fmt(y + 0.8)}" text-anchor="end">${label}</text>`);
  }
  for (const a of model.atria) {
    const xa = x(a.time);
    if (inWin(a.time))
      out.push(`<line class="av-atrial" data-time="${fmt(a.time)}" x1="${fmt(xa)}" y1="${fmt(yA - TICK)}" x2="${fmt(xa)}" y2="${fmt(yA + TICK)}"/>`);
    if (a.conducted && a.ventricularTime !== null && a.prMs !== null) {
      const xv = x(a.ventricularTime), ms = Math.round(a.prMs);
      out.push(`<line class="av-link" data-atrial-time="${fmt(a.time)}" data-ventricular-time="${fmt(a.ventricularTime)}" data-pr-ms="${fmt(a.prMs)}" x1="${fmt(xa)}" y1="${fmt(yA)}" x2="${fmt(xv)}" y2="${fmt(yV)}"><title>PR ${fmt(ms)} ms</title></line>`);
      if (inWin(a.time) && inWin(a.ventricularTime) && xv - xa >= LABEL_MIN_MM)
        out.push(`<text class="av-pr" data-pr-ms="${fmt(a.prMs)}" x="${fmt((xa + xv) / 2 + 0.6)}" y="${fmt((yA + yV) / 2 - 0.6)}">${fmt(ms)} ms</text>`);
    } else if (!a.conducted && inWin(a.time)) {
      out.push(`<path class="av-blocked" data-time="${fmt(a.time)}" fill="none" d="M${fmt(xa)} ${fmt(yA)}V${fmt(yAV)}M${fmt(xa - 1)} ${fmt(yAV)}H${fmt(xa + 1)}"><title>P sin respuesta ventricular en el modelo (símbolo esquemático)</title></path>`);
    }
  }
  for (const v of model.ventricles) {
    if (!inWin(v.time)) continue;
    const xv = x(v.time);
    out.push(`<line class="av-ventricular" data-time="${fmt(v.time)}" data-linked="${v.linked ? 1 : 0}" x1="${fmt(xv)}" y1="${fmt(yV - TICK)}" x2="${fmt(xv)}" y2="${fmt(yV + TICK)}"/>`);
  }
  return labels.join("") + `<g clip-path="url(#teach-av-clip)">${out.join("")}</g>`;
}
