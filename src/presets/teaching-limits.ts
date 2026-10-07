import { isVviNoncapture } from "../engine/vvi-demand";
import type { ECGCase } from "../engine/types";

/** Limits of this implementation, not diagnostic rules or physiological laws. */
export const WPW_REPOLARIZATION_LIMIT =
  "Preexcitación aproximada: la delta no modifica el ST-T secundario en este modelo. No uses esta T para aprender la repolarización típica de WPW.";
export const SECONDARY_ST_RATIO_LIMIT =
  "La T secundaria es aproximada; el ST secundario no está representado. Un ST plano no demuestra repolarización normal. La relación ST/QRS no está calibrada y no permite validar criterios proporcionales de Sgarbossa.";

export function repolarizationLimitations(c: ECGCase): string[] {
  if (c.rhythm === "vf" || c.rhythm === "asystole" || isVviNoncapture(c)) return [];
  const limits: string[] = [];
  if (c.conduction === "wpw") limits.push(WPW_REPOLARIZATION_LIMIT);
  if (c.conduction === "lbbb" || (c.rhythm === "paced" && c.pacing !== "AAI"))
    limits.push(SECONDARY_ST_RATIO_LIMIT);
  return limits;
}
