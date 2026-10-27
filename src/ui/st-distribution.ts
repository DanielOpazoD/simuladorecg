import { LEADS, type Lead, type Signal } from "../engine/types";
import { stMarks, ST_LENS } from "../render/st-lens";
import { dominantBeats } from "./structured-description";
import { stZoomMark } from "./st-zoom";
import { esc } from "./helpers";

export interface StDistribution {
  beat: number; qrsTime: number; jTime: number;
  rows: { lead: Lead; j0: number | null; j60: number | null }[];
}

/** A shared event and linear pre-QRS reference in the final acquired samples.
 * These are model-anchored observations, never a coronary localization algorithm. */
export function readStDistribution(s: Signal, beat?: number): StDistribution | null {
  if (!(Number.isFinite(s.fs) && s.fs > 0) || !s.leads.I?.length) return null;
  const valid = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= s.events.beats.length) return false;
    const b = s.events.beats[i], previous = s.events.beats[i - 1], next = s.events.beats[i + 1];
    if (!Number.isFinite(b.time) || !Number.isFinite(b.qrs) || !(b.qrs! > 0)) return false;
    const start = b.time + ST_LENS.prFromS, end = b.time + b.qrs! + ST_LENS.windowS;
    // Match the actual sampled indices: a mathematically exact endpoint can be
    // 1.1800000000000002 in floating point while its 1180th sample exists.
    return start >= 0 && Math.round(end * s.fs) < s.leads.I.length &&
      !(previous && Number.isFinite(previous.qt) && previous.time + previous.qt! >= start) &&
      !(next && next.time <= end);
  };
  const paperEnd = Math.min(10, (s.leads.I.length - 1) / s.fs);
  const eligible = beat === undefined ? dominantBeats(s).filter(i => valid(i) &&
    s.events.beats[i].time >= .21 && s.events.beats[i].time + s.events.beats[i].qrs! + .62 <= paperEnd)
    : valid(beat) ? [beat] : [];
  if (!eligible.length) return null;
  const selected = eligible[Math.floor(eligible.length / 2)], b = s.events.beats[selected];
  const finite = (n: number | undefined) => n !== undefined && Number.isFinite(n) ? n : null;
  return { beat: selected, qrsTime: b.time, jTime: b.time + b.qrs!, rows: LEADS.map(lead => {
    const a = s.leads[lead];
    const mark = a?.length ? stMarks(s, lead).find(m => m.beat === selected) : undefined;
    return { lead, j0: finite(mark?.j0), j60: finite(mark?.j60) };
  }) };
}

