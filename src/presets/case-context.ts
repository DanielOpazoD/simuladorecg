import { normalizeCase, type ECGCase } from "../engine/types";
import { fromPreset, presetById, type Preset } from "./catalog";

/** Preset text describes physiology, not a case's free name or acquisition settings. */
function physiology(c: ECGCase) {
  const {
    version,
    presetId,
    name,
    seed,
    view,
    artifacts,
    filter,
    notch,
    mainsFrequency,
    ...parameters
  } = c;
  return parameters;
}

export interface CaseContext {
  preset: Preset | undefined;
  displayName: string;
  warnings: string[];
}

/**
 * Check only the declared preset. A custom case is never identified as a preset
 * by similarity. Imported parameters are preserved; discrepancies are explicit.
 * Keep this lookup outside the engine so normalization has no catalog dependency.
 */
export function caseContext(input: ECGCase): CaseContext {
  const c = normalizeCase(input),
    declared = presetById(c.presetId),
    warnings: string[] = [];
  let preset: Preset | undefined;
  if (c.presetId !== "custom") {
    if (!declared || declared.strategy === "pending") {
      warnings.push(
        "La etiqueta del caso no corresponde a un patrón activo. Se muestran los parámetros importados como caso personalizado.",
      );
    } else {
      const current = physiology(c),
        expected = physiology(normalizeCase(fromPreset(declared)));
      const matches = (Object.keys(current) as (keyof typeof current)[]).every(
        (key) => current[key] === expected[key],
      );
      if (matches) preset = declared;
      else
        warnings.push(
          "Los parámetros del caso difieren del patrón declarado. Se conserva la señal configurada y se retiran los hallazgos de ese patrón.",
        );
    }
  }
  if (c.ischemia === "sgarbossa" && (c.conduction !== "lbbb" || c.qrs < 120))
    warnings.push(
      "La opción «BRI con lesión concordante» requiere conducción BRI y QRS de al menos 120 ms. El caso importado conserva sus parámetros, pero no representa ese ejemplo.",
    );
  return {
    preset,
    displayName:
      !preset && declared && c.name === declared.name
        ? "Caso personalizado"
        : c.name,
    warnings,
  };
}

/**
 * Retire inconsistent catalog metadata at persistence boundaries. Keep schema v1
 * and every normalized signal/view parameter, including the original seed.
 */
export function normalizeImportedCase(input: unknown): ECGCase {
  const c = normalizeCase(input),
    context = caseContext(c);
  if (!context.preset) {
    c.presetId = "custom";
    c.name = context.displayName;
  }
  return c;
}
