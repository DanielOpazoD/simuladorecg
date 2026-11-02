import type { ECGCase, Lead, Signal } from "../engine/types";
import { modelIntervals } from "./model-intervals";
import { dominantBeats } from "./structured-description";

/** Illustrative reading of the terminal 40 ms of the QRS, [J - 40 ms, J].
 * Times come from the model calendar (QRS onset b.time, J = b.time + b.qrs, exact);
 * voltages come from the final samples. The reference is the local PR segment
 * (40-20 ms before the QRS), as in the ST lens. The 0.1 mV threshold is a
 * legibility threshold (1 mm at 10 mm/mV), not a clinical criterion of bundle
 * branch block nor an R'/S detector; no diagnosis is inferred from it. */
export const TERMINAL_QRS = Object.freeze({ windowS: 0.04, prFromS: -0.04, prToS: -0.02, thresholdMv: 0.1, minBeats: 2 });

export type TerminalPolarity = "positive" | "negative" | "flat" | "unavailable";

export interface TerminalQrs {
  lead: Lead;
  polarity: TerminalPolarity;
  /** Median over dominant beats of (mean of the terminal window minus PR level), mV; null when unavailable. */
  meanMv: number | null;
  /** Dominant beats actually read. */
  beats: number;
}

export interface ConductionObservation { v1: TerminalPolarity; i: TerminalPolarity; v6: TerminalPolarity; narrow: boolean }

type Beats = Signal["events"]["beats"];

const unavailable = (lead: Lead, beats = 0): TerminalQrs => ({ lead, polarity: "unavailable", meanMv: null, beats });

/** Inclusive mean of samples i0..i1, or null if any index falls outside the record, any sample is not finite, or the sum overflows. */
function safeMean(a: Float64Array, i0: number, i1: number): number | null {
  if (!(i0 >= 0 && i1 >= i0 && i1 < a.length)) return null;
  let sum = 0;
  for (let i = i0; i <= i1; i++) { if (!Number.isFinite(a[i])) return null; sum += a[i]; }
  return Number.isFinite(sum) ? sum / (i1 - i0 + 1) : null;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A readable row: finite times, QRS at least as long as the window, and no other QRS overlapping the PR reference or the terminal window. */
function readable(beats: Beats, i: number): boolean {
  const b = beats[i];
  if (b.qrs === undefined || !Number.isFinite(b.time) || !Number.isFinite(b.qrs) || b.qrs < TERMINAL_QRS.windowS) return false;
  const from = b.time + TERMINAL_QRS.prFromS, j = b.time + b.qrs;
  return !beats.some((o, k) => k !== i && o.qrs !== undefined && o.time <= j && o.time + o.qrs >= from);
}

export function terminalQrs(s: Pick<Signal, "fs" | "leads" | "events">, leads: readonly Lead[] = ["V1", "I", "V6"]): TerminalQrs[] {
  const fs = s.fs, beats = s.events?.beats, at = (t: number) => Math.round(t * fs);
  const ok = Number.isFinite(fs) && fs > 0 && Array.isArray(beats);
  // dominantBeats takes the signal object (events) and returns beat indices.
  const rows = ok ? dominantBeats(s).filter(i => readable(beats, i)) : [];
  const arrays = leads.map(l => s.leads?.[l]);
  const length = arrays.find(a => a instanceof Float64Array)?.length;
  return leads.map((lead, n) => {
    const a = arrays[n], means: number[] = [];
    if (!ok || !(a instanceof Float64Array) || a.length === 0 || a.length !== length) return unavailable(lead);
    for (const i of rows) {
      const b = beats[i], j = b.time + b.qrs!;
      const pr = safeMean(a, at(b.time + TERMINAL_QRS.prFromS), at(b.time + TERMINAL_QRS.prToS));
      const w = safeMean(a, at(j - TERMINAL_QRS.windowS), at(j));
      // A truncated or non-finite segment is discarded, never read as flat.
      if (pr !== null && w !== null) means.push(w - pr);
    }
    if (means.length < TERMINAL_QRS.minBeats) return unavailable(lead, means.length);
    const m = median(means), th = TERMINAL_QRS.thresholdMv, sign = m >= th ? 1 : m <= -th ? -1 : 0;
    const agree = means.filter(x => sign > 0 ? x >= th : x <= -th).length;
    const polarity: TerminalPolarity = sign !== 0 && agree * 3 >= means.length * 2 ? (sign > 0 ? "positive" : "negative") : "flat";
    return { lead, polarity, meanMv: m, beats: means.length };
  });
}

const CONDUCTIONS: readonly string[] = ["normal", "rbbb", "lbbb"];

/** Observed stimulation excludes the observation: a spike is not a conduction finding.
 * Only the generated events count (spikes or paced beats); c.pacing is a mode
 * (AAI|VVI|DDD, default DDD even in sinus) and is never evidence of stimulation. */
function paced(s: Signal): boolean {
  return (s.events.spikes?.length ?? 0) > 0 || s.events.beats.some(b => (b.kind as string) === "paced");
}

/** Raw terminal polarities of V1, I and V6 plus whether the generated QRS is narrow
 * (modelIntervals.qrs < 120 ms, never the target c.qrs). Only for the sinus domain
 * where the model taxonomy is normal/rbbb/lbbb; flat remains available and
 * ambiguous, it does not classify anything. Null when out of domain or unreadable. */
export function conductionObservation(c: ECGCase, s: Signal): ConductionObservation | null {
  const inDomain = c.rhythm === "sinus" && c.av === "normal" && c.ectopy === "none" && c.ischemia === "none" && c.overload === "none"
    && c.electrolyte === "none" && !c.artifacts?.reversed && CONDUCTIONS.includes(c.conduction) && !paced(s);
  if (!inDomain) return null;
  const beats = s.events.beats, d = dominantBeats(s);
  if (!d.length || beats[d[0]].kind !== "normal") return null;
  const qrs = modelIntervals(c, s).qrs;
  if (qrs === null || !Number.isFinite(qrs)) return null;
  const [v1, i, v6] = terminalQrs(s).map(r => r.polarity);
  if (v1 === "unavailable" || i === "unavailable" || v6 === "unavailable") return null;
  return { v1, i, v6, narrow: qrs < 120 };
}
