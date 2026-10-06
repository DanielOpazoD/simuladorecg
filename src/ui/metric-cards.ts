import type { ECGCase, Measurement, MetricKey, Reliability } from "../engine/types";
import { esc } from "./helpers";

export interface MetricCard {
  key: MetricKey;
  label: string;
  value: string;
  note: string;
  status: Reliability;
  reason: string;
}

const display = (v: number | null | undefined, unit = "") =>
  v == null || !Number.isFinite(v)
    ? "—"
    : Math.round(v) + (unit ? `<small>${unit}</small>` : "");

const unorganized = (c: ECGCase) => ["vf", "asystole"].includes(c.rhythm);

export function metricCards(c: ECGCase, m: Measurement): MetricCard[] {
  const none = unorganized(c),
    hasPR =
      (c.rhythm === "sinus" && c.av !== "complete") ||
      (c.rhythm === "paced" && c.pacing !== "VVI");
  const rows: [MetricKey, string, string, string][] = [
    ["hr", "FC ventricular", none || m.evidence.hr.status === "unavailable" ? "—" : display(m.hr, "lpm"), "media · 10 s"],
    ["pr", "PR", hasPR ? display(m.pr, "ms") : "—", hasPR ? "estimado" : "sin relación AV estimable"],
    ["qrs", "QRS", none || m.evidence.qrs.status === "unavailable" ? "—" : display(m.qrs, "ms"), "límites medidos"],
    [
      "qt",
      "QTc",
      none || m.evidence.qt.status === "unavailable" || ["af", "flutter", "torsades"].includes(c.rhythm)
        ? "—"
        : display(m.qtc.fridericia, "ms"),
      "Fridericia · estimado",
    ],
    ["axis", "Eje QRS", none ? "—" : display(m.axis, "°"), "área neta · estimado"],
  ];
  return rows.map(([key, label, value, sub]) => {
    const { status, reason } = m.evidence[key];
    return {
      key,
      label,
      value,
      status,
      reason,
      note: status === "unavailable" ? "No estimable" : status === "review" ? "Revisar" : sub,
    };
  });
}

export const metricsHtml = (cards: MetricCard[]) =>
  cards
    .map(
      (x, i) =>
        `<button class="metric ${i === 0 ? "main-metric" : ""}" data-action="measurements" title="${esc(x.reason)}"><span>${x.label}</span><strong>${x.value}</strong><small><i class="quality-dot ${x.status}"></i>${x.note}</small></button>`,
    )
    .join("");

export const monitorRate = (c: ECGCase, m: Measurement) =>
  unorganized(c) || m.evidence.hr.status === "unavailable"
    ? "—"
    : String(Math.round(m.hr ?? 0));
