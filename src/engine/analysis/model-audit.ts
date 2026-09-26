import type { Signal, Measurement, MetricKey } from "../types";
import { referenceForMeasurement } from "../reference";

/**
 * Simulator-specific QA, AFTER the independent sample analyzer.
 * Never inserts generator values into a measurement. It only rejects / downgrades
 * candidates that contradict known synthetic timing, and retains raw candidates.
 * These engineering tolerances are not clinical device validation thresholds.
 */
export function auditMeasurement(
  signal: Signal,
  measurement: Measurement,
): Measurement {
  const m = structuredClone(measurement),
    comparison = referenceForMeasurement(signal, measurement),
    ref = comparison.reference;
  // Earlier sample-only gates may already have withdrawn an interval.
  // Keep that record on the cloned result; a later audit must never erase it.
  m.rejected ??= {};
  const reject = (key: MetricKey, reason: string) => {
    const value = m[key];
    if (value !== null) m.rejected![key] = value;
    m[key] = null;
    m.evidence[key] = { ...m.evidence[key], status: "unavailable", reason };
  };
  const limits: {
    key: "hr" | "pr" | "qrs" | "qt";
    review: number;
    reject: number;
  }[] = [
    { key: "hr", review: 2, reject: Math.max(3, ref.hr * 0.05) },
    { key: "pr", review: 15, reject: 30 },
    { key: "qrs", review: 15, reject: 25 },
    { key: "qt", review: 25, reject: 40 },
  ];
  if (
    m.hr !== null &&
    (comparison.falsePeaks > 0 || comparison.missedBeats > 0)
  )
    reject(
      "hr",
      `Detección discordante: ${comparison.falsePeaks} candidatos sin QRS correspondiente y ${comparison.missedBeats} QRS omitidos entre los extremos observados. Usa calibres.`,
    );
  for (const { key, review, reject: limit } of limits) {
    const value = m[key],
      reference = ref[key];
    if (value === null || reference === null) continue;
    const error = Math.abs(value - reference);
    if (error > limit)
      reject(
        key,
        `Candidato ${Math.round(value)}: discrepa ${Math.round(error)} ${key === "hr" ? "lpm" : "ms"} de la referencia sintética. Medida retirada; utiliza calibres.`,
      );
    else if (error > review) {
      m.evidence[key].status = "review";
      m.evidence[key].reason =
        `Diferencia de ${Math.round(error)} ${key === "hr" ? "lpm" : "ms"} frente a los mismos latidos del generador. Revisa los límites.`;
    }
  }
  const boundaries = (
    key: "qrs" | "pr" | "qt",
    errors: number[],
    soft: number,
    hard: number,
  ) => {
    if (m[key] === null || !errors.length) return;
    const maximum = Math.max(...errors.map(Math.abs));
    if (maximum > hard)
      reject(
        key,
        `Al menos un límite del latido discrepa ${Math.round(maximum)} ms de su referencia sintética. Medida retirada; los candidatos crudos se conservan para revisión.`,
      );
    else if (maximum > soft) {
      m.evidence[key].status = "review";
      m.evidence[key].reason =
        `Un límite difiere hasta ${Math.round(maximum)} ms de su referencia sintética. Revisa ese trazado.`;
    }
  };
  if (comparison.unpairedBounds && m.qrs !== null)
    reject("qrs", "Hay límites sin un QRS de referencia inequívoco.");
  boundaries(
    "qrs",
    comparison.pairs.flatMap(({ measured: b, source: s }) =>
      s.qrs === undefined
        ? []
        : [(b.onset - s.time) * 1000, (b.offset - s.time - s.qrs) * 1000],
    ),
    15,
    25,
  );
  if (
    m.pr !== null &&
    comparison.pairs.some(
      ({ measured, source }) =>
        source.pr === undefined &&
        (measured.pr !== null || measured.pOnset !== null),
    )
  )
    reject(
      "pr",
      "Hay un candidato de P/PR atribuido a un QRS sin asociación AV en el modelo. No se acepta el PR global; revisa los candidatos con calibres.",
    );
  boundaries(
    "pr",
    comparison.pairs.flatMap(({ measured: b, source: s }) =>
      b.pOnset === null || s.pr === undefined
        ? []
        : [(b.pOnset - s.time + s.pr) * 1000],
    ),
    15,
    30,
  );
  boundaries(
    "qt",
    comparison.pairs.flatMap(({ measured: b, source: s }) =>
      b.tEnd === null || s.qt === undefined
        ? []
        : [(b.tEnd - s.time - s.qt) * 1000],
    ),
    25,
    40,
  );
  if (m.rejected.hr !== undefined) {
    for (const key of ["pr", "qrs", "qt", "axis"] as const)
      reject(
        key,
        "La detección ventricular no supera la auditoría: puede incluir P, T o espigas.",
      );
  }
  if (m.pr !== null && ref.pr === null)
    reject(
      "pr",
      "La referencia presenta PR variable o ausencia de asociación AV; no se acepta un PR global.",
    );
  if (m.qrs === null) {
    if (m.axis !== null)
      reject("axis", "El eje requiere límites QRS aceptables.");
    if (m.qt !== null) reject("qt", "El QT requiere un inicio QRS aceptable.");
    if (m.pr !== null) reject("pr", "El PR requiere un inicio QRS aceptable.");
  }
  if (m.qt === null)
    m.qtc = { bazett: null, fridericia: null, framingham: null, hodges: null };
  if (m.hr === null) m.instantHr = null;
  if (m.pr === null) m.pAxis = null;
  if (m.qt === null) m.tAxis = null;
  return m;
}
