import type { ECGCase, Lead, Signal } from "../engine/types";
import { acquiredModelAxis } from "./acquired-model-axis";
import { modelIntervals } from "./model-intervals";
import { leadMeasures } from "./structured-description";
import { conductionObservation } from "./terminal-qrs";

export type AdjustmentKey = "hr" | "pr" | "axis" | "qrs" | "conduction" | "qtc";
const KEYS: readonly string[] = ["hr", "pr", "axis", "qrs", "conduction", "qtc"];
export function isAdjustmentKey(key: string): key is AdjustmentKey { return KEYS.includes(key); }

/** Reference readouts of one generated configuration: s.truth.hr, the generated
 * model intervals, the displayed model axis (known metadata under the configured
 * acquisition) and the terminal polarity of V1, I and V6. None of them is an
 * analyzer estimate or an independent measurement from the waves, and none is a
 * target copied from the case. The seed only identifies the same base
 * configuration. No samples, events or full measurements are stored. */
export interface AdjustmentSnapshot {
  seed: number;
  hr: number | null;
  pr: number | null;
  qrs: number | null;
  qtc: number | null;
  axis: number | null;
  /** Terminal polarity of V1, I and V6 (positive | negative | flat). */
  terminal: readonly string[];
}

const finite = (x: number | null | undefined): number | null => typeof x === "number" && Number.isFinite(x) ? x : null;

const QRS_LEADS: readonly Lead[] = ["V1", "I", "V6"];
/** Illustrative legibility bound (1 mm at 10 mm/mV) for the existing final-sample lead measures; not a clinical rule. */
const QRS_LEGIBLE_MV = 0.1;

/** True when the full QRS (onset to J) is legible in at least one of V1, I or V6:
 * two or more dominant beats and a median peak-to-peak >= QRS_LEGIBLE_MV. Reuses
 * leadMeasures of the final samples; no new analyzer. */
function qrsLegible(s: Signal): boolean {
  return leadMeasures(s).some(m => QRS_LEADS.includes(m.lead) && m.beats >= 2 && m.qrs >= QRS_LEGIBLE_MV);
}

/** Null outside the conduction-observation domain or when the full QRS is not
 * legible in any of V1, I, V6. A flat terminal window alone (e.g. a wide QRS whose
 * last samples stay under the terminal threshold) does not reject: narrating a
 * change of width needs the whole QRS, not its terminal polarity. Never mutates its inputs. */
export function adjustmentSnapshot(c: ECGCase, s: Signal): AdjustmentSnapshot | null {
  const o = conductionObservation(c, s);
  if (o === null) return null;
  if (!qrsLegible(s)) return null;
  const terminal = Object.freeze([o.v1, o.i, o.v6]);
  const m = modelIntervals(c, s);
  return Object.freeze({
    seed: c.seed,
    hr: finite(s.truth.hr),
    pr: finite(m.pr),
    qrs: finite(m.qrs),
    qtc: finite(m.qtc),
    axis: finite(acquiredModelAxis(c, s).displayed),
    terminal,
  });
}

type Readout = Exclude<AdjustmentKey, "conduction">;
const READOUTS: readonly Readout[] = ["hr", "pr", "qrs", "qtc", "axis"];

/** +1 / -1 when both values are finite and differ once rounded to the displayed
 * integer; 0 otherwise (a readout that stops being estimable, or a manual
 * snapshot holding NaN/Infinity, is not a change: nothing is invented).
 * The axis only reports that its direction differs, modulo 360, with no sign. */
function change(b: AdjustmentSnapshot, a: AdjustmentSnapshot, k: Readout): -1 | 0 | 1 {
  const x = b[k], y = a[k];
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const d = Math.round(y) - Math.round(x);
  if (k === "axis") return ((d % 360) + 360) % 360 === 0 ? 0 : 1;
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** [decrease, increase] observations: a change of the reference and where to look in
 * the current recording (the previous trace is not kept on screen). No figures, no diagnosis. */
const TEXT: Record<Readout, readonly [string, string]> = {
  hr: [
    "La frecuencia de referencia es más lenta: el RR se alarga. Observa la distancia entre QRS consecutivos en este registro.",
    "La frecuencia de referencia es más rápida: el RR se acorta. Observa la distancia entre QRS consecutivos en este registro.",
  ],
  pr: [
    "El PR de referencia se acorta. Sigue la P hasta el comienzo del QRS en los latidos de este registro.",
    "El PR de referencia se prolonga. Sigue la P hasta el comienzo del QRS en los latidos de este registro.",
  ],
  qrs: [
    "El QRS de referencia es más estrecho. Observa el tramo final del QRS en V1 y V6 de este registro.",
    "El QRS de referencia es más ancho. Observa el tramo final del QRS en V1 y V6 de este registro.",
  ],
  qtc: [
    "El QTc de referencia disminuye. Observa dónde termina la T respecto al RR en este registro.",
    "El QTc de referencia aumenta. Observa dónde termina la T respecto al RR en este registro.",
  ],
  axis: [
    "El eje de referencia cambia de dirección. Observa la polaridad neta de I y aVF en este registro.",
    "El eje de referencia cambia de dirección. Observa la polaridad neta de I y aVF en este registro.",
  ],
};
const CONDUCTION = "La conducción de referencia cambia el trazado. Observa la anchura y el tramo final del QRS y el ST–T en V1, I y V6 de este registro.";

/** Null when either snapshot is missing, the base configuration differs, keys are
 * empty or foreign, or no readout really changed at the displayed resolution.
 * Picks the last requested key with a real difference; conduction is reported
 * when it is requested and several readouts or the terminal polarity moved, as
 * one coordinated change and never as isolated effects. Target fields of the case
 * are never evidence: only the snapshots are compared. */
export function adjustmentFeedback(before: AdjustmentSnapshot | null, after: AdjustmentSnapshot | null, keys: readonly string[]): string | null {
  if (before === null || after === null || before.seed !== after.seed || !keys.length || !keys.every(isAdjustmentKey)) return null;
  const ks = keys as readonly AdjustmentKey[];
  const changed = READOUTS.filter(k => change(before, after, k) !== 0);
  const terminal = before.terminal.length !== after.terminal.length || before.terminal.some((p, n) => p !== after.terminal[n]);
  if (!changed.length && !terminal) return null;
  const conduction = ks.includes("conduction") && (terminal || changed.length > 0);
  if (conduction && (terminal || changed.length > 1)) return CONDUCTION;
  for (let n = ks.length - 1; n >= 0; n--) {
    const k = ks[n];
    if (k === "conduction") { if (conduction) return CONDUCTION; continue; }
    const d = change(before, after, k);
    if (d !== 0) return TEXT[k][d > 0 ? 1 : 0];
  }
  return null;
}
