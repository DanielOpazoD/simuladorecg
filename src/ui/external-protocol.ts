import { LEADS, type Measurement } from '../engine/types';
import { assessExternalWindow, assertExternalSamples, type AnalysisAssessment } from '../io/external-assessment';
import { externalWindow, type ExternalECG } from '../io/external-ecg';
import { validateIdentity, type SignalIdentity } from '../io/external-review';

export interface ExternalReply {
  id: number;
  kind: 'read' | 'analyze';
  startSample: number;
  assessment: AnalysisAssessment;
  measurement: Measurement | null;
  record?: ExternalECG;
  identity?: SignalIdentity;
}
function keys(value: object, allowed: readonly string[], required = allowed) {
  if (Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value,k))) throw Error('Campos de respuesta no admitidos.');
}
const finiteOrNull = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n));
function validateMeasurement(value: unknown): asserts value is Measurement {
  if (!value || typeof value !== 'object') throw Error('Respuesta de análisis incompleta.');
  const m = value as Measurement;
  const required = ['hr','instantHr','pr','qrs','qt','axis','pAxis','tAxis','rr','qtc','quality','beats','evidence','window','detectedPeaks'];
  keys(m, [...required, 'support','rejected'], required);
  for (const key of ['hr','instantHr','pr','qrs','qt','axis','pAxis','tAxis','rr'] as const)
    if (!finiteOrNull(m[key])) throw Error('Respuesta de análisis no finita.');
  if (!m.qtc || Object.values(m.qtc).length !== 4 || Object.values(m.qtc).some(x => !finiteOrNull(x))) throw Error('QTc no válido.');
  keys(m.qtc, ['bazett','fridericia','framingham','hodges']);
  if (!m.window || m.window.start !== 0 || m.window.end !== 10 || typeof m.quality !== 'string' || m.quality.length > 4000) throw Error('Ventana o calidad de análisis no válida.');
  if (!Array.isArray(m.beats) || m.beats.length > 1000 || !Array.isArray(m.detectedPeaks) || m.detectedPeaks.length > 1000 ||
    m.detectedPeaks.some(x => !Number.isFinite(x) || x < 0 || x >= 10)) throw Error('Candidatos no válidos.');
  for (const b of m.beats) {
    for (const key of ['peak','onset','offset','rr','qrs','axis','noise'] as const)
      if (!Number.isFinite(b[key])) throw Error('Candidato incompleto.');
    for (const key of ['pOnset','pPeak','tPeak','tEnd','tTangentEnd','pr','qt'] as const)
      if (!finiteOrNull(b[key])) throw Error('Límite no válido.');
  }
  for (const key of ['hr','pr','qrs','qt','axis'] as const) {
    const e = m.evidence?.[key];
    if (!e || !['usable','review','unavailable'].includes(e.status) || !Number.isSafeInteger(e.count) || !Number.isSafeInteger(e.total) ||
      e.count < 0 || e.total < e.count || typeof e.reason !== 'string' || e.reason.length > 4000) throw Error('Evidencia de análisis no válida.');
  }
}
/** Recompute the cheap technical gate at the UI boundary. Never trust an allowed=true flag alone. */
export function validateExternalReply(value: unknown, id: number, kind: 'read' | 'analyze', record: ExternalECG | null, startSample: number): ExternalReply {
  if (!value || typeof value !== 'object') throw Error('Respuesta del worker inválida.');
  const data = value as ExternalReply;
  keys(data, kind === 'read' ? ['id','kind','startSample','assessment','measurement','record','identity'] : ['id','kind','startSample','assessment','measurement']);
  if (data.id !== id || data.kind !== kind || data.startSample !== startSample) throw Error('Respuesta no corresponde a esta solicitud/ventana.');
  const r = kind === 'read' ? data.record : record;
  if (!r) throw Error('Respuesta sin registro.');
  assertExternalSamples(r, false);
  keys(r, ['fs','samples','duration','leads','provenance']);
  if (r.samples !== r.leads.I.length || r.duration !== r.samples / r.fs) throw Error('Registro inconsistente.');
  if (kind === 'read') {
    if (r.provenance) keys(r.provenance, ['format','origin','checksumVerified','channels']);
    const identity = validateIdentity(data.identity);
    if (identity.fs !== r.fs || identity.samples !== r.samples) throw Error('Huella incompatible con el registro.');
    if (!r.provenance || !['csv','wfdb16'].includes(r.provenance.format) || r.provenance.origin !== 'unverified' ||
      typeof r.provenance.checksumVerified !== 'boolean' || !Array.isArray(r.provenance.channels) || r.provenance.channels.length !== 12 ||
      new Set(r.provenance.channels.map(c => c.lead)).size !== 12 || r.provenance.channels.some(c => !LEADS.includes(c.lead) ||
        !Number.isFinite(c.gain) || c.gain <= 0 || !Number.isFinite(c.baseline) || !['mV','uV'].includes(c.unit))) throw Error('Conversión de archivo inválida.');
  }
  for (const channel of r.provenance.channels) keys(channel, ['lead','gain','baseline','unit']);
  const expected = assessExternalWindow(externalWindow(r, startSample / r.fs));
  if (JSON.stringify(data.assessment) !== JSON.stringify(expected)) throw Error('Aptitud no corresponde a las muestras recibidas.');
  if (expected.analysisAllowed) validateMeasurement(data.measurement);
  else if (data.measurement !== null) throw Error('Se recibió una medición sobre una entrada excluida.');
  return data;
}
