import { LEADS, type ECGCase, type Measurement, type MetricKey, type Signal } from '../engine/types';
import { externalWindow, type ExternalECG } from '../io/external-ecg';
import { assessExternalWindow, type AnalysisAssessment } from '../io/external-assessment';
import { validateBuild, validateIdentity, type BuildProvenance, type SignalIdentity } from '../io/external-review';
import { buildProvenance } from './build-provenance';

/** Only the synthetic variant owns a case, truth or generator events. */
export interface SyntheticComparisonTrace {
  sourceKind: 'synthetic';
  case: ECGCase;
  signal: Signal;
  measurement: Measurement;
  capturedWith: BuildProvenance;
}
export interface ExternalComparisonTrace {
  sourceKind: 'external';
  signal: Pick<Signal, 'fs' | 'duration' | 'leads'>;
  measurement: Measurement | null;
  capturedWith: BuildProvenance;
  external: {
    identity: SignalIdentity;
    startSample: number;
    provenance: ExternalECG['provenance'];
    assessment: AnalysisAssessment;
  };
}
export type ComparisonTrace = SyntheticComparisonTrace | ExternalComparisonTrace;
export interface ExternalComparisonInput {
  record: ExternalECG;
  identity: SignalIdentity;
  assessment: AnalysisAssessment;
  measurement: Measurement | null;
  startSample: number;
}
export type ComparisonView = {
  alignment: 'record' | 'beat' | 'manual'; start: number; beatA: number; beatB: number; rangeMv: number;
  /** Integer origins within each copied ten-second segment; not detected QRS boundaries. */
  manualA?: number; manualB?: number;
};
export const DEFAULT_COMPARISON_VIEW: ComparisonView = { alignment: 'record', start: 0, beatA: 0, beatB: 0, rangeMv: 2 };
export interface ComparisonWindow { startA: number; startB: number; duration: number; axisStart: number }

/** Copies, never regenerates, the first ten seconds accepted by the synthetic session. */
export function captureTrace(c: ECGCase, s: Signal, m: Measurement): SyntheticComparisonTrace {
  if (!Number.isSafeInteger(s.fs) || s.fs < 100 || s.fs > 4000 || !Number.isFinite(s.duration) || s.duration < 10)
    throw new Error('La comparación requiere al menos 10 s y una frecuencia de muestreo válida.');
  const n = 10 * s.fs, leads = {} as Signal['leads'];
  for (const lead of LEADS) {
    if (!s.leads[lead] || s.leads[lead].length < n) throw new Error('Faltan muestras de ' + lead);
    leads[lead] = s.leads[lead].slice(0, n);
    if (!leads[lead].every(Number.isFinite)) throw new Error('Muestras no finitas en ' + lead);
  }
  return { sourceKind:'synthetic', capturedWith:buildProvenance(), case:structuredClone(c), measurement:structuredClone(m), signal:{
    fs:s.fs, duration:10, leads, truth:structuredClone(s.truth), warnings:[...s.warnings],
    events:{
      beats:s.events.beats.filter(b => b.time >= 0 && b.time < 10).map(b => ({...b})),
      atria:s.events.atria.filter(a => a.time >= 0 && a.time < 10).map(a => ({...a})),
      spikes:s.events.spikes.filter(t => t >= 0 && t < 10),
    },
  }};
}

/** Input is an already verified reader result. Recheck its bounds/policy; no detector is run here.
 * Retain the full-record fingerprint and the selected absolute interval. Do NOT relabel
 * that fingerprint as a hash of the copied segment. No file name, case or truth is copied.
 */
export function captureExternalTrace(input: ExternalComparisonInput, build = buildProvenance()): ExternalComparisonTrace {
  const {record, startSample, measurement} = input, identity = validateIdentity(input.identity);
  if (identity.fs !== record.fs || identity.samples !== record.samples ||
      record.duration !== record.samples / record.fs ||
      !Number.isSafeInteger(startSample) || startSample < 0 || startSample + 10 * record.fs > record.samples)
    throw Error('Identidad o ventana externa incompatible.');
  const samples = externalWindow(record, startSample / record.fs), assessment = assessExternalWindow(samples);
  if (JSON.stringify(assessment) !== JSON.stringify(input.assessment) ||
      (!assessment.analysisAllowed && measurement !== null) || (assessment.analysisAllowed && measurement === null))
    throw Error('Aptitud o análisis no corresponde a la ventana aceptada.');
  if (measurement && (!Number.isFinite(measurement.window.start) || !Number.isFinite(measurement.window.end) ||
      measurement.window.start < 0 || measurement.window.end > 10 || measurement.window.start >= measurement.window.end))
    throw Error('Ventana de medición externa incompatible.');
  return {
    sourceKind:'external', capturedWith:validateBuild(build), signal:{fs:record.fs, duration:10, leads:samples.leads},
    measurement:measurement ? structuredClone(measurement) : null,
    external:{identity, startSample, provenance:structuredClone(record.provenance), assessment},
  };
}
export const traceName = (x:ComparisonTrace) => x.sourceKind === 'synthetic' ? x.case.name
  : `Archivo ${x.external.provenance.format === 'wfdb16' ? 'WFDB' : 'CSV'} · ${(x.external.startSample / x.signal.fs).toFixed(3)}–${(x.external.startSample / x.signal.fs + 10).toFixed(3)} s`;
