import { LEADS, type Lead, type Signal } from '../engine/types';

/** A recording is samples, not a synthetic case. Never attach truth, events or diagnosis. */
export interface ExternalECG extends Pick<Signal, 'fs' | 'leads'> {
  samples: number;
  duration: number;
  provenance: {
    format: 'wfdb16' | 'csv';
    origin: 'unverified';
    checksumVerified: boolean;
    channels: { lead: Lead; gain: number; baseline: number; unit: 'mV' | 'uV' }[];
  };
}
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
const NUM = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function numeric(s: string, label: string): number {
  if (typeof s !== 'string' || s.length > 64 || !NUM.test(s) || !Number.isFinite(Number(s))) throw Error(`${label}: número ausente o no finito.`);
  return Number(s);
}
function integer(s: string, label: string): number {
  const v = numeric(s, label);
  if (!Number.isSafeInteger(v)) throw Error(`${label}: se requiere un entero.`);
  return v;
}
function dimensions(fs: number, samples: number) {
  if (!Number.isSafeInteger(fs) || fs < 100 || fs > 1000) throw Error('Muestreo admitido: entero entre 100 y 1000 Hz. No se remuestrea.');
  if (!Number.isSafeInteger(samples) || samples < fs * 10 || samples > fs * 60)
    throw Error('Se requieren entre 10 y 60 segundos completos, sin muestras ausentes.');
}
function leadName(name: string): Lead {
  const l = LEADS.find(l => l.toLowerCase() === name.toLowerCase());
  if (!l) throw Error(`Derivación no admitida: ${name.slice(0, 30)}. No se fabrican canales ausentes.`);
  return l;
}
function uniqueLeads(names: string[]): Lead[] {
  if (names.length !== 12) throw Error('Se requieren las doce derivaciones estándar.');
  const leads = names.map(leadName);
  if (new Set(leads).size !== 12) throw Error('Derivaciones duplicadas o ausentes.');
  return leads;
}
function unitName(s: string): 'mV' | 'uV' {
  if (s === 'mV') return 'mV';
  if (['uV', 'µV', 'μV'].includes(s)) return 'uV';
  throw Error('Declara unidades mV o uV; no se adivina la escala.');
}
function allocate(n: number) { return Object.fromEntries(LEADS.map(l => [l, new Float64Array(n)])) as ExternalECG['leads']; }
function physical(digital: number, gain: number, baseline: number, unit: 'mV' | 'uV') {
  const v = (digital - baseline) / gain / (unit === 'uV' ? 1000 : 1);
  if (!Number.isFinite(v) || Math.abs(v) > 10000) throw Error('Escala no representable o amplitud superior al límite técnico de 10 000 mV.');
  return v;
}

/** Strict, declared subset of WFDB: one multiplexed format-16 file, no offsets/skew/segments.
 * https://physionet.org/physiotools/wag/header-5.htm and signal-5.htm
 * Explicit gain/units and all signal fields are required; no default 200 ADC/mV assumption.
 */
export function parseWfdb16(header: string, data: ArrayBuffer, dataName: string): ExternalECG {
  if (header.length > 65536 || data.byteLength > MAX_FILE_BYTES) throw Error('Archivo demasiado grande.');
  const lines = header.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const record = (lines[0] ?? '').split(/\s+/);
  if (!/^[\w-]+$/.test(record[0]) || record.length < 4) throw Error('Encabezado WFDB simple con frecuencia y longitud explícitas requerido. No admite multisegmentos.');
  if (integer(record[1], 'Canales') !== 12 || lines.length !== 13) throw Error('WFDB requiere exactamente doce líneas de derivaciones.');
  const fs = numeric(record[2], 'Hz'), n = integer(record[3], 'Muestras');
  dimensions(fs, n);
  if (data.byteLength !== n * 12 * 2) throw Error('Longitud DAT incorrecta: archivo truncado, sobrante o pareja equivocada.');
  const fields = lines.slice(1).map(l => l.split(/\s+/));
  const names = uniqueLeads(fields.map(f => f.slice(8).join(' ')));
  const bytes = new DataView(data), leads = allocate(n);
  const channels = fields.map((f, j) => {
    if (!/^[\w.-]+\.dat$/i.test(f[0]) || f[0] !== dataName) throw Error('El nombre DAT no coincide con el encabezado; selecciona la pareja original.');
    if (f[1] !== '16') throw Error('Sólo WFDB 16 sin x, skew ni offset. No admite 212, 24, 32 ni compresión.');
    const spec = /^([^()/]+)(?:\(([+-]?\d+)\))?\/([^/]+)$/.exec(f[2]);
    if (!spec) throw Error('Faltan ganancia o unidades explícitas en WFDB.');
    const gain = numeric(spec[1], 'Ganancia'), unit = unitName(spec[3]);
    if (gain <= 0) throw Error('La ganancia ADC debe ser positiva y calibrada.');
    const bits = integer(f[3], 'Resolución ADC'), zero = integer(f[4], 'Cero ADC');
    if (bits < 1 || bits > 16) throw Error('Resolución ADC no admitida.');
    const baseline = spec[2] === undefined ? zero : integer(spec[2], 'Baseline');
    const initial = integer(f[5], 'Primera muestra'), checksum = integer(f[6], 'Checksum');
    if (initial < -32768 || initial > 32767 || checksum < -32768 || checksum > 65535 || integer(f[7], 'Bloque') !== 0)
      throw Error('Inicial/checksum/bloque WFDB no admitido.');
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const raw = bytes.getInt16((i * 12 + j) * 2, true);
      if (raw === -32768) throw Error('WFDB contiene muestras ausentes (-32768). No se interpolan ni se rellenan.');
      if (i === 0 && raw !== initial) throw Error('Primera muestra incorrecta: pareja WFDB no íntegra.');
      sum = (sum + raw) & 65535;
      leads[names[j]][i] = physical(raw, gain, baseline, unit);
    }
    if (sum !== (checksum & 65535)) throw Error(`Checksum incorrecto en ${names[j]}.`);
    return { lead: names[j], gain, baseline, unit };
  });
  return { fs, samples: n, duration: n / fs, leads, provenance: { format: 'wfdb16', origin: 'unverified', checksumVerified: true, channels } };
}

