import { LEADS, type Lead, type Measurement, type Signal } from '../engine/types';

type Samples = Pick<Signal, 'fs' | 'leads'>;
export const EXTERNAL_ANALYSIS_POLICY = 'external-500hz-10s-v1';
export const ANALYSIS_LEADS = ['I', 'II', 'V1', 'V5'] as const;
export interface InputIssue {
  code: 'sampling-domain' | 'flat-channel' | 'extreme-plateau' | 'identical-channels';
  lead?: Lead;
  blocks: boolean;
  reason: string;
}
export interface AnalysisAssessment {
  policy: typeof EXTERNAL_ANALYSIS_POLICY;
  status: 'exploratory' | 'manual-only';
  analysisAllowed: boolean;
  fs: number;
  samples: number;
  resolutionMs: number;
  usedLeads: readonly Lead[];
  issues: InputIssue[];
  clinicalValidation: false;
}

/** Shape/integrity, not physiology. A readable recording may still be outside the analysis domain. */
export function assertExternalSamples(input: Samples, windowOnly = true): void {
  if (!input || !Number.isSafeInteger(input.fs) || input.fs < 100 || input.fs > 1000 || !input.leads)
    throw Error('Muestras externas: frecuencia o canales inválidos.');
  const n = input.leads.I?.length;
  if (!Number.isSafeInteger(n) || n < 10 * input.fs || n > 60 * input.fs || (windowOnly && n !== 10 * input.fs))
    throw Error('Muestras externas: duración incompatible.');
  if (Object.keys(input.leads).length !== LEADS.length) throw Error('Muestras externas: doce canales requeridos.');
  for (const lead of LEADS) {
    const values = input.leads[lead];
    if (!(values instanceof Float64Array) || values.length !== n) throw Error(`Muestras externas: canal ${lead} inconsistente.`);
    for (const value of values) if (!Number.isFinite(value) || Math.abs(value) > 10000)
      throw Error(`Muestras externas: valor inválido en ${lead}.`);
  }
}

/** Conservative technical screen, NOT diagnostic signal quality or clinical validation.
 * 500 Hz/10 s matches the external delineation fixtures evaluated by this project.
 * Other reader-supported rates remain viewable/measurable manually, without resampling.
 * A >=100 ms EXACT plateau at the observed global extremum flags possible clipping;
 * physical samples alone cannot prove ADC saturation. No amplitude/diagnostic cutoff.
 */
export function assessExternalWindow(input: Samples): AnalysisAssessment {
  assertExternalSamples(input);
  const { fs, leads } = input, issues: InputIssue[] = [], n = leads.I.length;
  if (fs !== 500) issues.push({code:'sampling-domain', blocks:true,
    reason:`${fs} Hz: fuera del dominio operativo de análisis de esta versión (500 Hz / 10 s). Visor y revisión manual disponibles; no se remuestrea.`});
  for (const lead of LEADS) {
    const v = leads[lead]; let min = Infinity, max = -Infinity;
    for (const x of v) { min = Math.min(min, x); max = Math.max(max, x); }
    const blocks = (ANALYSIS_LEADS as readonly Lead[]).includes(lead);
    if (min === max) {
      issues.push({code:'flat-channel', lead, blocks,
        reason:`${lead}: canal sin variación. No distingue desconexión de ausencia de actividad; no constituye diagnóstico.`});
      continue;
    }
    let run = 0, longest = 0, previous = NaN;
    for (const x of v) {
      run = (x === min || x === max) ? (x === previous ? run + 1 : 1) : 0;
      longest = Math.max(longest, run); previous = x;
    }
    if (longest >= Math.ceil(fs * .1)) issues.push({code:'extreme-plateau', lead, blocks,
      reason:`${lead}: meseta exacta de ${(longest / fs * 1000).toFixed(0)} ms en un extremo. Posible recorte, no saturación confirmada.`});
  }
  for (let a = 0; a < ANALYSIS_LEADS.length; a++) for (let b = a + 1; b < ANALYSIS_LEADS.length; b++) {
    const first = ANALYSIS_LEADS[a], second = ANALYSIS_LEADS[b];
    if (leads[first].every((x, i) => x === leads[second][i])) issues.push({code:'identical-channels', blocks:true,
      reason:`${first} y ${second}: canales idénticos muestra a muestra; revisar procedencia. No se reconstruyen derivaciones.`});
  }
  const analysisAllowed = !issues.some(i => i.blocks);
  return {policy:EXTERNAL_ANALYSIS_POLICY, status:analysisAllowed ? 'exploratory' : 'manual-only', analysisAllowed,
    fs, samples:n, resolutionMs:1000 / fs, usedLeads:[...ANALYSIS_LEADS], issues, clinicalValidation:false};
}

/** Injectable only for testing the gate: never run the analyzer on an excluded input. */
export function evaluateExternalWindow(input: Samples, analyze: (samples: Samples) => Measurement) {
  const assessment = assessExternalWindow(input);
  return {assessment, measurement:assessment.analysisAllowed ? analyze(input) : null};
}
