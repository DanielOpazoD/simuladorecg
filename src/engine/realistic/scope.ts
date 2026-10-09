/**
 * Which cases use the learned beat base, and which learned population
 * (docs/fidelidad.md). Kept apart from the model data so the catalog and UI can
 * ask without loading any model.
 */
import type { ECGCase } from "../types";
import type { ModelCode } from "./shape-model";
import { regionalActivationState } from "../regional-activation";

const SUPPORTED_ELECTROLYTES: readonly ECGCase["electrolyte"][] = ["none", "longqt", "shortqt", "lowvoltage"];

/** Rhythms whose conducted beats and sinus P waves use the learned base in this
 * stage. Ventricular, paced and ventricular-ectopy rhythms keep the historical
 * kernels until their own migration, so a single trace never mixes both styles. */
const SUPPORTED_RHYTHMS: readonly ECGCase["rhythm"][] = ["sinus", "af", "flutter", "junctional"];

/** Conduction disorders learned from their own PTB-XL patients (stage F3). */
const CONDUCTION_MODELS: Partial<Record<ECGCase["conduction"], ModelCode>> = {
  normal: "NORM", lbbb: "CLBBB", irbbb: "IRBBB", lafb: "LAFB",
};

/** Learned population for the case's conducted beats, or null when the case keeps
 * the historical kernels. Each population is a whole learned beat, so modifiers
 * are not stacked across populations (LVH with a bundle-branch block stays on
 * kernels until a joint model exists). An experimental regional activation that
 * actually applies keeps its own kernels; a request it cannot honor does not. */
export function realisticModelFor(c: ECGCase): ModelCode | null {
  if (!(SUPPORTED_RHYTHMS.includes(c.rhythm) && !(c.av === "complete" && c.escape === "ventricular") &&
    (c.ectopy === "none" || c.ectopy === "pac") && c.ischemia === "none" &&
    SUPPORTED_ELECTROLYTES.includes(c.electrolyte) && !regionalActivationState(c).active)) return null;
  const conduction = CONDUCTION_MODELS[c.conduction] ?? null;
  if (c.overload === "none") return conduction;
  return c.overload === "lv" && conduction === "NORM" ? "LVH" : null;
}
/** Populations whose repolarization is secondary to the activation or to the
 * overload: the patient keeps its own T axis (the T-axis control, disabled in the
 * interface, has no effect, as with the historical kernels) and the QRS gain also
 * scales ST-T, so ST/QRS ratios are preserved. */
export const learnedSecondaryRepolarization = (m: ModelCode) => m === "CLBBB" || m === "IRBBB" || m === "LVH";
export const usesRealisticBase = (c: ECGCase) => realisticModelFor(c) !== null;