export const traceStart = (x:ComparisonTrace) => x.sourceKind === 'external' ? x.external.startSample / x.signal.fs : 0;
export const hasGeneratorBeats = (x:ComparisonTrace): x is SyntheticComparisonTrace => x.sourceKind === 'synthetic' && x.signal.events.beats.length > 0;

export function comparisonWindow(a: ComparisonTrace, b: ComparisonTrace, v: ComparisonView): ComparisonWindow {
  if (a.signal.fs !== b.signal.fs) throw new Error(`Muestreo incompatible: A ${a.signal.fs} Hz / B ${b.signal.fs} Hz. Se conservan ambas copias; no se remuestrean ni se calculan diferencias.`);
  if (v.alignment === 'beat') {
    if (!hasGeneratorBeats(a) || !hasGeneratorBeats(b)) throw Error('La alineación del generador sólo existe entre dos señales sintéticas. Para archivos usa orígenes manuales.');
    const ba = a.signal.events.beats[v.beatA], bb = b.signal.events.beats[v.beatB];
    if (!ba || !bb || !Number.isFinite(ba.time) || !Number.isFinite(bb.time)) throw new Error('Selecciona un QRS del generador en cada señal.');
    const fs = a.signal.fs;
    return {startA:Math.round(ba.time * fs) / fs - .2, startB:Math.round(bb.time * fs) / fs - .2, duration:1.2, axisStart:-.2};
  }
  if (v.alignment === 'manual') {
    const ia = v.manualA ?? 0, ib = v.manualB ?? 0;
    if (!Number.isSafeInteger(ia) || !Number.isSafeInteger(ib) || ia < 0 || ib < 0 ||
        ia >= a.signal.leads.I.length || ib >= b.signal.leads.I.length) throw Error('Los orígenes manuales deben ser índices enteros dentro de cada tramo.');
    return {startA:ia / a.signal.fs, startB:ib / b.signal.fs, duration:2, axisStart:0};
  }
  if (!Number.isFinite(v.start) || v.start < 0 || v.start > 8) throw new Error('El inicio debe estar entre 0 y 8 s.');
  const start = Math.round(v.start * a.signal.fs) / a.signal.fs;
  return {startA:start, startB:start, duration:2, axisStart:start};
}

/** Descriptive sampled difference, not a diagnostic/fidelity score. Never zero-fill. */
export function leadDifferences(a: ComparisonTrace, b: ComparisonTrace, w: ComparisonWindow) {
  if (a.signal.fs !== b.signal.fs) throw new Error('Frecuencias incompatibles.');
  const fs = a.signal.fs, ia = Math.round(w.startA * fs), ib = Math.round(w.startB * fs), n = Math.round(w.duration * fs);
  return LEADS.map(lead => {
    let count = 0, sum = 0, squares = 0, max = 0;
    for (let k = 0; k < n; k++) {
      const va = a.signal.leads[lead][ia + k], vb = b.signal.leads[lead][ib + k];
      if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
      const d = vb - va;
      count++; sum += d; squares += d * d; max = Math.max(max, Math.abs(d));
    }
    return {lead, samples:count, coverage:n ? count / n : 0,
      biasMv:count ? sum / count : null, rmsMv:count ? Math.sqrt(squares / count) : null, maxAbsMv:count ? max : null};
  });
}

