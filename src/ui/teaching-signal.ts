import { LEADS, type Lead, type Signal } from "../engine/types";
import { readStDistribution } from "./st-distribution";

export type TeachingFocus = "st" | "qrs" | "repolarization";
export interface TeachingWindow { start: number; end: number; beatIndex: number }
export interface TeachingRegion { start: number; end: number; low: number; high: number; source: string; value: number | null; baseline: number | null }

/** The paper and teaching exports share the first ten seconds of the acquired record. */
export function teachingBeats(s: Signal): number[] {
  if (!Number.isFinite(s.fs) || s.fs <= 0) return [];
  const end = Math.min(10, (s.leads.I.length - 1) / s.fs);
  return s.events.beats.flatMap((b, i) => Number.isFinite(b.time) && b.time >= .2 && b.time + .5 < end ? [i] : []);
}

export function teachingWindow(s: Signal, beatIndex: number): TeachingWindow {
  const end = Math.min(10, (s.leads.I.length - 1) / s.fs), b = s.events.beats[beatIndex];
  if (!b || !Number.isFinite(b.time)) return { start: 0, end: Math.min(2, end), beatIndex: -1 };
  return { start: Math.max(0, b.time - .24), end: Math.min(end, b.time + Math.max(.72, (b.qt ?? .4) + .2)), beatIndex };
}

export function acquiredAt(s: Signal, lead: Lead, t: number): number | null {
  const i = Math.round(t * s.fs), a = s.leads[lead];
  return i >= 0 && i < a.length && Number.isFinite(a[i]) ? a[i] : null;
}

function extent(s: Signal, lead: Lead, from: number, to: number): [number, number] | null {
  const a = s.leads[lead], lo = Math.round(from * s.fs), hi = Math.round(to * s.fs);
  if (lo < 0 || hi >= a.length || hi < lo) return null;
  let min = Infinity, max = -Infinity;
  for (let i = lo; i <= hi; i++) { if (!Number.isFinite(a[i])) return null; min = Math.min(min, a[i]); max = Math.max(max, a[i]); }
  return [min, max];
}

/** Window location comes from model events; amplitudes always come from final samples. */
export function teachingRegion(s: Signal, lead: Lead, beatIndex: number, focus: TeachingFocus): TeachingRegion | null {
  const b = s.events.beats[beatIndex];
  if (!b || !Number.isFinite(b.time) || !Number.isFinite(b.qrs) || !(b.qrs! > 0)) return null;
  let start = b.time, end = b.time + b.qrs!, value: number | null = null, baseline: number | null = null;
  let source = "QRS: límites del modelo; amplitud de las muestras finales.";
  if (focus === "st") {
    const distribution = readStDistribution(s, beatIndex), row = distribution?.rows.find(r => r.lead === lead);
    if (row?.j0 === null || row?.j0 === undefined) return null;
    start = b.time + b.qrs!; end = start + .08; value = row.j0;
    const a = s.leads[lead], p0 = Math.round((b.time - .04) * s.fs), p1 = Math.round((b.time - .02) * s.fs);
    baseline = 0; for (let i = p0; i <= p1; i++) baseline += a[i]; baseline /= p1 - p0 + 1;
    source = "ST: J del modelo; media de los primeros 10 ms respecto a la ventana pre-QRS (−40 a −20 ms). No confirma un segmento PR isoeléctrico ni establece un umbral diagnóstico.";
  } else if (focus === "repolarization") {
    if (!Number.isFinite(b.qt) || b.qt! <= b.qrs! + .08) return null;
    start = b.time + b.qrs! + .08; end = b.time + b.qt!;
    const next = s.events.beats[beatIndex + 1];
    if (next && next.time <= end) return null;
    source = "Repolarización: ventana entre J+80 y el final de QT del modelo; no es una delineación independiente de la onda T.";
  }
  const bounds = extent(s, lead, start, end);
  return bounds ? { start, end, low: bounds[0] - .06, high: bounds[1] + .06, source, value, baseline } : null;
}

/** Same sample clock and event calendar are mandatory before an algebraic delta. */
export function teachingComparison(a: Signal, b: Signal | null): { compatible: boolean; reason: string } {
  if (!b) return { compatible: false, reason: "Selecciona una referencia para comparar." };
  if (a.fs !== b.fs || a.duration !== b.duration || LEADS.some(l => a.leads[l].length !== b.leads[l]?.length))
    return { compatible: false, reason: "Registros con distinta duración o frecuencia: solo comparación visual a escala común." };
  if (a.events.beats.length !== b.events.beats.length || a.events.beats.some((x, i) => x.time !== b.events.beats[i].time || x.kind !== b.events.beats[i].kind))
    return { compatible: false, reason: "Calendarios de latidos distintos: solo comparación visual; no se calcula una diferencia causal." };
  return { compatible: true, reason: "Misma frecuencia, duración y calendario. La resta describe cambios de muestras; no establece su causa." };
}
