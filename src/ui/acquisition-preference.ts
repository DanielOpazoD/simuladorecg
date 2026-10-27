import type { ECGCase } from "../engine/types";

export type Acquisition = NonNullable<ECGCase["acquisition"]>;
const KEY = "ecglab-acquisition";

/** Only an explicit reader choice changes the established acquisition default.
 * A shared/imported case is applied after this preference, preserving its signal. */
export function readAcquisitionPreference(): Acquisition | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "ideal" || value === "realistic" ? value : null;
  } catch { return null; }
}

export function saveAcquisitionPreference(value: Acquisition): void {
  try { localStorage.setItem(KEY, value); } catch { /* Current session still works. */ }
}

export function acquisitionDescription(c: ECGCase): string {
  return c.acquisition === "ideal"
    ? "Señal limpia: sin ruido de adquisición añadido ni cuantización a 1 µV. Conserva las ondas del modelo y los artefactos que ajustes manualmente. Las medidas automáticas se recalculan sobre esta señal; una imagen más limpia no garantiza mayor exactitud del analizador."
    : "Con ruido de fondo: añade deriva y actividad muscular de adquisición, con cuantización a 1 µV. Poner los artefactos manuales a cero no elimina este fondo.";
}
