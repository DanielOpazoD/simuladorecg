import { LEADS, type Lead } from '../engine/types';
import type { ExternalECG } from './external-ecg';
import { assertExternalSamples } from './external-assessment';

export const FINGERPRINT_SCHEME = 'ecg-physical-f64le-v1';
export const MAX_ANNOTATIONS = 100;
export const MAX_REVIEW_BYTES = 128 * 1024;
export interface SignalIdentity { scheme: typeof FINGERPRINT_SCHEME; sha256: string; fs: number; samples: number; units: 'mV'; leads: readonly Lead[] }
export interface BuildProvenance { appVersion: string; commit: string; sourceSha256: string; analysisSourceSha256: string; dirty: boolean }
export type ManualKind = 'PR' | 'QRS' | 'QT';
export interface ManualBounds { lead: Lead; kind: ManualKind; startSample: number; endSample: number }
export interface ManualAnnotation extends ManualBounds { id: number; origin: 'manual'; createdWith: BuildProvenance }
export interface ReviewSidecar {
  kind: 'ecg-manual-review'; schemaVersion: 1; clinicalValidation: false;
  signal: SignalIdentity; exportedWith: BuildProvenance; annotations: ManualAnnotation[];
}

/** Canonical record identity, not file identity or anonymization.
 * UTF-8 schema/Hz/count/units/ordered leads + LEAD-MAJOR Float64 little-endian mV.
 * -0 is canonicalized to +0. NaN/Infinity are rejected, never hashed as missing data.
 */
