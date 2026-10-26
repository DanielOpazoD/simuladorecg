import type { ECGCase } from "./types";
import { synthesize } from "./signal";
import { usesRealisticBase } from "./realistic/scope";

/**
 * The same patient without its acute lesion: the "previous ECG" of the OMI lens
 * (the comparison with a prior is part of the OMI reading). Only for a lesion that
 * modifies the case's own patient: the chronic phase draws another population (old
 * infarction), so it has no exact previous ECG.
 */
export function lesionBaseline(c: ECGCase): ECGCase | null {
  if (c.ischemia === "none" || c.phase === "chronic") return null;
  return { ...c, ischemia: "none" };
}

/** Keep the source trace's generator family. Removing a kernel lesion may make
 * the basal configuration eligible for a learned population; that would replace
 * the patient and contaminate the difference, rather than isolate the lesion.
 * The worker loads the original case's models before calling this helper. */
export function synthesizeLesionBaseline(c: ECGCase, duration: number) {
  const baseline = lesionBaseline(c);
  return baseline ? synthesize(baseline, duration, { learnedBase: usesRealisticBase(c) }) : null;
}
