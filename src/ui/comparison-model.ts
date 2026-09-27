import { LEADS, type ECGCase, type Measurement, type MetricKey, type Signal } from '../engine/types';

/** Copies, never regenerates, the first ten seconds accepted by the UI session. */
export interface ComparisonTrace {
  case: ECGCase;
  signal: Signal;
  measurement: Measurement;
}
export type ComparisonView = { alignment: 'record' | 'beat'; start: number; beatA: number; beatB: number; rangeMv: number };
export const DEFAULT_COMPARISON_VIEW: ComparisonView = { alignment: 'record', start: 0, beatA: 0, beatB: 0, rangeMv: 2 };
export interface ComparisonWindow { startA: number; startB: number; duration: number; axisStart: number }

export function captureTrace(c: ECGCase, s: Signal, m: Measurement): ComparisonTrace {
  if (!Number.isFinite(s.fs) || s.fs < 100 || s.fs > 4000 || !Number.isFinite(s.duration) || s.duration < 10)
    throw new Error('La comparación requiere al menos 10 s y una frecuencia de muestreo válida.');
  const n = Math.floor(10 * s.fs);
  const leads = {} as Signal['leads'];
  for (const lead of LEADS) {
    if (!s.leads[lead] || s.leads[lead].length < n) throw new Error('Faltan muestras de ' + lead);
    leads[lead] = s.leads[lead].slice(0, n);
    if (!leads[lead].every(Number.isFinite)) throw new Error('Muestras no finitas en ' + lead);
  }
  return { case: structuredClone(c), measurement: structuredClone(m), signal: {
    fs: s.fs, duration: 10, leads, truth: structuredClone(s.truth), warnings: [...s.warnings],
    events: {
      beats: s.events.beats.filter(b => b.time >= 0 && b.time < 10).map(b => ({...b})),
      atria: s.events.atria.filter(a => a.time >= 0 && a.time < 10).map(a => ({...a})),
      spikes: s.events.spikes.filter(t => t >= 0 && t < 10),
    },
  }};
}

export function comparisonWindow(a: ComparisonTrace, b: ComparisonTrace, v: ComparisonView): ComparisonWindow {
  if (a.signal.fs !== b.signal.fs) throw new Error('No se remuestrean señales con frecuencias diferentes.');
  if (v.alignment === 'beat') {
    const ba = a.signal.events.beats[v.beatA], bb = b.signal.events.beats[v.beatB];
    if (!ba || !bb || !Number.isFinite(ba.time) || !Number.isFinite(bb.time))
      throw new Error('Selecciona un QRS del generador en cada señal.');
    // Sample-exact origins; no interpolation, stretching or automatic peak matching.
    const fs = a.signal.fs;
    return { startA: Math.round(ba.time * fs) / fs - .2, startB: Math.round(bb.time * fs) / fs - .2, duration: 1.2, axisStart: -.2 };
  }
  if (!Number.isFinite(v.start) || v.start < 0 || v.start > 8) throw new Error('El inicio debe estar entre 0 y 8 s.');
  const start = Math.round(v.start * a.signal.fs) / a.signal.fs;
  return { startA: start, startB: start, duration: 2, axisStart: start };
}

/** Descriptive sampled difference, not a diagnostic/fidelity score. Missing data are never zero-filled. */
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
    return { lead, samples: count, coverage: n ? count / n : 0,
      biasMv: count ? sum / count : null, rmsMv: count ? Math.sqrt(squares / count) : null, maxAbsMv: count ? max : null };
  });
}

const LABELS: Record<string, string> = {
  rhythm: 'Ritmo', ventricularSource: 'Fuente ventricular', av: 'Conducción AV', conduction: 'Conducción QRS',
  ischemia: 'Lesión', overload: 'Sobrecarga', electrolyte: 'Electrolitos / voltaje', hr: 'FC configurada (lpm)',
  atrialRate: 'Frecuencia auricular (lpm)', pr: 'PR configurado (ms)', qrs: 'QRS configurado (ms)', qtc: 'QTc configurado (ms)',
  axis: 'Eje QRS configurado (°)', pAxis: 'Eje P (°)', tAxis: 'Eje T (°)', pAmp: 'Amplitud P', qrsAmp: 'Amplitud QRS',
  tAmp: 'Amplitud T', st: 'Intensidad de lesión', phase: 'Fase', filter: 'Filtro', notch: 'Notch (Hz)', seed: 'Semilla',
  transition: 'Transición', septalQ: 'Q septal', ectopy: 'Ectopia', coupling: 'Acoplamiento', variability: 'Variabilidad',
  respiratoryRate: 'Frecuencia respiratoria', flutterRatio: 'Relación flutter', pacing: 'Estimulación', escape: 'Escape',
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

export function comparisonExport(a: ComparisonTrace, b: ComparisonTrace, view: ComparisonView, version: string) {
  const window = comparisonWindow(a,b,view);
  const serialize = (x: ComparisonTrace) => ({ case: structuredClone(x.case), fs: x.signal.fs, duration: 10, units: 'mV',
    leads: Object.fromEntries(LEADS.map(l => [l, Array.from(x.signal.leads[l])])), events: structuredClone(x.signal.events),
    measurement: structuredClone(x.measurement), warnings: [...x.signal.warnings] });
  return {kind: 'ecg-lab-comparison', schemaVersion: 1, appVersion: version, syntheticOnly: true, clinicalValidation: false,
    window, view: {...view}, alignmentSource: view.alignment === 'beat' ? 'synthetic QRS onset rounded to nearest sample; not clinical delineation' : 'recording time',
    A: serialize(a), B: serialize(b), changedSettings: changedSettings(a.case,b.case), metrics: metricDifferences(a.measurement,b.measurement),
    sampledDifferences: leadDifferences(a,b,window)};
}
