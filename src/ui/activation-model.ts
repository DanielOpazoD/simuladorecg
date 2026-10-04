import { cloneCase, type ECGCase, type Beat } from '../engine/types';
import { LEADS, type Lead } from '../engine/lead-registry';
import { project, axisFromLeads, type Vec } from '../engine/leads';
import { qrsKernels, qrsDuration, qrsKernelValue } from '../engine/morphology';
import { VENTRICULAR_SOURCE_IDS, VENTRICULAR_SOURCES, ventricularSource } from '../engine/ventricular-source';
import { changeCase } from './case-state';
import { regionalActivationState, regionalActivationTimeline, usesRegionalActivation } from '../engine/regional-activation';

export interface ActivationTrace {
  case: ECGCase;
  /** Captured event timing only; a QRS-only experiment cannot publish a new QT. */
  beat: Pick<Beat, "time" | "kind" | "rr">;
  label: string;
  durationMs: number;
  timing: ReturnType<typeof activationTiming>;
  timesMs: number[];
  xyz: Vec[];
  leads: Record<Lead, number[]>;
  summary: { integral: Vec; frontalAxisDeg: number | null; peakMagnitude: number; pathLength: number };
}
export interface ActivationPair { a: ActivationTrace; b: ActivationTrace; vectorRange: number; leadRangeMv: number; durationMs: number }
export const ACTIVATION_SCOPE = 'QRS vectorial aislado del generador, antes de filtros y adquisición. Sin P, ST, T ni espigas. Coordenadas XYZ sintéticas; no es un VCG clínico ni una propagación anatómica.';
export const CONDUCTION_EXAMPLES = [
  ['normal', 'Conducción normal'], ['rbbb', 'BRD completo'], ['irbbb', 'BRD incompleto'],
  ['lbbb', 'BRI completo'], ['lafb', 'Hemibloqueo anterior'], ['lpfb', 'Hemibloqueo posterior'],
] as const;

/** Reject components that cannot be represented by a single static QRS vector loop. */
export function activationLimitation(c: ECGCase, b?: Beat): string | null {
  if (c.rhythm === 'vf' || c.rhythm === 'asystole' || !b) return 'Sin complejos QRS organizados para explorar.';
  if (c.rhythm === 'torsades') return 'La TV polimórfica rota durante el tiempo absoluto. Un bucle estático no representa esa señal; no se dibuja una sustitución.';
  if (c.ischemia === 'posterior') return 'El QRS posterior incluye una corrección local por derivación sin equivalente XYZ único. No se omite silenciosamente.';
  if (c.conduction === 'wpw' && b.kind === 'normal') return 'La preexcitación incorpora una onda delta adicional. Este laboratorio no representa todavía su activación completa.';
  return null;
}
export function activationOptions(b: Beat): [string, string][] {
  return [['unchanged', 'Sin cambios (control A = B)'], ...(b.kind === 'normal'
    ? CONDUCTION_EXAMPLES.map(([id, label]): [string, string] => [id, label])
    : [['auto', 'Fuente automática del caso'] as [string, string], ...VENTRICULAR_SOURCE_IDS.map(id => [id, VENTRICULAR_SOURCES[id].label] as [string, string])])];
}
/** Only two existing controls, applied after the coordinated conduction/source choice. */
export interface ActivationEdits {
  qrsMs?: number;
  activationModel?: NonNullable<ECGCase['activationModel']>;
}
export function activationCandidate(c: ECGCase, b: Beat, choice: string, edits: ActivationEdits = {}): ECGCase {
  if (!activationOptions(b).some(([id]) => id === choice)) throw Error('Alternativa de activación no válida.');
  let next = choice === 'unchanged' ? cloneCase(c) : changeCase(c, b.kind === 'normal' ? 'conduction' : 'ventricularSource', choice);
  if (edits.qrsMs !== undefined) {
    // Unlike imported cases, an interactive experiment must not silently clamp input.
    if (!Number.isFinite(edits.qrsMs) || edits.qrsMs < 60 || edits.qrsMs > 240)
      throw Error('Introduce un QRS solicitado entre 60 y 240 ms. No se ajusta silenciosamente.');
    if (edits.qrsMs !== next.qrs) next = changeCase(next, 'qrs', edits.qrsMs);
  }
  if (edits.activationModel !== undefined) {
    if (!['template', 'regional-rbbb-v1'].includes(edits.activationModel)) throw Error('Modelo de activación no válido.');
    if (edits.activationModel !== (next.activationModel ?? 'template')) next = changeCase(next, 'activationModel', edits.activationModel);
  }
  return next;
}
/** Per-event state: a PVC inside a regional case still uses its ventricular source. */
export function activationTiming(c: ECGCase, b: Beat) {
  const state = regionalActivationState(c), regional = usesRegionalActivation(c, b);
  const applied = b.kind !== 'normal' ? 'ventricular-source' : regional ? 'regional-rbbb-v1' : 'template';
  const label = regional ? 'BRD regional · experimental' : state.requested ? 'Regional no aplicado'
    : b.kind !== 'normal' ? 'Fuente ventricular' : 'Plantilla histórica';
  const note = b.kind !== 'normal'
    ? 'Este latido usa su fuente ventricular, no el reloj regional de los latidos conducidos. El perfil puede imponer un QRS mínimo.'
    : regional ? 'Reloj septal/VI fijo; el soporte VD va de 55 ms al final del QRS. Son bases de ingeniería, no tiempos anatómicos medidos.'
      : state.requested ? `${state.reason} Se usa la plantilla histórica, conservando la selección solicitada.`
        : 'Al variar QRS se estiran conjuntamente las bases temporales de la plantilla.';
  return { requested: c.activationModel ?? 'template', applied, label, note,
    regions: regional ? regionalActivationTimeline(c.qrs) : [] };
}

