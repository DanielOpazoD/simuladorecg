import { isVviNoncapture } from "../engine/vvi-demand";
import type { ECGCase } from "../engine/types";

/** Limits of this implementation, not diagnostic rules or physiological laws. */
export const WPW_REPOLARIZATION_LIMIT =
  "Preexcitación aproximada: en los latidos preexcitados, ST y T siguen la activación QRS incluida la onda delta. Amplitudes no calibradas; no localiza vías accesorias ni reproduce AVRT o memoria cardíaca.";
export const SECONDARY_ST_RATIO_LIMIT =
  "ST y T secundarios aproximados, acoplados a la activación QRS. La amplitud y la relación ST/QRS no están calibradas clínicamente; no permiten validar criterios proporcionales de Sgarbossa.";

export function repolarizationLimitations(c: ECGCase): string[] {
  if (c.rhythm === "vf" || c.rhythm === "asystole" || isVviNoncapture(c)) return [];
  const limits: string[] = [];
  if (c.conduction === "wpw") limits.push(WPW_REPOLARIZATION_LIMIT);
  if (c.conduction === "lbbb" || (c.rhythm === "paced" && c.pacing !== "AAI"))
    limits.push(SECONDARY_ST_RATIO_LIMIT);
  return limits;
}
