import type { ECGCase } from "../engine/types";
import { learnedIschemiaArtery } from "../engine/realistic/ischemia";
import { learnedEctopicModel, learnedSecondaryRepolarization, realisticModelFor } from "../engine/realistic/scope";
import { isVviDemand, isVviNoncapture } from "../engine/vvi-demand";
import { repolarizationLimitations } from "./teaching-limits";

/** Model routing metadata, not a diagnosis or an assertion that a trace was validated.
 * Reuses the engine's routing, including customized combinations; never uses the
 * preset name to infer which population is actually selected. No model data is loaded. */
export interface ModelProvenance {
  summary: string;
  sources: string[];
  evidence: string;
  limitations: string[];
  clinicalValidation: "pending";
}

export const CLINICAL_REVIEW_PENDING = "Revisión clínica humana independiente pendiente.";
const HISTORICAL_GENERIC_LIMIT = "Morfología paramétrica representativa; sin validación contra ECG de pacientes.";

export function modelProvenance(c: ECGCase, preset?: { limitation: string }): ModelProvenance {
  const base = realisticModelFor(c);
  const sources: string[] = [], limitations: string[] = [];
  let summary: string;
  if (c.rhythm === "asystole") {
    summary = "Sin actividad cardíaca organizada; adquisición y artefactos configurados.";
  } else if (isVviNoncapture(c)) {
    summary = "Estímulos VVI sin captura y sin escape ventricular, según el calendario del modelo.";
    if (base) {
      summary += " Espigas aprendidas de PTB-XL.";
      sources.push("PTB-XL");
    }
    limitations.push("Sin fusión, fallo intermitente ni simulación de los umbrales de un dispositivo.");
  } else if (isVviDemand(c) && (c.intrinsicRate ?? 0) >= c.hr) {
    // With a faster/equal intrinsic clock, the demand scheduler suppresses every
    // paced activation and spike. A model the worker loads is not an emitted wave:
    // paced-VVI escapes use kernels, not the learned ventricular-rhythm PVC route.
    summary = "VVI a demanda inhibido por el ritmo intrínseco: complejos de escape ventricular paramétricos, sin espigas ni activaciones estimuladas.";
    limitations.push("Sensado idealizado; el escape no demuestra una localización anatómica ni una morfología aprendida.");
  } else if (c.rhythm === "vf") {
    summary = "FV espectral: amplitud y espectro aprendidos; distribución espacial ilustrativa.";
    sources.push("vfdb/cudb");
    limitations.push("Las fuentes originales tienen una o dos derivaciones; la distribución en doce derivaciones no fue aprendida. No representa una evolución de FV gruesa a fina.");
  } else if (base) {
    summary = `Ruta de base aprendida de PTB-XL (${base}), con calendario de eventos y transformaciones paramétricas.`;
    // Selection is described as routing, not an inventory of emitted components.
    // In particular AAI loads VPACE but its atrial spikes remain parametric.
    if (learnedEctopicModel(c, "pvc")) summary += " Ruta de ectopia ventricular: PVC aprendido.";
    if (learnedEctopicModel(c, "ventricular")) summary += " Ruta de complejos ventriculares: PVC aprendido.";
    if (learnedEctopicModel(c, "paced")) summary += " Ruta de complejos estimulados: VPACE aprendido.";
    summary += " Las ondas emitidas dependen del calendario; seleccionar una población no implica que todos sus componentes aparezcan.";
    sources.push("PTB-XL");
    const artery = learnedIschemiaArtery(c);
    if (artery) {
      summary += ` Cambio emparejado de oclusión ${artery} aprendido de STAFF III.`;
      sources.push("STAFF III");
      limitations.push("Oclusión provocada con balón: las fases no son un reloj del infarto espontáneo ni una simulación de reperfusión.");
      if (artery === "LCX") limitations.push("Población de entrenamiento LCx pequeña; las amplitudes no constituyen rangos clínicos de referencia.");
    }
    if (base === "IMI" || base === "ASMI") limitations.push("Población con infarto antiguo; no permite datar el infarto ni demostrar recuperación tisular.");
    if (c.rhythm === "af") summary += " Actividad f y variabilidad RR aprendidas de PTB-XL.";
    if (c.rhythm === "flutter") {
      sources.push("Georgia");
      summary += " Ciclo F aprendido de Georgia/PTB-XL.";
      limitations.push("Conducción AV según el calendario configurado; no se simula el circuito de reentrada del flutter.");
    }
    if (learnedSecondaryRepolarization(base)) limitations.push("ST-T conserva la relación secundaria prevista por la población; su proporcionalidad no está calibrada clínicamente.");
  } else {
    summary = "Núcleos paramétricos y proyección vectorial, con correcciones locales según la configuración.";
    limitations.push("Morfología representativa; esta combinación no utiliza una población de latidos aprendida.");
  }
  if (c.ischemia !== "none" && !base && c.phase === "chronic")
    limitations.push("ST resuelto por una operación paramétrica; no demuestra cicatriz, reperfusión ni tiempo transcurrido.");
  if (c.electrolyte === "hyperkalemia" || c.electrolyte === "hypokalemia")
    limitations.push("Patrón esquemático; no establece una relación concentración–ECG.");
  limitations.push(...repolarizationLimitations(c));
  // Preserve specific catalogue caveats when its identity is applicable. The old
  // catch-all claimed a parametric morphology even for a learned population.
  if (preset && preset.limitation !== HISTORICAL_GENERIC_LIMIT) limitations.push(preset.limitation);
  limitations.push(CLINICAL_REVIEW_PENDING);
  return {
    summary, sources,
    evidence: "Procedencia del generador y contratos de software; no acredita plausibilidad clínica, exactitud diagnóstica ni propagación celular.",
    limitations: [...new Set(limitations)], clinicalValidation: "pending",
  };
}
