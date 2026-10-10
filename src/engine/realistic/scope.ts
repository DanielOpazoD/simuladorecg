/**
 * Which cases use the learned beat base, and which learned population
 * (docs/fidelidad.md). Kept apart from the model data so the catalog and UI can
 * ask without loading any model.
 */
import type { ECGCase } from "../types";
import type { BeatModelCode, EctopicModelCode, ModelCode } from "./shape-model";
import { regionalActivationState } from "../regional-activation";

const SUPPORTED_ELECTROLYTES: readonly ECGCase["electrolyte"][] = ["none", "longqt", "shortqt", "lowvoltage"];

/** Rhythms whose conducted beats and sinus P waves use the learned base in this
 * stage. Ventricular, paced and ventricular-ectopy rhythms keep the historical
 * kernels until their own migration, so a single trace never mixes both styles. */
const SUPPORTED_RHYTHMS: readonly ECGCase["rhythm"][] = ["sinus", "af", "flutter", "junctional", "paced"];

/** Conduction disorders learned from their own PTB-XL patients (stage F3). */
const CONDUCTION_MODELS: Partial<Record<ECGCase["conduction"], BeatModelCode>> = {
  normal: "NORM", lbbb: "CLBBB", rbbb: "CRBBB", irbbb: "IRBBB", lafb: "LAFB",
};
/** Old infarction (resolved ST, chronic phase) of a territory with its own
 * learned population: Q waves and T changes of real patients (F3.2). */
const OLD_INFARCTION: Partial<Record<ECGCase["ischemia"], BeatModelCode>> = {
  inferior_rca: "IMI", inferior_lcx: "IMI", anterior: "ASMI",
};

/** Learned population for the case's conducted beats, or null when the case keeps
 * the historical kernels. Each population is a whole learned beat, so modifiers
 * are not stacked across populations (LVH with a bundle-branch block stays on
 * kernels until a joint model exists). An experimental regional activation that
 * actually applies keeps its own kernels; a request it cannot honor does not. */
export function realisticModelFor(c: ECGCase): BeatModelCode | null {
  // Paced rhythms (F5.4): atrial pacing conducts the learned beat; ventricular
  // pacing uses the learned paced complex unless a teaching source is chosen.
  if (c.rhythm === "paced" && c.pacing !== "AAI" && (c.ventricularSource ?? "auto") !== "auto") return null;
  if (!(SUPPORTED_RHYTHMS.includes(c.rhythm) && !(c.av === "complete" && c.escape === "ventricular") &&
    (c.ectopy === "none" || c.ectopy === "pac" || learnedVentricularEctopy(c)) &&
    SUPPORTED_ELECTROLYTES.includes(c.electrolyte) && !regionalActivationState(c).active)) return null;
  // Ventricular pacing never conducts a supraventricular beat: the atrial activity
  // comes from the normal population and conduction/overload do not apply.
  if (pacedVentricular(c)) return c.ischemia === "none" ? "NORM" : null;
  const conduction = CONDUCTION_MODELS[c.conduction] ?? null;
  if (c.ischemia !== "none")
    return c.phase === "chronic" && conduction === "NORM" && c.overload === "none" ? OLD_INFARCTION[c.ischemia] ?? null : null;
  if (c.overload === "none") return conduction;
  return c.overload === "lv" && conduction === "NORM" ? "LVH" : null;
}
/** Populations whose repolarization is secondary to the activation or to the
 * overload: the patient keeps its own T axis (the T-axis control, disabled in the
 * interface, has no effect, as with the historical kernels) and the QRS gain also
 * scales ST-T, so ST/QRS ratios are preserved. */
export const learnedSecondaryRepolarization = (m: ModelCode) => m === "CLBBB" || m === "CRBBB" || m === "IRBBB" || m === "LVH";
export const usesRealisticBase = (c: ECGCase) => realisticModelFor(c) !== null;
/** VVI/DDD: every ventricular complex is paced (no conducted beat). */
export const pacedVentricular = (c: ECGCase) => c.rhythm === "paced" && c.pacing !== "AAI";

const VENTRICULAR_ECTOPY: readonly ECGCase["ectopy"][] = ["pvc", "bigeminy", "trigeminy", "couplet"];
/** Ventricular premature beats with the automatic (representative) source use the
 * learned PVC population (F5.3); an explicitly chosen teaching source keeps its
 * kernels, and so does the whole trace (one style per trace). */
export const learnedVentricularEctopy = (c: ECGCase) =>
  VENTRICULAR_ECTOPY.includes(c.ectopy) && (c.ventricularSource ?? "auto") === "auto";
/** Learned population of an ectopic beat kind in this case, if any. */
export function learnedEctopicModel(c: ECGCase, kind: "normal" | "pvc" | "ventricular" | "paced"): EctopicModelCode | null {
  if (!realisticModelFor(c)) return null;
  if (kind === "pvc" && learnedVentricularEctopy(c)) return "PVC";
  if (kind === "paced" && c.rhythm === "paced" && c.pacing !== "AAI") return "VPACE";
  return null;
}
/** Every learned population a case needs (the worker loads them before synthesis). */
export function realisticModelsFor(c: ECGCase): ModelCode[] {
  const base = realisticModelFor(c);
  if (!base) return [];
  const out: ModelCode[] = [base];
  if (learnedVentricularEctopy(c)) out.push("PVC");
  // Every paced rhythm draws the recorded spike learned with the paced population.
  if (c.rhythm === "paced") out.push("VPACE");
  return out;
}
