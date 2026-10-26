import type { ECGCase, Signal } from "../engine/types";

export interface AcquiredModelAxis {
  basal: number | null;
  displayed: number | null;
  reversed: boolean;
  context?: string;
}

/** Presentation of known model metadata under the configured acquisition.
 * RA/LA negates lead I and preserves aVF, so its frontal coordinates reflect
 * across the vertical axis. This is not a new physiological axis or a sample
 * analyzer: the patient's basal truth and all acquired samples stay untouched.
 */
export function acquiredModelAxis(c: Pick<ECGCase, "artifacts">, s: Pick<Signal, "truth">): AcquiredModelAxis {
  const basal = s.truth.axis !== null && Number.isFinite(s.truth.axis) ? s.truth.axis : null;
  if (!c.artifacts.reversed) return { basal, displayed: basal, reversed: false };
  const reflected = basal === null ? null : 180 - basal;
  const displayed = reflected !== null && reflected > 180 ? reflected - 360 : reflected;
  const context = basal === null
    ? "Adquisición con brazos invertidos. Eje basal del modelo no determinable; no se aporta un eje del registro."
    : `Adquisición con brazos invertidos: la flecha representa el eje del registro transformado. Eje basal del modelo: ${Math.round(basal)}°. La inversión transforma las derivaciones; no representa un giro fisiológico del corazón.`;
  return { basal, displayed, reversed: true, context };
}