export async function fingerprintECG(record: ExternalECG): Promise<SignalIdentity> {
  assertExternalSamples(record, false);
  if (record.samples !== record.leads.I.length || record.duration !== record.samples / record.fs) throw Error('Dimensiones de registro inconsistentes.');
  if (!globalThis.crypto?.subtle) throw Error('SHA-256 no disponible. Abre la aplicación por HTTPS; no se fabrica una huella alternativa.');
  const header = new TextEncoder().encode(`${FINGERPRINT_SCHEME}\n${record.fs}\n${record.samples}\nmV\n${LEADS.join(',')}\n`);
  const bytes = new Uint8Array(header.length + LEADS.length * record.samples * 8), view = new DataView(bytes.buffer);
  bytes.set(header); let offset = header.length;
  for (const lead of LEADS) for (const x of record.leads[lead]) { view.setFloat64(offset, x === 0 ? 0 : x, true); offset += 8; }
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return {scheme:FINGERPRINT_SCHEME, sha256:Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join(''),
    fs:record.fs, samples:record.samples, units:'mV', leads:[...LEADS]};
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Objeto de revisión inválido.');
  const o = value as Record<string, unknown>, actual = Object.keys(o);
  if (actual.length !== keys.length || keys.some(k => !Object.hasOwn(o, k))) throw Error('Campos de revisión ausentes o no admitidos.');
  return o;
}
function hash(value: unknown, len: number) { return typeof value === 'string' && new RegExp(`^[a-f0-9]{${len}}$`).test(value); }
export function validateBuild(value: unknown): BuildProvenance {
  const o = object(value, ['appVersion','commit','sourceSha256','analysisSourceSha256','dirty']);
  if (typeof o.appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(o.appVersion) ||
    !(o.commit === 'unknown' || hash(o.commit, 40)) || !(o.sourceSha256 === 'unknown' || hash(o.sourceSha256, 64)) ||
    !(o.analysisSourceSha256 === 'unknown' || hash(o.analysisSourceSha256, 64)) || typeof o.dirty !== 'boolean') throw Error('Procedencia de build inválida.');
  return {...o} as unknown as BuildProvenance;
}
export function validateIdentity(value: unknown): SignalIdentity {
  const o = object(value, ['scheme','sha256','fs','samples','units','leads']);
  if (o.scheme !== FINGERPRINT_SCHEME || !hash(o.sha256, 64) || o.units !== 'mV' ||
    !Number.isSafeInteger(o.fs) || (o.fs as number) < 100 || (o.fs as number) > 1000 ||
    !Number.isSafeInteger(o.samples) || (o.samples as number) < 10 * (o.fs as number) || (o.samples as number) > 60 * (o.fs as number) ||
    !Array.isArray(o.leads) || o.leads.length !== LEADS.length || LEADS.some((l, i) => (o.leads as unknown[])[i] !== l)) throw Error('Identidad de señal inválida.');
  return {scheme:FINGERPRINT_SCHEME, sha256:o.sha256 as string, fs:o.fs as number, samples:o.samples as number, units:'mV', leads:[...LEADS]};
}
export function validateBounds(value: ManualBounds, samples: number): ManualBounds {
  if (!LEADS.includes(value.lead) || !['PR','QRS','QT'].includes(value.kind) ||
    !Number.isSafeInteger(value.startSample) || !Number.isSafeInteger(value.endSample) ||
    value.startSample < 0 || value.endSample <= value.startSample || value.endSample >= samples)
    throw Error('Límites manuales inválidos: usa índices enteros, inicio < final, dentro del registro.');
  return {lead:value.lead, kind:value.kind, startSample:value.startSample, endSample:value.endSample};
}
export function intervalMs(bounds: ManualBounds, fs: number): number { return (bounds.endSample - bounds.startSample) * 1000 / fs; }
export function validateAnnotation(value: unknown, identity: SignalIdentity): ManualAnnotation {
  const o = object(value, ['id','origin','lead','kind','startSample','endSample','createdWith']);
  if (!Number.isSafeInteger(o.id) || (o.id as number) < 1 || o.origin !== 'manual') throw Error('Origen o identificador de anotación inválido.');
  const bounds = validateBounds(o as unknown as ManualBounds, identity.samples);
  return {...bounds, id:o.id as number, origin:'manual', createdWith:validateBuild(o.createdWith)};
}
export function reviewSidecar(identity: SignalIdentity, annotations: readonly ManualAnnotation[], build: BuildProvenance): ReviewSidecar {
  if (annotations.length > MAX_ANNOTATIONS) throw Error('Máximo 100 anotaciones por registro.');
  const items = annotations.map(a => validateAnnotation(a, identity));
  if (new Set(items.map(a => a.id)).size !== items.length) throw Error('Anotaciones duplicadas.');
  return {kind:'ecg-manual-review', schemaVersion:1, clinicalValidation:false, signal:validateIdentity(identity),
    exportedWith:validateBuild(build), annotations:items};
}
export function importReview(text: string, identity: SignalIdentity): ReviewSidecar {
  if (text.length > MAX_REVIEW_BYTES) throw Error('Archivo de revisión demasiado grande.');
  const o = object(JSON.parse(text), ['kind','schemaVersion','clinicalValidation','signal','exportedWith','annotations']);
  if (o.kind !== 'ecg-manual-review' || o.schemaVersion !== 1 || o.clinicalValidation !== false || !Array.isArray(o.annotations)) throw Error('Formato de revisión manual no admitido.');
  const given = validateIdentity(o.signal), current = validateIdentity(identity);
  if (given.sha256 !== current.sha256 || given.fs !== current.fs || given.samples !== current.samples)
    throw Error('Esta revisión pertenece a otra señal o frecuencia. No se importó ninguna anotación.');
  return reviewSidecar(current, o.annotations.map(a => validateAnnotation(a, current)), validateBuild(o.exportedWith));
}

/** Small bounded undo stack. Only manual annotations, never signal/automatic measurement. */
export class ManualHistory {
  private current: ManualAnnotation[] = [];
  private past: ManualAnnotation[][] = [];
  private future: ManualAnnotation[][] = [];
  get list() { return structuredClone(this.current); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  replace(items: readonly ManualAnnotation[]) {
    this.past.push(this.list); if (this.past.length > 20) this.past.shift();
    this.current = structuredClone([...items]); this.future = [];
  }
  undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.list); this.current = previous; } }
  redo() { const next = this.future.pop(); if (next) { this.past.push(this.list); this.current = next; } }
}
