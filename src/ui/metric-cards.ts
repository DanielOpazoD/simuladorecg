import type { ECGCase, Measurement, MetricKey, Reliability, Signal } from "../engine/types";
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
    ["hr", "FC ventricular", none || m.evidence.hr.status === "unavailable" ? "—" : display(m.hr, "lpm"), `media · ${Number((m.window.end - m.window.start).toFixed(3))} s`],
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
    const evidence = m.evidence[key];
    const hidden = value === "—" || evidence.status === "unavailable";
    const status: Reliability = hidden ? "unavailable" : evidence.status;
    const reason = evidence.status === "unavailable" ? evidence.reason : hidden
      ? key === "pr" && !hasPR ? "Sin relación AV estimable en este contexto."
        : "Medida no disponible en este contexto; no se sustituye por cero ni por el valor programado."
      : evidence.reason;
    return {
      key,
      label,
      value: hidden ? "—" : value,
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
  unorganized(c) || m.evidence.hr.status === "unavailable" || m.hr === null || !Number.isFinite(m.hr)
    ? "—"
    : String(Math.round(m.hr!));

/** Keep the large monitor number accompanied by the same quality as the cards. */
export const monitorRateNote = (c: ECGCase, m: Measurement): string =>
  unorganized(c) || m.evidence.hr.status === "unavailable" || m.hr === null || !Number.isFinite(m.hr)
    ? "No estimable" : m.evidence.hr.status === "review" ? "lpm · revisar" : "lpm · estimados";

/** Keep raw candidates in data, but do not present unavailable values as estimates. */
export function availableMetricValue(m:Measurement,key:MetricKey):number|null {
  return m.evidence[key].status==='unavailable'?null:m[key];
}

/**
 * Cards for the simulator's own signal: the model's values (what was generated),
 * not a delineation of it. The frozen sample analyzer stays available in the
 * measurements dialog as an independent estimate, and for imported signals.
 */
export function modelMetricCards(c: ECGCase, s: Signal): MetricCard[] {
  const none = unorganized(c), t = s.truth, model = "Valor del modelo que generó este trazado. La estimación automática desde las muestras está en «Medidas».";
  const beats = s.events.beats, rr = beats.length > 1 ? (beats[beats.length - 1].time - beats[0].time) / (beats.length - 1) : null;
  const conducted = beats.filter((b) => b.pr !== undefined).map((b) => Math.round(b.pr! * 1000));
  const prRange = conducted.length ? [Math.min(...conducted), Math.max(...conducted)] : null;
  const variablePr = prRange !== null && prRange[1] - prRange[0] >= 10;
  const qtc = t.qt !== null && rr ? t.qt / Math.cbrt(rr) : null;
  const card = (key: MetricKey, label: string, value: string, note: string): MetricCard =>
    value === "—"
      ? { key, label, value, note: "No aplica", status: "unavailable", reason: "Sin este componente en el ritmo generado." }
      : { key, label, value, note, status: "usable", reason: model };
  return [
    card("hr", "FC ventricular", none || !t.hr ? "—" : display(t.hr, "lpm"), "modelo · media 10 s"),
    variablePr
      ? card("pr", "PR", `${prRange![0]}–${prRange![1]}<small>ms</small>`, c.av === "mobitz1" ? "modelo · progresivo" : "modelo · variable")
      : card("pr", "PR", none || t.pr === null ? "—" : display(t.pr, "ms"), "modelo"),
    card("qrs", "QRS", none ? "—" : display(t.qrs, "ms"), "modelo"),
    card("qt", "QTc", none || c.rhythm === "torsades" ? "—" : display(qtc, "ms"), "modelo · Fridericia"),
    card("axis", "Eje QRS", none ? "—" : display(t.axis, "°"), "modelo"),
  ];
}
