import { cloneCase, type ECGCase, type Beat } from '../engine/types';
import { LEADS, type Lead } from '../engine/lead-registry';
import { project, axisFromLeads, type Vec } from '../engine/leads';
import { qrsKernels, qrsDuration, qrsKernelValue, WPW_DELTA_SECONDS, wpwDeltaVector } from '../engine/morphology';
import { VENTRICULAR_SOURCE_IDS, VENTRICULAR_SOURCES, ventricularSource } from '../engine/ventricular-source';
import { WPW_REPOLARIZATION_LIMIT } from '../presets/teaching-limits';
import { changeCase } from './case-state';
import { regionalActivationState, regionalActivationTimeline, usesRegionalActivation } from '../engine/regional-activation';
import { learnedEctopicModel, usesRealisticBase } from '../engine/realistic/scope';
import type * as LearnedEngine from '../engine/realistic/engine';

// The learned models live in the signal worker; the main thread loads them only
// when the activation lab needs a learned-base loop. The lab compares conduction
// alternatives, so it loads every class model at once.
let learned: typeof LearnedEngine | null = null;
export const learnedModelReady = () => learned !== null;
export async function ensureLearnedModel(): Promise<void> {
  if (learned) return;
  const [engine, models] = await Promise.all([import('../engine/realistic/engine'), import('../engine/realistic/models')]);
  await models.ensureAllShapeModels();
  learned = engine;
}

export interface ActivationTrace {
  case: ECGCase;
  /** Original event timing, NOT a prediction for B after a PR change. No new QT. */
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
  ['wpw', 'WPW · preexcitación'],
] as const;

/** Reject components that cannot be represented by a single static QRS vector loop. */
export function activationLimitation(c: ECGCase, b?: Beat): string | null {
  if (c.rhythm === 'vf' || c.rhythm === 'asystole' || !b) return 'Sin complejos QRS organizados para explorar.';
  if (c.rhythm === 'torsades') return 'La TV polimórfica usa una proyección variable compartida por QRS y T secundaria; es una aproximación visual, no un mecanismo de reentrada. Un bucle estático no representa esa señal; no se dibuja una sustitución.';
  if (c.ischemia === 'posterior') return 'El QRS posterior incluye una corrección local por derivación sin equivalente XYZ único. No se omite silenciosamente.';
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
    if (!['template', 'regional-rbbb-v1', 'regional-lbbb-v1'].includes(edits.activationModel)) throw Error('Modelo de activación no válido.');
    if (edits.activationModel !== (next.activationModel ?? 'template')) next = changeCase(next, 'activationModel', edits.activationModel);
  }
  return next;
}
/** Per-event state: a PVC inside a regional case still uses its ventricular source. */
export function activationTiming(c: ECGCase, b: Beat) {
  const state = regionalActivationState(c), regional = usesRegionalActivation(c, b);
  const deltaDurationMs = c.conduction === 'wpw' && b.kind === 'normal' ? WPW_DELTA_SECONDS * 1000 : null;
  const ectopic = learnedEctopicModel(c, b.kind), learnedPvc = ectopic !== null;
  const learned = (b.kind === 'normal' && !regional && usesRealisticBase(c)) || learnedPvc;
  const applied = b.kind !== 'normal' ? 'ventricular-source' : regional ? state.model : 'template';
  const label = regional ? (state.model === 'regional-lbbb-v1' ? 'BRI regional · experimental' : 'BRD regional · experimental') : state.requested ? 'Regional no aplicado'
    : ectopic === 'VPACE' ? 'Latido estimulado aprendido (PTB-XL)' : learnedPvc && b.kind === 'ventricular' ? 'Complejo ventricular aprendido (PTB-XL)' : learnedPvc ? 'Extrasístole aprendida (PTB-XL)' : learned ? 'Latido aprendido (PTB-XL)' : b.kind !== 'normal' ? 'Fuente ventricular' : deltaDurationMs ? 'Plantilla histórica + delta' : 'Plantilla histórica';
  const note = ectopic === 'VPACE'
    ? 'Complejo estimulado en el ventrículo, aprendido de pacientes con marcapasos (PTB-XL), proyectado con Dower. Su eje y su ancho son los del paciente (cambian con la semilla); elegir una fuente concreta vuelve a la plantilla histórica.'
    : learnedPvc
    ? 'Extrasístole ventricular aprendida de pacientes reales (PTB-XL), proyectada con Dower. Su eje y su ancho son los del paciente (cambian con la semilla); elegir una fuente concreta vuelve a la plantilla histórica.'
    : learned && !state.requested
    ? 'Vector cardiaco del QRS aprendido de ECG reales (PTB-XL), proyectado con Dower. Los pacientes cambian con la semilla; el eje y las amplitudes siguen los controles del caso.'
    : b.kind !== 'normal'
    ? 'Este latido usa su fuente ventricular, no el reloj regional de los latidos conducidos. El perfil puede imponer un QRS mínimo.'
    : regional && state.model === 'regional-lbbb-v1' ? 'Base inicial VD/septal fija y bases VI diferidas. Son soportes de ingeniería, no mapa anatómico ni predicción de resincronización.'
    : regional ? 'Reloj septal/VI fijo; el soporte VD va de 55 ms al final del QRS. Son bases de ingeniería, no tiempos anatómicos medidos.'
      : state.requested ? `${state.reason} Se usa ${learned ? 'el latido aprendido (PTB-XL)' : 'la plantilla histórica'}, conservando la selección solicitada.`
        : 'Al variar QRS se estiran conjuntamente las bases temporales de la plantilla.';
  return { requested: c.activationModel ?? 'template', applied, label, deltaDurationMs,
    note: deltaDurationMs ? `${note} Delta sintética adicional: 0–${deltaDurationMs} ms fijos, incluida en XYZ y en las doce derivaciones; no localiza una vía accesoria. ${WPW_REPOLARIZATION_LIMIT}` : note,
    regions: regional ? regionalActivationTimeline(c.qrs,state.model) : [] };
}

