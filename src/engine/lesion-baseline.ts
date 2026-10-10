import type { ECGCase } from "./types";

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