export interface CsvOptions { fs: number; unit: string }
/** CSV: 12 named columns, optionally time_s; no quoting, missing rows or hidden resampling. */
export function parseECGCsv(text: string, options?: CsvOptions): ExternalECG {
  if (text.length > MAX_FILE_BYTES) throw Error('CSV demasiado grande.');
  let rows = 0; for (const char of text) if (char === '\n' && ++rows > 60003) throw Error('CSV excede el máximo de 60 000 filas de muestras.');
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines[0]?.startsWith('#')) {
    const meta = /^# ECG-LAB CSV 1; fs=(\d+); units=(mV|uV)$/.exec(lines.shift()!);
    if (!meta) throw Error('Metadatos CSV no admitidos; usa la plantilla o declara Hz/unidades.');
    if (options && (options.fs !== Number(meta[1]) || unitName(options.unit) !== meta[2])) throw Error('Hz/unidades manuales contradicen los metadatos del CSV.');
    options = { fs: Number(meta[1]), unit: meta[2] };
  }
  if (!options) throw Error('CSV sin metadatos: declara frecuencia (Hz) y unidades.');
  const { fs } = options, unit = unitName(options.unit);
  const header = (lines.shift() ?? '').split(',').map(s => s.trim());
  const timeIndex = header.indexOf('time_s');
  const names = uniqueLeads(header.filter((_, i) => i !== timeIndex));
  if (header.length !== 12 + Number(timeIndex >= 0)) throw Error('Columnas CSV no admitidas.');
  const n = lines.length; dimensions(fs, n);
  const leads = allocate(n);
  for (let i = 0; i < n; i++) {
    const row = lines[i].split(',').map(s => s.trim());
    if (row.length !== header.length) throw Error(`Fila ${i + 2}: columnas ausentes o sobrantes.`);
    if (timeIndex >= 0 && Math.abs(numeric(row[timeIndex], 'time_s') - i / fs) > 1e-6)
      throw Error(`Fila ${i + 2}: tiempo irregular, ausente o incompatible con Hz. Debe comenzar en cero.`);
    let j = 0;
    for (let k = 0; k < row.length; k++) if (k !== timeIndex)
      leads[names[j++]][i] = physical(numeric(row[k], `Fila ${i + 2}`), 1, 0, unit);
  }
  return { fs, samples: n, duration: n / fs, leads, provenance: { format: 'csv', origin: 'unverified', checksumVerified: false,
    channels: names.map(lead => ({ lead, gain: 1, baseline: 0, unit })) } };
}

export function externalWindow(record: ExternalECG, startSeconds: number): Pick<Signal, 'fs' | 'leads'> {
  const start = Math.round(startSeconds * record.fs), n = 10 * record.fs;
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || start + n > record.samples) throw Error('Ventana de análisis de 10 s fuera del registro.');
  return { fs: record.fs, leads: Object.fromEntries(LEADS.map(l => [l, record.leads[l].slice(start, start + n)])) as ExternalECG['leads'] };
}
export function exportECGCsv(record: ExternalECG): string {
  const lines = [`# ECG-LAB CSV 1; fs=${record.fs}; units=mV`, 'time_s,' + LEADS.join(',')];
  for (let i = 0; i < record.samples; i++) lines.push([i / record.fs, ...LEADS.map(l => record.leads[l][i])].map(v => Object.is(v, -0) ? '-0' : String(v)).join(','));
  return lines.join('\n') + '\n';
}