/** Sum the SAME temporal bases and eligible WPW delta as signal.ts, not the polygon of coefficients.
 * Sampling includes both zero endpoints; integrals use trapezoids in model-coordinate milliseconds.
 * Unlike the historical sigma-weighted contract, the reported axis integrates the sampled loop.
 */
export function sampleActivation(c: ECGCase, b: Beat): ActivationTrace {
  const limitation = activationLimitation(c, b);
  if (limitation) throw Error(limitation);
  const ectopicKind = b.kind === 'normal' ? null : b.kind;
  const learnedPvc = ectopicKind !== null && learnedEctopicModel(c, ectopicKind) !== null;
  if (learnedPvc && !learned) throw Error('El modelo aprendido aún se está cargando.');
  // A learned ectopic beat keeps the patient's own QRS width, as in the trace.
  const durationMs = (learnedPvc ? learned!.learnedEctopicQrsSeconds(c, ectopicKind!) : qrsDuration(c, b)) * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 1000) throw Error('Duración QRS no válida.');
  const learnedBeat = b.kind === 'normal' && !usesRegionalActivation(c, b) && usesRealisticBase(c);
  if (learnedBeat && !learned) throw Error('El modelo aprendido aún se está cargando.');
  const kernels = learnedBeat || learnedPvc ? [] : qrsKernels(c, b), count = Math.ceil(durationMs), step = durationMs / count;
  const timing = activationTiming(c, b), deltaEnd = timing.deltaDurationMs;
  if (deltaEnd !== null && durationMs < deltaEnd) throw Error('La delta no cabe en el QRS solicitado.');
  const timesMs = Array.from({ length: count + 1 }, (_, i) => i === count ? durationMs : i * step);
  // Preserve the exact delta endpoint even with fractional QRS durations; cursor
  // interpolation must not leak the extra component beyond its 45 ms support.
  if (deltaEnd !== null && !timesMs.includes(deltaEnd)) timesMs.push(deltaEnd);
  timesMs.sort((a, b) => a - b);
  const xyz: Vec[] = [];
  const leads = Object.fromEntries(LEADS.map(l => [l, []])) as unknown as Record<Lead, number[]>;
  const integral: Vec = [0, 0, 0];
  let peakMagnitude = 0, pathLength = 0;
  for (let i = 0; i < timesMs.length; i++) {
    const elapsed = timesMs[i], u = elapsed / durationMs, v: Vec = learnedBeat ? learned!.realisticQrsVector(c, u) : learnedPvc ? learned!.realisticQrsVector(c, u, ectopicKind!) : [0, 0, 0];
    for (const k of kernels) {
      const g = qrsKernelValue(k, u);
      for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
    }
    if (deltaEnd !== null && elapsed > 0 && elapsed < deltaEnd) {
      const delta = wpwDeltaVector(c, elapsed / deltaEnd);
      for (let j = 0; j < 3; j++) v[j] += delta[j];
    }
    if (!v.every(Number.isFinite)) throw Error('Trayectoria no finita.');
    xyz.push(v);
    const p = project(v);
    for (const lead of LEADS) leads[lead].push(p[lead]);
    peakMagnitude = Math.max(peakMagnitude, Math.hypot(...v));
    if (i) {
      for (let j = 0; j < 3; j++) integral[j] += (xyz[i - 1][j] + v[j]) * (elapsed - timesMs[i - 1]) / 2;
      pathLength += Math.hypot(...v.map((n, j) => n - xyz[i - 1][j]));
    }
  }
  const p = project(integral), source = ventricularSource(c, b);
  const frontalMagnitude = Math.hypot(p.I, (2 * p.II - p.I) / Math.sqrt(3));
  const label = source?.label ?? CONDUCTION_EXAMPLES.find(([id]) => id === c.conduction)?.[1] ?? c.conduction;
  return { case: cloneCase(c), beat: { time: b.time, kind: b.kind, rr: b.rr }, label, durationMs, timing, timesMs, xyz, leads,
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
  let lo = 0, hi = t.timesMs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (t.timesMs[mid] <= timeMs) lo = mid; else hi = mid;
  }
  const fraction = (timeMs - t.timesMs[lo]) / (t.timesMs[hi] - t.timesMs[lo]);
  const v = t.xyz[lo].map((n, j) => n + (t.xyz[hi][j] - n) * fraction) as Vec;
  return { xyz: v, leads: project(v) };
}
