import type { ECGCase, Measurement, MetricKey, Reliability, Signal } from "../engine/types";
import { esc } from "./helpers";
import { modelIntervals } from "./model-intervals";
import { acquiredModelAxis } from "./acquired-model-axis";

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

/** Compact strip: the provenance words («modelo», «media 10 s») stay in the full note
 * read by assistive technology; only the clinically meaningful part is shown
 * («Fridericia», «progresivo», «No aplica»). */
const shortNote = (note: string) => note.split(" · ").filter((p) => p !== "modelo" && p !== "media" && p !== "10 s" && p !== "media 10 s").join(" · ");
export const metricsHtml = (cards: MetricCard[]) =>
  cards
    .map(
      (x, i) =>
        `<button class="metric ${i === 0 ? "main-metric" : ""}" data-action="measurements" title="${esc(x.reason)}" aria-label="${esc(`${x.label}: ${x.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}${x.note ? `, ${x.note}` : ""}`)}"><span>${x.label}</span><strong>${x.value}</strong><small><i class="quality-dot ${x.status}"></i>${x.note}</small>${shortNote(x.note) ? `<em class="metric-note">${shortNote(x.note)}</em>` : ""}</button>`,
    )
    .join("") + `<span class="metrics-source" title="Valores con los que el modelo generó el trazado; la medición automática está en «Medidas».">Valores del modelo</span>`;

/** Practice hides every value (and its availability, which would also hint the
 * answer) until the learner responds; the calipers remain available to measure. */
export const concealMetricCards = (cards: MetricCard[]): MetricCard[] =>
  cards.map((x) => ({ ...x, value: "?", note: "Oculto en práctica", status: "usable", reason: "Se revela al responder. Puedes medir con los calibres." }));

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
  const none = unorganized(c), t = s.truth, model = "Valor del modelo que generó este trazado. La estimación automática desde las muestras está en «Información y fuentes».";
  const intervals = modelIntervals(c, s), axis = acquiredModelAxis(c, s);
  const card = (key: MetricKey, label: string, value: string, note: string): MetricCard =>
    value === "—"
      ? { key, label, value, note: "No aplica", status: "unavailable", reason: "Sin este componente en el ritmo generado." }
      : { key, label, value, note, status: "usable", reason: model };
  return [
    card("hr", "FC ventricular", none || !t.hr ? "—" : display(t.hr, "lpm"), "modelo · media 10 s"),
    intervals.prRange
      ? card("pr", "PR", `${intervals.prRange[0]}–${intervals.prRange[1]}<small>ms</small>`, intervals.progressivePr ? "modelo · progresivo" : "modelo · variable")
      : card("pr", "PR", display(intervals.pr, "ms"), "modelo"),
    card("qrs", "QRS", display(intervals.qrs, "ms"), "modelo"),
    card("qt", "QTc", display(intervals.qtc, "ms"), "modelo · Fridericia"),
    {
      ...card("axis", "Eje QRS", none ? "—" : display(axis.displayed, "°"), axis.reversed ? "modelo · adquisición invertida" : "modelo"),
      ...(axis.context ? { reason: `${model} ${axis.context}` } : {}),
    },
  ];
}
