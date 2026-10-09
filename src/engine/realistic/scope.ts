/**
 * Which cases use the learned beat base (docs/fidelidad.md). Kept apart from the
 * model data so the catalog and UI can ask without loading the model.
 */
import type { ECGCase } from "../types";

const SUPPORTED_ELECTROLYTES: readonly ECGCase["electrolyte"][] = ["none", "longqt", "shortqt", "lowvoltage"];

/** Rhythms whose conducted beats and sinus P waves use the learned base in this
 * stage. Ventricular, paced and ventricular-ectopy rhythms keep the historical
 * kernels until their own migration, so a single trace never mixes both styles. */
const SUPPORTED_RHYTHMS: readonly ECGCase["rhythm"][] = ["sinus", "af", "flutter", "junctional"];

export function usesRealisticBase(c: ECGCase): boolean {
  return SUPPORTED_RHYTHMS.includes(c.rhythm) && !(c.av === "complete" && c.escape === "ventricular") &&
    (c.ectopy === "none" || c.ectopy === "pac") &&
    c.conduction === "normal" && c.overload === "none" && c.ischemia === "none" &&
    SUPPORTED_ELECTROLYTES.includes(c.electrolyte) && (c.activationModel ?? "template") === "template";
}
