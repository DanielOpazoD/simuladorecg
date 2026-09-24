import type {
  ECGCase,
  Signal,
  Measurement,
  DelineatedBeat,
  Lead,
} from "../engine/types";
import { LEADS } from "../engine/types";
import { esc, icon, options } from "./helpers";

const round = (value: number | null) =>
  value === null ? "—" : Math.round(value);
export function representativeBeat(m: Measurement, before = Infinity): number {
  if (!m.beats.length) return 0;
  let best = 0,
    score = Infinity;
  m.beats.forEach((b, i) => {
    if (b.onset >= before) return;
    const distance =
      Math.abs(b.qrs - (m.qrs ?? b.qrs)) +
      Math.abs((b.qt ?? m.qt ?? 0) - (m.qt ?? b.qt ?? 0)) * 0.5 +
      Math.abs(i - m.beats.length / 2) * 0.1;
    if (distance < score) {
      best = i;
      score = distance;
    }
  });
  return best;
}
export function nearestBeat(m: Measurement, time: number): number {
  let index = 0;
  for (let i = 1; i < m.beats.length; i++)
    if (
      Math.abs(m.beats[i].onset - time) < Math.abs(m.beats[index].onset - time)
    )
      index = i;
  return index;
}
function plot(
  s: Signal,
  beat: DelineatedBeat,
  lead: Lead,
  dark: boolean,
  acceptedPR: boolean,
  acceptedQT: boolean,
): string {
  const start = Math.max(0, beat.onset - 0.23),
    end = Math.min(
      s.duration,
      Math.max(beat.onset + 0.62, (beat.tEnd ?? beat.onset + 0.5) + 0.12),
    );
  const width = 1000,
    height = 250,
    left = 52,
    right = 978,
    top = 74,
    bottom = 199;
  const signal = s.leads[lead],
    lo = Math.floor(start * s.fs),
    hi = Math.min(signal.length - 1, Math.ceil(end * s.fs));
  let min = 0,
    max = 0;
  for (let i = lo; i < hi; i++) {
    min = Math.min(min, signal[i]);
    max = Math.max(max, signal[i]);
  }
  const range = Math.max(0.8, max - min),
    center = (max + min) / 2;
  const x = (t: number) =>
    left + ((t - start) / (end - start)) * (right - left);
  const y = (v: number) =>
    (top + bottom) / 2 - ((v - center) / range) * (bottom - top) * 0.86;
  let d = "";
  for (let i = lo; i <= hi; i++)
    d +=
      (i === lo ? "M" : "L") +
      x(i / s.fs).toFixed(2) +
      "," +
      y(signal[i]).toFixed(2);
  let grid = "";
  for (
    let relative = Math.ceil((start - beat.onset) / 0.1) * 0.1;
    relative < end - beat.onset;
    relative += 0.1
  ) {
    const t = beat.onset + relative,
      xx = x(t);
    grid += `<path d="M${xx} ${top}V${bottom}" class="detail-grid"/><text x="${xx}" y="219" text-anchor="middle" class="detail-tick">${Math.round((t - beat.onset) * 1000)}</text>`;
  }
  for (
    let v = Math.ceil((center - range / 2) / 0.2) * 0.2;
    v < center + range / 2;
    v += 0.2
  ) {
    const yy = y(v);
    if (yy < top || yy > bottom) continue;
    grid += `<path d="M${left} ${yy}H${right}" class="detail-grid"/><text x="42" y="${yy + 4}" text-anchor="end" class="detail-tick">${v.toFixed(1)}</text>`;
  }
  const band = (
    a: number,
    b: number,
    lane: number,
    color: string,
    label: string,
  ) =>
    `<path d="M${x(a)} ${lane - 3}v6m0 -3H${x(b)}m0 -3v6" stroke="${color}" stroke-width="1.4" fill="none"/><text x="${(x(a) + x(b)) / 2}" y="${lane - 5}" text-anchor="middle" fill="${color}" class="detail-interval">${label}</text>`;
  const marker = (time: number, label: string, color: string) =>
    `<path d="M${x(time)} 69V${bottom}" stroke="${color}" stroke-width="1" stroke-dasharray="3 4" opacity=".65"/><circle cx="${x(time)}" cy="${y(signal[Math.min(signal.length - 1, Math.round(time * s.fs))])}" r="3.2" fill="${color}"/><text x="${x(time) + 5}" y="${top + 12}" fill="${color}" class="detail-tick">${label}</text>`;
  const blue = dark ? "#7dbbdc" : "#3475a2",
    teal = dark ? "#6dd8c8" : "#007e77",
    purple = dark ? "#c0ace8" : "#785da4";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Latido ampliado en ${lead}. QRS ${round(beat.qrs)} milisegundos. Los puntos marcan límites medidos." class="beat-plot">
 <text x="8" y="86" class="detail-tick">mV</text>${grid}
 <rect x="${x(beat.onset)}" y="${top}" width="${x(beat.offset) - x(beat.onset)}" height="${bottom - top}" fill="${teal}" opacity=".07"/>
 ${acceptedPR && beat.pOnset !== null ? band(beat.pOnset, beat.onset, 25, blue, `PR ${round(beat.pr)} ms`) : ""}
 ${band(beat.onset, beat.offset, 47, teal, `QRS ${round(beat.qrs)} ms`)}
 ${acceptedQT && beat.tEnd !== null ? band(beat.onset, beat.tEnd, 65, purple, `QT ${round(beat.qt)} ms`) : ""}
 <path d="${d}" class="detail-wave" fill="none" stroke-width="1.7" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
 ${acceptedPR && beat.pOnset !== null ? marker(beat.pOnset, "P", blue) : ""}${marker(beat.onset, "QRS", teal)}${marker(beat.offset, "J*", teal)}${acceptedQT && beat.tEnd !== null ? marker(beat.tEnd, "T fin", purple) : ""}
 <text x="${right}" y="242" text-anchor="end" class="detail-tick">ms desde QRS</text></svg>`;
}
export function beatDetail(
  s: Signal,
  m: Measurement,
  c: ECGCase,
  index: number,
): string {
  const b = m.beats[index],
    available = !!b && m.qrs !== null;
  if (!available)
    return `<div class="detail-empty">${icon("pulse")}<div><strong>Sin límites reproducibles para ampliar</strong><p>Usa la tira de ritmo y los calibres. ${esc(m.quality)}</p></div></div>`;
  const reasons = Object.values(m.evidence)
    .filter((e) => e.status !== "usable")
    .map((e) => e.reason);
  const prUsable = m.pr !== null;
  return `<div class="detail-heading"><div><div class="section-label">LECTURA DE LA SEÑAL</div><h2>Un latido, de cerca</h2></div><div class="detail-navigation"><span>Latido ${index + 1} <small>/ ${m.beats.length}</small></span><button class="btn icon-button previous-beat" data-action="previous-beat" aria-label="Latido anterior" ${index === 0 ? "disabled" : ""}>${icon("chevron")}</button><button class="btn icon-button" data-action="next-beat" aria-label="Latido siguiente" ${index === m.beats.length - 1 ? "disabled" : ""}>${icon("chevron")}</button><label><span class="sr-only">Derivación ampliada</span><select id="detail-lead">${options(
    LEADS.map((l) => [l, l]),
    c.view.lead,
  )}</select></label></div></div>
 ${plot(s, b, c.view.lead, c.view.palette === "dark", prUsable, m.qt !== null)}
 <div class="detail-footer"><div><span class="quality-dot ${m.evidence.qrs.status}"></span><strong>${m.evidence.qrs.status === "usable" ? "QRS reproducible" : "Revisar límites"}</strong><span>${m.evidence.qrs.count} latidos · resolución ${1000 / s.fs} ms</span></div><button class="text-button" data-action="measurements">Ver detalle de las medidas ${icon("chevron")}</button></div>
 <p class="detail-note">Selecciona un complejo en el papel para ampliarlo. *J estimado por el final del QRS.${m.qt !== null && b.tTangentEnd !== null ? ` QT por tangente de la envolvente: ${Math.round((b.tTangentEnd - b.onset) * 1000)} ms; es otro criterio de final de T.` : ""}${reasons.length ? ` ${esc(reasons[0])}` : ""}</p>`;
}