const LABELS: Record<string, string> = {
  rhythm: 'Ritmo', ventricularSource: 'Fuente ventricular', av: 'Conducción AV', conduction: 'Conducción QRS',
  ischemia: 'Lesión', overload: 'Sobrecarga', electrolyte: 'Electrolitos / voltaje', hr: 'FC configurada (lpm)',
  atrialRate: 'Frecuencia auricular (lpm)', pr: 'PR configurado (ms)', qrs: 'QRS configurado (ms)', qtc: 'QTc configurado (ms)',
  axis: 'Eje QRS configurado (°)', pAxis: 'Eje P (°)', tAxis: 'Eje T (°)', pAmp: 'Amplitud P', qrsAmp: 'Amplitud QRS',
  tAmp: 'Amplitud T', st: 'Intensidad de lesión', phase: 'Fase', filter: 'Filtro', notch: 'Notch (Hz)', seed: 'Semilla',
  transition: 'Transición', septalQ: 'Q septal', ectopy: 'Ectopia', coupling: 'Acoplamiento', variability: 'Variabilidad',
  respiratoryRate: 'Frecuencia respiratoria', flutterPattern: "Secuencia de conducción flutter", flutterRatio: 'Relación flutter', pacing: 'Estimulación', escape: 'Escape',
  stShape: 'Forma ST', mainsFrequency: 'Red (Hz)', 'artifacts.baseline': 'Deriva basal', 'artifacts.muscle': 'Ruido muscular',
  'artifacts.mains': 'Interferencia de red', 'artifacts.loose': 'Electrodo suelto', 'artifacts.reversed': 'Brazos invertidos',
};
function settings(c: ECGCase): Record<string, unknown> {
  const {view: _view, name: _name, presetId: _id, version: _version, artifacts, ...model} = c;
  return {...model, ...Object.fromEntries(Object.entries(artifacts).map(([k,v]) => ['artifacts.' + k, v]))};
}
export function changedSettings(a: ECGCase, b: ECGCase) {
  const aa = settings(a), bb = settings(b);
  return Object.keys(aa).filter(key => aa[key] !== bb[key]).map(key => ({key, label: LABELS[key] ?? key, a: aa[key], b: bb[key]}));
}
export function metricDifferences(a: Measurement, b: Measurement) {
  const keys: [MetricKey, string, string][] = [['hr','FC','lpm'],['pr','PR','ms'],['qrs','QRS','ms'],['qt','QT','ms'],['axis','Eje QRS','°']];
  const sameWindow = a.window.start === b.window.start && a.window.end === b.window.end;
  return keys.map(([key,label,unit]) => {
    const av = a[key], bv = b[key], ea = a.evidence[key], eb = b.evidence[key];
    const comparable = sameWindow && av !== null && bv !== null && Number.isFinite(av) && Number.isFinite(bv) && ea.status === 'usable' && eb.status === 'usable';
    const d = comparable ? bv! - av! : null;
    return {key,label,unit,a:av,b:bv,statusA:ea.status,statusB:eb.status, reasonA:ea.reason, reasonB:eb.reason,
      delta: d === null ? null : key === 'axis' ? ((d + 540) % 360) - 180 : d};
  });
}

/** Mixed sources have different audit paths. Show the estimates but do not subtract them.
 * External/external deltas also require a known identical analyzer build and equal relative
 * measurement windows. This is an engineering comparison, not a longitudinal diagnosis.
 */
export function traceMetricDifferences(a:ComparisonTrace, b:ComparisonTrace) {
  const keys: [MetricKey,string,string][] = [['hr','FC','lpm'],['pr','PR','ms'],['qrs','QRS','ms'],['qt','QT','ms'],['axis','Eje QRS','°']];
  const sourceReason = a.sourceKind !== b.sourceKind ? 'Procedimientos diferentes: auditoría sintética frente a análisis de muestras externas.'
    : a.sourceKind === 'external' && (a.capturedWith.analysisSourceSha256 === 'unknown' || a.capturedWith.analysisSourceSha256 !== b.capturedWith.analysisSourceSha256)
      ? 'No consta el mismo código de analizador en ambas capturas.' : '';
  const measured = a.measurement && b.measurement ? metricDifferences(a.measurement,b.measurement) : null;
  return keys.map(([key,label,unit],i) => {
    const row = measured?.[i] ?? {key,label,unit,a:a.measurement?.[key] ?? null,b:b.measurement?.[key] ?? null,
      statusA:a.measurement?.evidence[key].status ?? 'unavailable',statusB:b.measurement?.evidence[key].status ?? 'unavailable',
      reasonA:a.measurement?.evidence[key].reason ?? 'Análisis no ejecutado para este tramo.',
      reasonB:b.measurement?.evidence[key].reason ?? 'Análisis no ejecutado para este tramo.',delta:null};
    return {...row, delta:sourceReason || a.signal.fs !== b.signal.fs ? null : row.delta,
      reasonDelta:sourceReason || (row.delta === null ? 'Medida ausente, en revisión o ventanas no equivalentes.' : 'Diferencia descriptiva entre estimaciones, no cambio diagnóstico.')};
  });
}

