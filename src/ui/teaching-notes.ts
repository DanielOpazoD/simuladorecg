import { LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";

/** User marks use acquisition coordinates, never pixels or a PR-relative voltage. */
export interface TeachingNote {
  id: string;
  lead: Lead;
  kind: "box" | "arrow" | "interval" | "label";
  t0: number;
  t1: number;
  v0: number;
  v1: number;
  text: string;
}

export const MAX_TEACHING_NOTES = 50;
export const MAX_TEACHING_TEXT = 160;
const kinds = new Set(["box", "arrow", "interval", "label"]);

function recordShape(signal: Signal): number {
  const n = signal.leads.I.length;
  if (!Number.isFinite(signal.fs) || signal.fs <= 0 || !Number.isFinite(signal.duration) || signal.duration <= 0 ||
      n < 1 || LEADS.some(lead => !(signal.leads[lead] instanceof Float64Array) || signal.leads[lead].length !== n))
    throw new Error("La señal no tiene una escala temporal válida para anotar.");
  return n;
}

/** A mismatch/corruption checksum, not authentication or a clinical identifier. */
export function signalFingerprint(signal: Signal): string {
  const n = recordShape(signal), buffer = new ArrayBuffer(8), view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  const number = (value: number) => {
    view.setFloat64(0, value, true);
    for (const byte of bytes) {
      h1 = Math.imul(h1 ^ byte, 0x01000193);
      h2 = Math.imul(h2 ^ byte, 0x85ebca6b);
      h2 ^= h2 >>> 13;
    }
  };
  number(signal.fs); number(signal.duration); number(n);
  for (const [index, lead] of LEADS.entries()) {
    number(index);
    for (const value of signal.leads[lead]) number(value);
  }
  return `samples-v1-${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/** Presentation and descriptive metadata do not change the case's synthesis state. */
export function teachingCaseIdentity(c: ECGCase): string {
  const { view: _view, name: _name, presetId: _presetId, ...model } = c;
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) :
    value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value;
  return JSON.stringify(stable(model));
}

/** All-or-nothing validation; returns new objects and never repairs an imported note silently. */
export function validateTeachingNotes(input: unknown, signal: Signal): TeachingNote[] {
  const n = recordShape(signal), lastTime = (n - 1) / signal.fs;
  if (!Array.isArray(input) || input.length > MAX_TEACHING_NOTES)
    throw new Error(`Se permiten hasta ${MAX_TEACHING_NOTES} anotaciones por señal.`);
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Anotación no válida.");
    const note = value as Record<string, unknown>;
    if (typeof note.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(note.id) || seen.has(note.id))
      throw new Error("Las anotaciones necesitan identificadores únicos válidos.");
    seen.add(note.id);
    if (!LEADS.includes(note.lead as Lead) || typeof note.kind !== "string" || !kinds.has(note.kind))
      throw new Error("Derivación o tipo de anotación no válido.");
    if (typeof note.text !== "string" || note.text.length > MAX_TEACHING_TEXT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note.text))
      throw new Error(`El comentario debe tener como máximo ${MAX_TEACHING_TEXT} caracteres de texto.`);
    for (const key of ["t0", "t1", "v0", "v1"] as const)
      if (typeof note[key] !== "number" || !Number.isFinite(note[key])) throw new Error("Las coordenadas deben ser números finitos.");
    const { t0, t1, v0, v1 } = note as unknown as TeachingNote;
    if (t0 < 0 || t1 < 0 || t0 > lastTime || t1 > lastTime || Math.abs(v0) > 100 || Math.abs(v1) > 100)
      throw new Error("La anotación está fuera del registro o del intervalo de voltaje admitido (±100 mV).");
    return { id: note.id, lead: note.lead as Lead, kind: note.kind as TeachingNote["kind"],
      t0: Math.round(t0 * signal.fs) / signal.fs, t1: Math.round(t1 * signal.fs) / signal.fs, v0, v1, text: note.text };
  });
}

export function serializeNotes(signal: Signal, notes: readonly TeachingNote[], c?: ECGCase): string {
  return JSON.stringify({ format: "ecglab-teaching-notes", version: 1, signal: signalFingerprint(signal),
    ...(c ? { model: teachingCaseIdentity(c) } : {}), units: { time: "s-from-record-start", voltage: "mV-acquired" },
    notes: validateTeachingNotes(notes, signal) }, null, 2);
}

export function parseNotes(raw: string, signal: Signal, c?: ECGCase): TeachingNote[] {
  if (raw.length > 80000) throw new Error("El archivo de anotaciones es demasiado grande.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("El archivo no contiene JSON válido."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Archivo de anotaciones no reconocido.");
  const value = parsed as Record<string, unknown>, units = value.units as Record<string, unknown> | undefined;
  if (value.format !== "ecglab-teaching-notes" || value.version !== 1 || units?.time !== "s-from-record-start" || units?.voltage !== "mV-acquired")
    throw new Error("Formato, versión o unidades de las anotaciones no compatibles.");
  if (value.signal !== signalFingerprint(signal)) throw new Error("Estas anotaciones pertenecen a otra señal. Abre el caso original antes de importarlas.");
  if (value.model !== undefined && (typeof value.model !== "string" || !c || value.model !== teachingCaseIdentity(c)))
    throw new Error("Estas anotaciones requieren el mismo modelo del caso original.");
  return validateTeachingNotes(value.notes, signal);
}