type Region = "all" | "inferior" | "lateral" | "anterior" | "posterior" | "avr";
type Point = "j0" | "j60";
const REGIONS: Record<Region, { label: string; leads: readonly Lead[]; explanation: string }> = {
  all: { label: "Todas", leads: LEADS, explanation: "Cada derivación registra una proyección distinta. Un signo positivo o negativo describe el nivel del ST respecto de su referencia; no identifica una causa ni una arteria." },
  inferior: { label: "Inferior", leads: ["II", "III", "aVF"], explanation: "II, III y aVF exploran la región inferior. Contrasta con I y aVL: una distribución recíproca puede apoyar la sospecha isquémica, pero no es obligatoria ni determina por sí sola la arteria." },
  lateral: { label: "Lateral", leads: ["I", "aVL", "V5", "V6"], explanation: "I y aVL se asocian a la región lateral alta; V5–V6, a la lateral. Los territorios de irrigación se solapan y varían entre personas: estas agrupaciones orientan la lectura, no son un mapa coronario exacto." },
  anterior: { label: "Anterior / septal", leads: ["V1", "V2", "V3", "V4"], explanation: "V1–V4 permiten explorar la distribución anterior y septal. La progresión entre derivaciones aporta contexto; no permite deducir con certeza una rama, el nivel de oclusión ni una anatomía individual." },
  posterior: { label: "Posterior · indirecto", leads: ["V1", "V2", "V3"], explanation: "El descenso predominante en V1–V3 puede ser una expresión recíproca de lesión posterior en un contexto isquémico; también tiene otras causas. V7–V9 aportan información adicional, pero no se registran en este simulador. V1–V3 no son derivaciones posteriores." },
  avr: { label: "aVR · contexto", leads: ["aVR"], explanation: "La elevación en aVR con descenso difuso puede acompañar isquemia subendocárdica extensa y otras situaciones. No confirma lesión de tronco coronario ni descarta una oclusión aguda." },
};
const FRONTAL: readonly [Lead, number][] = [["I", 0], ["II", 60], ["III", 120], ["aVR", -150], ["aVL", -30], ["aVF", 90]];
const signed = (n: number | null, digits: number) => {
  if (n === null) return "—";
  const rounded = Number(n.toFixed(digits));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits).replace(".", ",")}`;
};
const polarity = (n: number | null) => n === null ? "missing" : Number(n.toFixed(3)) === 0 ? "flat" : n > 0 ? "positive" : "negative";

/** Original schematic: standard frontal axes, and approximate chest orientation.
 * No source illustration or fitted arterial geometry is reused. */
function projectionSvg(selected: Lead, region: Region): string {
  const xy = (angle: number, radius: number) => [150 + radius * Math.cos(angle * Math.PI / 180), 118 + radius * Math.sin(angle * Math.PI / 180)];
  const highlight = (lead: Lead) => `${lead === selected ? " projection-selected" : ""}${region !== "all" && REGIONS[region].leads.includes(lead) ? " projection-region" : ""}`;
  const axes = FRONTAL.map(([lead, angle]) => { const [x, y] = xy(angle, 77), [tx, ty] = xy(angle, 98); return `<g class="projection-lead${highlight(lead)}"><line x1="150" y1="118" x2="${x}" y2="${y}"/><circle cx="${x}" cy="${y}" r="4"/><text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle">${lead}</text></g>`; }).join("");
  const chest: readonly [Lead, number, number][] = [["V1", 112, 87], ["V2", 150, 87], ["V3", 175, 116], ["V4", 201, 142], ["V5", 237, 142], ["V6", 272, 142]];
  return `<div class="st-projections"><figure><svg viewBox="0 0 300 240" role="img" aria-label="Ejes de las seis derivaciones de miembros; seleccionada ${esc(selected)}"><circle class="projection-outline" cx="150" cy="118" r="77"/>${axes}<circle class="projection-center" cx="150" cy="118" r="5"/><text class="projection-direction" x="15" y="230">Derecha del paciente</text><text class="projection-direction" x="285" y="230" text-anchor="end">Izquierda</text></svg><figcaption>Plano frontal · ángulos convencionales</figcaption></figure>` +
    `<figure><svg viewBox="0 0 300 240" role="img" aria-label="Orientación esquemática de V1 a V6 en el tórax, sin escala anatómica"><path class="projection-outline" d="M35 205 L30 65 Q30 39 77 25 L100 18 Q116 40 145 18 L171 26 Q239 38 269 72 L285 205 M130 62 V172 M55 75 Q130 110 247 78 M55 111 Q130 145 259 112 M55 146 Q130 182 266 147"/>${chest.map(([lead, x, y]) => `<g class="projection-lead${highlight(lead)}"><circle cx="${x}" cy="${y}" r="5"/><text x="${x}" y="${y - 13}" text-anchor="middle">${lead}</text></g>`).join("")}<text class="projection-direction" x="15" y="230">Derecha del paciente</text><text class="projection-direction" x="285" y="230" text-anchor="end">Izquierda</text></svg><figcaption>Precordiales · esquema, no guía de colocación</figcaption></figure></div>`;
}

export function stDistributionHtml(): string {
  return `<div class="st-distribution"><p class="dialog-lead">Un latido, doce perspectivas. Recorre la distribución del ST y abre la misma señal en el aumento manual.</p><div class="st-distribution-content"></div></div>`;
}