/** Sum the SAME temporal basis functions as signal.ts, not the polygon of kernel coefficients.
 * Sampling includes both zero endpoints; integrals use trapezoids in model-coordinate milliseconds.
 * Unlike the historical sigma-weighted contract, the reported axis integrates the sampled loop.
 */
export function sampleActivation(c: ECGCase, b: Beat): ActivationTrace {
  const limitation = activationLimitation(c, b);
  if (limitation) throw Error(limitation);
  const durationMs = qrsDuration(c, b) * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 1000) throw Error('Duración QRS no válida.');
  const kernels = qrsKernels(c, b), count = Math.ceil(durationMs), step = durationMs / count;
  const timesMs: number[] = [], xyz: Vec[] = [];
  const leads = Object.fromEntries(LEADS.map(l => [l, []])) as unknown as Record<Lead, number[]>;
  const integral: Vec = [0, 0, 0];
  let peakMagnitude = 0, pathLength = 0;
  for (let i = 0; i <= count; i++) {
    const u = i / count, v: Vec = [0, 0, 0];
    for (const k of kernels) {
      const g = qrsKernelValue(k, u);
      for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
    }
    if (!v.every(Number.isFinite)) throw Error('Trayectoria no finita.');
    timesMs.push(i === count ? durationMs : i * step); xyz.push(v);
    const p = project(v);
    for (const lead of LEADS) leads[lead].push(p[lead]);
    peakMagnitude = Math.max(peakMagnitude, Math.hypot(...v));
    if (i) {
      for (let j = 0; j < 3; j++) integral[j] += (xyz[i - 1][j] + v[j]) * step / 2;
      pathLength += Math.hypot(...v.map((n, j) => n - xyz[i - 1][j]));
    }
  }
  const p = project(integral), source = ventricularSource(c, b);
  const frontalMagnitude = Math.hypot(p.I, (2 * p.II - p.I) / Math.sqrt(3));
  const label = source?.label ?? CONDUCTION_EXAMPLES.find(([id]) => id === c.conduction)?.[1] ?? c.conduction;
  return { case: cloneCase(c), beat: { time: b.time, kind: b.kind, rr: b.rr }, label, durationMs, timing: activationTiming(c, b), timesMs, xyz, leads,
    summary: { integral, frontalAxisDeg: frontalMagnitude > 1e-9 ? axisFromLeads(p.I, p.II) : null, peakMagnitude, pathLength } };
}
export function activationPair(c: ECGCase, b: Beat, choice: string, edits: ActivationEdits = {}): ActivationPair {
  const a = sampleActivation(c, b), next = activationCandidate(c, b, choice, edits), other = sampleActivation(next, b);
  const peakLead = Math.max(...LEADS.flatMap(l => [...a.leads[l], ...other.leads[l]].map(Math.abs)));
  const range = (peak: number) => Math.max(.25, Math.ceil(peak * 1.15 * 4) / 4);
  return { a, b: other, vectorRange: range(Math.max(a.summary.peakMagnitude, other.summary.peakMagnitude)),
    leadRangeMv: range(peakLead), durationMs: Math.max(a.durationMs, other.durationMs) };
}
/** Same absolute elapsed milliseconds for A/B, never stretch different QRS durations to fit. */
export function activationAt(t: ActivationTrace, timeMs: number): { xyz: Vec; leads: Record<Lead, number> } {
  if (!Number.isFinite(timeMs)) throw Error('Instante no válido.');
  if (timeMs < 0 || timeMs > t.durationMs) return { xyz: [0, 0, 0], leads: project([0, 0, 0]) };
  const position = timeMs / t.durationMs * (t.xyz.length - 1), lo = Math.floor(position), hi = Math.min(lo + 1, t.xyz.length - 1);
  const v = t.xyz[lo].map((n, j) => n + (t.xyz[hi][j] - n) * (position - lo)) as Vec;
  return { xyz: v, leads: project(v) };
}
