import type { MetricEvidence } from "../types";
import { spread } from "./statistics";

export function evidence(
  values: number[],
  total: number,
  limit: number,
  reason: string,
): MetricEvidence {
  const dispersion = values.length > 1 ? spread(values) : null;
  const enough = values.length >= 3 && values.length >= total * 0.6;
  const stable = dispersion !== null && dispersion <= limit;
  return {
    status:
      enough && stable ? "usable" : values.length ? "review" : "unavailable",
    reason: !values.length
      ? reason
      : !enough
        ? "Pocos latidos con límites reconocibles."
        : !stable
          ? "Dispersión entre latidos: revisa el trazado."
          : reason,
    count: values.length,
    total,
    spread: dispersion,
  };
}
export const unavailable = (reason: string, total = 0): MetricEvidence => ({
  status: "unavailable",
  reason,
  count: 0,
  total,
  spread: null,
});
