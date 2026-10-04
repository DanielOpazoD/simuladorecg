import { LEADS, type Lead } from '../engine/lead-registry';
import type { Vec } from '../engine/leads';
import { activationAt, type ActivationPair, type ActivationTrace } from '../ui/activation-model';
import { esc } from '../ui/helpers';

export const ACTIVATION_PLANES = ['XYZ', 'XY', 'XZ', 'YZ'] as const;
type Plane = typeof ACTIVATION_PLANES[number];
const A = '#a05813', B = '#006e70', GRID = '#dce6e6';
const n = (v: number) => v.toFixed(2);
const line = (x1: number, y1: number, x2: number, y2: number, stroke = GRID) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}"/>`;
const text = (x: number, y: number, value: string, size = 11) => `<text x="${x}" y="${y}" fill="#40575e" font-family="system-ui,sans-serif" font-size="${size}">${esc(value)}</text>`;
const tracePath = (points: number[][], color: string, dashed = false) => `<path d="${points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="5 3"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;

export function activationPoint(v: Vec, plane: Plane, range: number): [number, number] {
  const coordinates: Record<Plane, [number, number]> = {
    XYZ: [.8 * v[0] - .6 * v[2], .32 * v[0] - .84 * v[1] + .43 * v[2]],
    XY: [v[0], -v[1]], XZ: [v[0], -v[2]], YZ: [v[1], -v[2]],
  };
  const [x, y] = coordinates[plane], scale = 76 / range;
  return [130 + x * scale, 112 + y * scale];
}
function planeSvg(pair: ActivationPair, plane: Plane, position = '', timeMs = 0): string {
  const axis = plane === 'XYZ' ? '' : `${line(47, 112, 213, 112)}${line(130, 29, 130, 195)}${text(216, 116, '+' + plane[0])}${text(132, 32, '+' + plane[1])}`;
  const oblique = plane !== 'XYZ' ? '' : ([0, 1, 2] as const).map(j => {
    const v: Vec = [0, 0, 0]; v[j] = pair.vectorRange;
    const [x, y] = activationPoint(v, plane, pair.vectorRange);
    return line(130, 112, x, y, '#bccccc') + text(x + 4, y, '+' + 'XYZ'[j]);
  }).join('');
  const dots = [['A', pair.a, A], ['B', pair.b, B]] as const;
  const markers = dots.map(([id, trace, color]) => {
    const [x, y] = activationPoint(activationAt(trace, timeMs).xyz, plane, pair.vectorRange);
    return `<circle data-activation-dot="${id}" cx="${n(x)}" cy="${n(y)}" r="4" fill="${color}" stroke="white" stroke-width="1.5"/>`;
  }).join('');
  return `<svg ${position} viewBox="0 0 260 224" role="img" aria-label="Bucle ${plane} del QRS: A discontinuo, B continuo" data-activation-plane="${plane}"><rect width="260" height="224" rx="10" fill="#f6f9f9"/>${text(12, 20, plane === 'XYZ' ? 'XYZ · vista oblicua' : `Plano ${plane}`, 12)}${axis}${oblique}${tracePath(pair.a.xyz.map(v => activationPoint(v, plane, pair.vectorRange)), A, true)}${tracePath(pair.b.xyz.map(v => activationPoint(v, plane, pair.vectorRange)), B)}${markers}${text(12, 213, `Escala común ±${pair.vectorRange.toFixed(2)} · XYZ del modelo`, 9)}</svg>`;
}
function leadPoints(trace: ActivationTrace, lead: Lead, pair: ActivationPair): [number, number][] {
  return trace.timesMs.map((time, i) => [28 + 246 * time / pair.durationMs, 45 - trace.leads[lead][i] * 28 / pair.leadRangeMv]);
}
function leadSvg(pair: ActivationPair, lead: Lead, position = '', timeMs = 0): string {
  const cursorX = n(28 + 246 * timeMs / pair.durationMs);
  return `<svg ${position} viewBox="0 0 300 90" role="img" aria-label="QRS proyectado en ${lead}, misma escala temporal y de voltaje" data-activation-lead="${lead}"><rect width="300" height="90" rx="8" fill="#f6f9f9"/>${text(9, 17, lead, 13)}${line(28, 17, 28, 73)}${line(28, 45, 274, 45)}${line(151, 17, 151, 73)}${tracePath(leadPoints(pair.a, lead, pair), A, true)}${tracePath(leadPoints(pair.b, lead, pair), B)}<line data-activation-cursor="true" x1="${cursorX}" x2="${cursorX}" y1="20" y2="73" stroke="#263b47" stroke-width="1" stroke-dasharray="2 2"/>${text(28, 84, '0 ms', 9)}${text(230, 84, `${pair.durationMs.toFixed(0)} ms`, 9)}</svg>`;
}
export function activationCharts(pair: ActivationPair): string {
  return `<section aria-label="Bucle espacial" class="activation-space">${ACTIVATION_PLANES.map(p => planeSvg(pair, p)).join('')}</section><section aria-label="Doce derivaciones proyectadas" class="activation-leads">${LEADS.map(l => leadSvg(pair, l)).join('')}</section>`;
}
export function updateActivationCursor(root: ParentNode, pair: ActivationPair, timeMs: number): void {
  const frames = { A: activationAt(pair.a, timeMs), B: activationAt(pair.b, timeMs) };
  for (const plane of root.querySelectorAll<SVGSVGElement>('[data-activation-plane]')) {
    for (const id of ['A', 'B'] as const) {
      const [x, y] = activationPoint(frames[id].xyz, plane.dataset.activationPlane as Plane, pair.vectorRange);
      const dot = plane.querySelector(`[data-activation-dot="${id}"]`)!;
      dot.setAttribute('cx', n(x)); dot.setAttribute('cy', n(y));
    }
  }
  for (const line of root.querySelectorAll('[data-activation-cursor]')) {
    const x = n(28 + 246 * timeMs / pair.durationMs); line.setAttribute('x1', x); line.setAttribute('x2', x);
  }
}
/** Standalone vector image: explicit identity, legend, units and scope, no external assets. */
export function activationSvg(pair: ActivationPair, timeMs = 0): string {
  if (!Number.isFinite(timeMs)) throw Error('Instante no válido.');
  timeMs = Math.max(0, Math.min(pair.durationMs, timeMs));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="780" viewBox="0 0 1240 780"><rect width="1240" height="780" fill="white"/>${text(24, 30, 'ECG Lab · Laboratorio de activación QRS', 22)}${text(24, 58, `A (discontinuo): ${pair.a.label} · B (continuo): ${pair.b.label}`, 13)}${text(24, 82, `QRS A: ${pair.a.durationMs.toFixed(0)} ms · B: ${pair.b.durationMs.toFixed(0)} ms · Derivaciones: ±${pair.leadRangeMv.toFixed(2)} mV · Cursor: ${timeMs.toFixed(0)} ms`, 13)}${ACTIVATION_PLANES.map((p, i) => planeSvg(pair, p, `x="${24 + i % 2 * 268}" y="${108 + Math.floor(i / 2) * 232}" width="260" height="224"`, timeMs)).join('')}${LEADS.map((l, i) => leadSvg(pair, l, `x="${568 + i % 2 * 316}" y="${108 + Math.floor(i / 2) * 98}" width="300" height="90"`, timeMs)).join('')}${text(24, 710, `Modelo A: ${pair.a.timing.label} · Modelo B: ${pair.b.timing.label}`, 12)}${pair.a.timing.deltaDurationMs || pair.b.timing.deltaDurationMs ? text(24, 686, `Delta incluida · A: ${pair.a.timing.deltaDurationMs ?? 0} ms · B: ${pair.b.timing.deltaDurationMs ?? 0} ms. A/B alineados a su propio inicio QRS; no son tiempos absolutos del ECG.`, 11) : ''}${text(24, 732, 'QRS vectorial aislado antes de filtros, ruido y electrodos. Sin P, ST, T ni espigas.', 13)}${text(24, 756, 'Coordenadas sintéticas del modelo. No es VCG clínico ni propagación anatómica. Uso educativo, sin validación clínica.', 12)}</svg>`;
}
