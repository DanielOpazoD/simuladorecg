import type { Lead } from '../engine/types';
import type { ExternalECG } from '../io/external-ecg';
import type { ManualBounds } from '../io/external-review';

export interface ReviewView { lead: Lead; startSample: number; seconds: number; range: number }
export interface ReviewGeometry { x: number; y: number; width: number; height: number; first: number; count: number }
/** Geometry is in CSS pixels. Stored endpoints are absolute integer sample indices. */
export function sampleAtReviewPoint(x: number, g: ReviewGeometry): number {
  return Math.max(g.first, Math.min(g.first + g.count - 1, g.first + Math.round((x - g.x) / g.width * (g.count - 1))));
}
export function reviewPointAtSample(sample: number, g: ReviewGeometry): number { return g.x + (sample - g.first) / (g.count - 1) * g.width; }
export function renderReviewTrace(canvas: HTMLCanvasElement, record: ExternalECG, view: ReviewView, draft: ManualBounds | null, width: number): ReviewGeometry {
  const w = Math.max(250, Math.min(1400, Math.floor(width))), h = 238;
  const count = Math.round(view.seconds * record.fs);
  if (!record.leads[view.lead] || !Number.isSafeInteger(view.startSample) || view.startSample < 0 ||
      view.startSample + count > record.samples || count < 2 || ![.4,.8,1.6,3.2].includes(view.seconds) || ![.5,1,2,4,8,16].includes(view.range)) throw Error('Vista manual fuera del registro.');
  const g: ReviewGeometry = {x:38, y:38, width:w - 54, height:156, first:view.startSample, count};
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d'); if (!c) throw Error('Canvas de revisión no disponible.');
  c.scale(dpr, dpr); c.fillStyle = '#fffdfc'; c.fillRect(0, 0, w, h);
  const zero = g.y + g.height / 2, scale = g.height / (2 * view.range);
  c.font = '12px system-ui'; c.fillStyle = '#253c46'; c.fillText(`${view.lead} · manual · ±${view.range} mV`, 8, 18);
  c.strokeStyle = '#eedbdd'; c.lineWidth = .7;
  for (const mv of [-view.range, 0, view.range]) {
    c.beginPath(); c.moveTo(g.x, zero - mv * scale); c.lineTo(g.x + g.width, zero - mv * scale); c.stroke();
    c.fillText(String(mv), 4, zero - mv * scale + 4);
  }
  for (let i = 0; i <= 4; i++) {
    const x = g.x + i * g.width / 4;
    c.beginPath(); c.moveTo(x, g.y); c.lineTo(x, g.y + g.height); c.stroke();
    c.fillText(((g.first + i * (count - 1) / 4) / record.fs).toFixed(3), Math.min(w - 44, x - 12), 212);
  }
  c.save(); c.beginPath(); c.rect(g.x, g.y, g.width, g.height); c.clip();
  c.strokeStyle = '#203e4a'; c.lineWidth = 1.2; c.beginPath();
  for (let k = 0; k < count; k++) {
    const x = g.x + k / (count - 1) * g.width, y = zero - record.leads[view.lead][g.first + k] * scale;
    if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  if (draft && draft.lead === view.lead) for (const [index, label, color] of [[draft.startSample, 'A', '#0d6571'], [draft.endSample, 'B', '#aa4827']] as const) {
    if (index < g.first || index >= g.first + count) continue;
    const x = reviewPointAtSample(index, g);
    c.strokeStyle = color; c.lineWidth = 1.8; c.setLineDash([5,3]); c.beginPath(); c.moveTo(x, g.y); c.lineTo(x, g.y + g.height); c.stroke(); c.setLineDash([]);
    c.fillStyle = color; c.fillText(label, x + 3, g.y + 13);
  }
  c.restore(); c.fillStyle = '#253c46'; c.fillText('Tiempo absoluto (s). A/B: borrador manual, no automático.', 8, 232);
  canvas.setAttribute('aria-label', `Revisión manual ${view.lead}, ${(g.first / record.fs).toFixed(3)} a ${((g.first + count - 1) / record.fs).toFixed(3)} segundos. Flechas para mover el extremo activo; campos numéricos equivalentes.`);
  return g;
}
