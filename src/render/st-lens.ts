import type { Lead, Signal } from "../engine/types";

/** Reading of the J point and the ST segment for the OMI lens. The J point is the
 * end of the QRS the model generated (exact); the ST is read against the local PR
 * segment (40–20 ms before the QRS) and classified at J, where the guidelines
 * measure it (the structured description uses the same reading). */
export const ST_LENS = Object.freeze({ jS: 0.01, windowS: 0.08, prFromS: -0.04, prToS: -0.02, j60S: 0.06, thresholdMv: 0.05 });

export interface StMark {
  /** Index of the beat in the signal's events. */
  beat: number;
  jTime: number;
  endTime: number;
  /** PR reference level (mV). */
  prLevel: number;
  /** ST deviation at J (mean of its first 10 ms), its mean from J to J+80 ms and the value at J+60 ms (mV). */
  j0: number;
  mean: number;
  j60: number;
  /** ST elevation (SDST, supradesnivel) or depression (IDST, infradesnivel) of at
   * least 0.5 mm at J, or none. */
  kind: "SDST" | "IDST" | null;
}

export function stMarks(s: Pick<Signal, "fs" | "leads" | "events">, lead: Lead, from = 0, to = Infinity): StMark[] {
  const a = s.leads[lead], fs = s.fs, at = (t: number) => Math.round(t * fs), out: StMark[] = [];
  s.events.beats.forEach((b, beat) => {
    if (b.qrs === undefined) return;
    const jTime = b.time + b.qrs, endTime = jTime + ST_LENS.windowS;
    if (b.time + ST_LENS.prFromS < from || endTime > to) return;
    const p0 = at(b.time + ST_LENS.prFromS), p1 = at(b.time + ST_LENS.prToS), i0 = at(jTime), i1 = at(endTime);
    if (p0 < 0 || i1 >= a.length) return;
    let pr = 0;
    for (let i = p0; i <= p1; i++) pr += a[i];
    pr /= p1 - p0 + 1;
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += a[i] - pr;
    // J is read over its first 10 ms: a single sample moves with noise and timing.
    let j0 = 0;
    const jEnd = at(jTime + ST_LENS.jS);
    for (let i = i0; i <= jEnd; i++) j0 += a[i] - pr;
    j0 /= jEnd - i0 + 1;
    const mean = sum / (i1 - i0 + 1), j60 = a[at(jTime + ST_LENS.j60S)] - pr;
    out.push({ beat, jTime, endTime, prLevel: pr, j0, mean, j60, kind: j0 >= ST_LENS.thresholdMv ? "SDST" : j0 <= -ST_LENS.thresholdMv ? "IDST" : null });
  });
  return out;
}

/** The lesion alone: this trace minus the same patient's previous ECG. */
export function differenceSignal<S extends Pick<Signal, "fs" | "leads">>(s: S, previous: Pick<Signal, "leads">): S {
  const leads = {} as Signal["leads"];
  for (const lead of Object.keys(s.leads) as Lead[]) {
    const a = s.leads[lead], b = previous.leads[lead];
    leads[lead] = Float64Array.from(a, (v, i) => v - (b?.[i] ?? 0)) as Signal["leads"][Lead];
  }
  return { ...s, leads };
}