function exportAnyComparison(a:ComparisonTrace,b:ComparisonTrace,view:ComparisonView,version:string) {
  const window = comparisonWindow(a,b,view);
  const sampledDifferences = leadDifferences(a,b,window);
  const manualOrigin = {A:Math.round(window.startA * a.signal.fs),B:Math.round(window.startB * b.signal.fs)};
  const alignmentSource = view.alignment === 'beat' ? 'synthetic QRS onset rounded to nearest sample; not clinical delineation'
    : view.alignment === 'manual' ? 'operator-selected integer sample origins; no clinical landmark or automatic matching implied' : 'recording time';
  const physical = (x:ComparisonTrace) => ({fs:x.signal.fs, duration:10, units:'mV',
    leads:Object.fromEntries(LEADS.map(l => [l,Array.from(x.signal.leads[l])])), measurement:structuredClone(x.measurement)});
  // Preserve the pre-existing two-synthetic export shape. v2 is explicit for new source types.
  if (a.sourceKind === 'synthetic' && b.sourceKind === 'synthetic')
    return exportSyntheticComparison(a,b,view,version);
  const serialize = (x:ComparisonTrace) => x.sourceKind === 'external'
    ? {sourceKind:'external',...physical(x),capturedWith:structuredClone(x.capturedWith),
       recordIdentity:structuredClone(x.external.identity),recordWindow:{startSample:x.external.startSample,samples:10*x.signal.fs},
       acquisition:structuredClone(x.external.provenance),assessment:structuredClone(x.external.assessment),
       measurementMethod:'sample-only; no model audit',measurementTimeBase:'relative to captured ten-second segment'}
    : {sourceKind:'synthetic',...physical(x),capturedWith:structuredClone(x.capturedWith),
       case:structuredClone(x.case),events:structuredClone(x.signal.events),warnings:[...x.signal.warnings],
       measurementMethod:'sample analysis with synthetic model audit',measurementTimeBase:'relative to first ten seconds'};
  return {kind:'ecg-lab-comparison',schemaVersion:2,appVersion:version,syntheticOnly:false,clinicalValidation:false,exportedWith:buildProvenance(),
    window,view:{...view},alignmentSource,alignmentSamples:manualOrigin,
    alignmentRecordSamples:{A:Math.round(traceStart(a)*a.signal.fs)+manualOrigin.A,B:Math.round(traceStart(b)*b.signal.fs)+manualOrigin.B},
    A:serialize(a),B:serialize(b),changedSettings:null,metrics:traceMetricDifferences(a,b),sampledDifferences,
    limitations:['Source/acquisition may differ. Not a clinical similarity or evolution score.',
      'No resampling, amplitude normalization, time warping or synthetic truth for external traces.',
      'Original full-record fingerprint plus captured window identifies external origin; it is not authentication or anonymization.']};
}

function exportSyntheticComparison(a:SyntheticComparisonTrace,b:SyntheticComparisonTrace,view:ComparisonView,version:string) {
  const window=comparisonWindow(a,b,view);
  const serialize=(x:SyntheticComparisonTrace)=>({case:structuredClone(x.case),fs:x.signal.fs,duration:10,units:'mV',
    leads:Object.fromEntries(LEADS.map(l=>[l,Array.from(x.signal.leads[l])])),events:structuredClone(x.signal.events),
    measurement:structuredClone(x.measurement),warnings:[...x.signal.warnings]});
  return {kind:'ecg-lab-comparison',schemaVersion:1,appVersion:version,syntheticOnly:true,clinicalValidation:false,
    window,view:{...view},alignmentSource:view.alignment==='beat'?'synthetic QRS onset rounded to nearest sample; not clinical delineation':
      view.alignment==='manual'?'operator-selected integer sample origins; no clinical landmark or automatic matching implied':'recording time',
    A:serialize(a),B:serialize(b),changedSettings:changedSettings(a.case,b.case),
    metrics:metricDifferences(a.measurement,b.measurement),sampledDifferences:leadDifferences(a,b,window)};
}
export function comparisonExport(a:SyntheticComparisonTrace,b:SyntheticComparisonTrace,view:ComparisonView,version:string):ReturnType<typeof exportSyntheticComparison>;
export function comparisonExport(a:ComparisonTrace,b:ComparisonTrace,view:ComparisonView,version:string):ReturnType<typeof exportAnyComparison>;
export function comparisonExport(a:ComparisonTrace,b:ComparisonTrace,view:ComparisonView,version:string) {
  return exportAnyComparison(a,b,view,version);
}