export function mountStDistribution(root: HTMLElement, s: Signal, reversed: boolean, zoom: (lead: Lead, beat: number) => void, selection?: { beat?: number; lead?: Lead }) {
  const data = readStDistribution(s, selection?.beat), content = root.querySelector<HTMLElement>(".st-distribution-content")!;
  if (!data) { content.innerHTML = `<p class="model-note">No hay un latido con ventanas de referencia y ST completas y separadas. No se muestran ceros como sustitutos de medidas ausentes.</p>`; return; }
  let region: Region = "all", point: Point = "j0", selected: Lead = selection?.lead ?? "II";
  root.dataset.beat = String(data.beat);
  content.innerHTML = `<p class="st-distribution-event">QRS ${data.beat + 1} · inicio ${data.qrsTime.toFixed(3).replace(".", ",")} s · J ${data.jTime.toFixed(3).replace(".", ",")} s · ECG actual, primeros 10 s</p>` +
    `<div class="st-distribution-points" role="group" aria-label="Instante de lectura"><button type="button" class="btn" data-st-point="j0" aria-pressed="true">J · media de 10 ms</button><button type="button" class="btn" data-st-point="j60" aria-pressed="false">J+60 · muestra</button></div>` +
    `<p class="control-note">Los colores siguen el signo mostrado en mV, no un umbral diagnóstico. Los mm equivalen a 10 mm/mV, independientemente de la ganancia del papel.</p>` +
    (reversed ? `<p class="st-distribution-warning">Electrodos de brazos invertidos: se conservan los valores adquiridos, pero se desactiva la orientación territorial.</p>` : `<div class="st-distribution-regions" role="group" aria-label="Orientación de la lectura">${Object.entries(REGIONS).map(([id, r]) => `<button type="button" class="btn" data-st-region="${id}" aria-pressed="${id === "all"}">${esc(r.label)}</button>`).join("")}</div>`) +
    `<p class="st-distribution-explanation"></p><div class="st-distribution-diagrams"${reversed ? " hidden" : ""}></div>` +
    `<div class="st-distribution-leads" role="group" aria-label="ST en las doce derivaciones del mismo latido">${[data.rows.slice(0, 6), data.rows.slice(6)].map((rows, index) => `<div class="st-lead-plane" role="group" aria-label="${index ? "Precordiales" : "Miembros"}">${rows.map(row => `<button type="button" class="st-lead" data-st-lead="${row.lead}" aria-pressed="${row.lead === selected}"><strong>${row.lead}</strong><span class="st-lead-value"></span><small class="st-lead-mv"></small></button>`).join("")}</div>`).join("")}</div>` +
    `<div class="st-distribution-selection"><output class="st-distribution-readout" aria-live="polite"></output><button type="button" class="btn" data-st-enlarge>Ampliar este latido</button></div>` +
    `<details class="st-distribution-method"><summary>Cómo se obtiene esta lectura</summary><p>Se leen las muestras finales, con su filtro y artefactos. J procede del final del QRS del modelo, no de una delimitación clínica independiente. La referencia es la media entre 40 y 20 ms antes del QRS; esta ventana pre-QRS puede contener actividad o ruido. J resume sus primeros 10 ms; J+60 lee una muestra 60 ms después. No son puntos intercambiables para aplicar criterios clínicos.</p><p>Las agrupaciones territoriales son orientativas. V4R y V7–V9 no están disponibles. El signo del ST no confirma ni excluye isquemia ni adjudica una arteria.</p><p>Idea de exploración vinculada inspirada en <a href="https://www.cliffreid.com/culprit/" target="_blank" rel="noopener">Coronary Culprit, de Cliff Reid</a>; implementación y diagramas propios. <a href="https://doi.org/10.1161/CIR.0000000000001309" target="_blank" rel="noopener">Guía SCA 2025</a> · <a href="https://doi.org/10.1016/j.jelectrocard.2012.12.016" target="_blank" rel="noopener">Límites de aVR</a>.</p></details>`;
  const update = () => {
    root.dataset.point = point; root.dataset.selectedLead = selected; root.dataset.region = region;
    content.querySelector<HTMLElement>(".st-distribution-explanation")!.textContent = reversed ? "Lectura de voltajes según las etiquetas adquiridas; no se asignan regiones anatómicas con esta inversión." : REGIONS[region].explanation;
    content.querySelector<HTMLElement>(".st-distribution-diagrams")!.innerHTML = reversed ? "" : projectionSvg(selected, region);
    content.querySelectorAll<HTMLButtonElement>("[data-st-point]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.stPoint === point)));
    content.querySelectorAll<HTMLButtonElement>("[data-st-region]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.stRegion === region)));
    for (const row of data.rows) {
      const b = content.querySelector<HTMLButtonElement>(`[data-st-lead="${row.lead}"]`)!, value = row[point];
      b.setAttribute("aria-pressed", String(row.lead === selected));
      b.className = `st-lead st-${polarity(value)}${region !== "all" && REGIONS[region].leads.includes(row.lead) ? " st-region-member" : ""}`;
      b.dataset.valueMv = value === null ? "" : String(value);
      b.querySelector<HTMLElement>(".st-lead-value")!.textContent = value === null ? "Sin medida" : `${signed(value * 10, 1)} mm`;
      b.querySelector<HTMLElement>(".st-lead-mv")!.textContent = `${signed(value, 3)} mV`;
    }
    const row = data.rows.find(r => r.lead === selected)!, value = row[point];
    content.querySelector<HTMLOutputElement>(".st-distribution-readout")!.textContent = `${selected} · ${point === "j0" ? "J, media de 10 ms" : "J+60, muestra"} · ${value === null ? "sin medida disponible" : `${signed(value, 3)} mV (${signed(value * 10, 1)} mm a 10 mm/mV)`} · QRS ${data.beat + 1}`;
    content.querySelector<HTMLButtonElement>("[data-st-enlarge]")!.disabled = value === null || !stZoomMark(s, selected, data.beat);
  };
  content.addEventListener("click", e => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!b || !content.contains(b)) return;
    if (b.hasAttribute("data-st-enlarge")) { if (!b.disabled) zoom(selected, data.beat); return; }
    if (b.dataset.stLead && LEADS.includes(b.dataset.stLead as Lead)) selected = b.dataset.stLead as Lead;
    if (b.dataset.stPoint === "j0" || b.dataset.stPoint === "j60") point = b.dataset.stPoint;
    if (!reversed && b.dataset.stRegion && Object.hasOwn(REGIONS, b.dataset.stRegion)) region = b.dataset.stRegion as Region;
    update();
  });
  update();
}
