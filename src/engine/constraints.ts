import type { Beat, ECGCase, EventSeries } from "./types";
import { qrsDuration } from "./morphology";

/** The exact T support used by the waveform generator, relative to QRS onset. */
export function tWaveSupport(
  c: Pick<ECGCase, "electrolyte">,
  qrs: number,
  qt: number,
): { start: number; duration: number } {
  const duration =
    c.electrolyte === "hyperkalemia" ? 0.13 : Math.min(0.22, (qt - qrs) * 0.68);
  return { start: qt - duration, duration };
}

export type ModelScopeCode = "qrs-overlap" | "premature-before-t";

/** A limitation of this additive generator, never a clinical ERP estimate. */
export class ModelScopeError extends Error {
  constructor(
    public readonly code: ModelScopeCode,
    public readonly previousBeat: number,
    public readonly beat: number,
    public readonly intervalMs: number,
    message: string,
  ) {
    super(`Fuera del alcance del modelo: ${message}`);
    this.name = "ModelScopeError";
  }
}

const TIME_EPSILON = 1e-9;

/**
 * Check assigned events before rendering or measuring their additive waveform.
 *
 * QRS overlap has no fusion model. An ectopic activation before the preceding
 * T support also needs an interaction/restitution model that is absent here.
 * T onset is an explicit boundary of supported synthesis, NOT a refractory
 * period or a claim that later ectopy is physiologically validated. This does
 * not classify ordinary T/P overlap or independent atrial activity as invalid.
 * No event or input parameter is moved, dropped or silently clamped.
 *
 * Call after assignRepolarization so each beat retains its actual QT history.
 */
export function assertRepresentableEvents(
  c: ECGCase,
  events: EventSeries,
): void {
  const ectopicAtrialActivations = events.atria
    .filter((a) => a.kind === "ectopic" && a.conducted && a.pr !== undefined)
    .map((a) => a.time + a.pr!);
  const isPremature = (b: Beat) =>
    b.kind === "pvc" ||
    ectopicAtrialActivations.some(
      (time) => Math.abs(time - b.time) <= TIME_EPSILON,
    );

  for (let i = 1; i < events.beats.length; i++) {
    const previous = events.beats[i - 1],
      current = events.beats[i],
      interval = current.time - previous.time,
      qrs = qrsDuration(c, previous);

    if (interval < qrs - TIME_EPSILON)
      throw new ModelScopeError(
        "qrs-overlap",
        i - 1,
        i,
        interval * 1000,
        "se superponen activaciones QRS y este motor no representa su fusión. " +
          "Reduce la frecuencia, aumenta el acoplamiento de ectopia o revisa la duración QRS.",
      );

    if (!isPremature(current)) continue;
    if (previous.qt === undefined || !Number.isFinite(previous.qt))
      throw new Error(
        "El calendario requiere repolarización calculada antes de validarse.",
      );
    const tStart = tWaveSupport(c, qrs, previous.qt).start;
    if (interval < tStart - TIME_EPSILON)
      throw new ModelScopeError(
        "premature-before-t",
        i - 1,
        i,
        interval * 1000,
        "la extrasístole comienza antes del soporte T previo; este motor no representa " +
          "su interacción con la conducción y la repolarización. " +
          "Reduce la frecuencia o aumenta el acoplamiento de ectopia. " +
          "Es un límite del simulador, no un período refractario clínico.",
      );
  }
}
