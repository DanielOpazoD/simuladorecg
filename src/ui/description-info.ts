import type { Reference } from "../presets/omi-content";
import { REFERENCES } from "../presets/omi-content";
import { esc } from "./helpers";
import { mm, ms, pathologicalQ, stFindings, tFindings, type DescriptionInfo, type LeadMeasure } from "./structured-description";

/**
 * What lies behind each clinical line of the structured description: the definitions
 * in use, the usual alternatives, the references and the values measured on this
 * trace. Opened from the superscript next to the line, so the description itself
 * stays clinical. Every reference was checked in PubMed or Crossref on 2026-10-10.
 */
const doi = (d: string) => `https://doi.org/${d}`;
const SOURCES = {
  udmi2018: REFERENCES.udmi2018,
  acc2025: REFERENCES.acc2025,
  esc2023: REFERENCES.esc2023,
  wagner2009: { level: "guía", cite: "Wagner GS, Macfarlane P, Wellens H, et al. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part VI: acute ischemia/infarction. Circulation 2009;119:e262–e270.", url: doi("10.1161/CIRCULATIONAHA.108.191098") },
  rautaharju2009: { level: "guía", cite: "Rautaharju PM, Surawicz B, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part IV: the ST segment, T and U waves, and the QT interval. Circulation 2009;119:e241–e250.", url: doi("10.1161/CIRCULATIONAHA.108.191096") },
  wellens1982: REFERENCES.wellens1982,
  deWinter2008: REFERENCES.deWinter2008,
  formula2017: REFERENCES.formula2017,
  gibbons2002: { level: "guía", cite: "Gibbons RJ, Balady GJ, Bricker JT, et al. ACC/AHA 2002 guideline update for exercise testing: summary article. Circulation 2002;106:1883–1892.", url: doi("10.1161/01.cir.0000034670.06526.15") },
  kligfield2007: { level: "guía", cite: "Kligfield P, Gettes LS, Bailey JJ, et al. Recommendations for the standardization and interpretation of the electrocardiogram: part I: the electrocardiogram and its technology. Circulation 2007;115:1306–1324.", url: doi("10.1161/CIRCULATIONAHA.106.180200") },
  surawicz2009: { level: "guía", cite: "Surawicz B, Childers R, Deal BJ, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part III: intraventricular conduction disturbances. Circulation 2009;119:e235–e240.", url: doi("10.1161/CIRCULATIONAHA.108.191095") },
  minnesota2010: { level: "docente", cite: "Prineas RJ, Crow RS, Zhang ZM. The Minnesota Code Manual of Electrocardiographic Findings. 2.ª ed. Londres: Springer; 2010.", url: doi("10.1007/978-1-84882-778-3") },
} as const satisfies Record<string, Reference>;
type SourceId = keyof typeof SOURCES;

interface InfoContent { title: string; intro: string; items: [string, string][]; refs: SourceId[]; columns: [string, (r: LeadMeasure) => string][]; more?: { title: string; items: [string, string][] } }
const CONTENT = {
  st: {
    title: "Segmento ST: criterios",
    intro: "El ST se mide en el punto J (fin del QRS) respecto de la línea de base del segmento PR. La descripción solo llama «elevación» a la que cumple el criterio de las guías.",
    items: [
      ["Elevación significativa", "Nueva elevación en el punto J en al menos dos derivaciones contiguas: ≥ 1 mm en todas salvo V2–V3; en V2–V3, ≥ 2 mm en hombres ≥ 40 años, ≥ 2,5 mm en hombres < 40 años y ≥ 1,5 mm en mujeres."],
      ["En esta descripción", "El caso no tiene sexo ni edad: se aplica 2 mm en V2–V3 (el umbral más citado, hombres ≥ 40 años) y 1 mm en el resto, en dos derivaciones contiguas. Una elevación menor solo se nombra («elevación leve») fuera del patrón habitual de V1–V3. Junto a una elevación, un descenso recíproco aislado también se describe."],
      ["Descenso significativo", "Descenso horizontal o descendente ≥ 0,5 mm en dos derivaciones contiguas. El descenso con pendiente ascendente y T altas en precordiales es el patrón de De Winter."],
      ["Lo habitual en sanos", "Una elevación pequeña y cóncava del punto J en V1–V3 es frecuente, sobre todo en hombres jóvenes; por eso el umbral de V2–V3 es más alto."],
      ["Más allá de los milímetros", "El paradigma OMI valora además la forma, la proporción con el QRS y la reciprocidad: una oclusión puede no cumplir el criterio y una elevación puede no ser una oclusión."],
    ],
    refs: ["udmi2018", "wagner2009", "acc2025", "esc2023", "deWinter2008", "gibbons2002", "formula2017"],
    columns: [["J", (r) => mm(r.j0)], ["J+60", (r) => mm(r.j60)]],
    more: { title: "¿Punto J, J+60 o J+80?", items: [
      ["Qué es el punto J", "La unión entre el final del QRS y el inicio del ST: el punto donde el trazado cambia de pendiente. Puede ser difícil de ubicar cuando el final del QRS tiene una muesca o un empastamiento (repolarización precoz) o cuando el ST sale con pendiente."],
      ["Lo que usan las guías del infarto", "Los umbrales de elevación (1 mm; 2 mm en V2–V3 en hombres ≥ 40 años, etc.) se definieron y validaron en el punto J. Son los que aplica esta descripción."],
      ["De dónde salen J+60 y J+80", "De la prueba de esfuerzo: el descenso del ST se mide 60–80 ms después del J (J+80 por defecto; J+60 con frecuencias altas), porque con taquicardia el punto J baja de forma fisiológica y el ST asciende rápido. También los usan algoritmos y algunos estudios, como la fórmula de 4 variables de la DA, que usa la elevación a 60 ms del J en V3."],
      ["¿Cambia el valor de corte?", "Sí. Cada umbral vale en el punto donde se validó. Tras el J el ST normal de V2–V3 sube, así que a J+60 la elevación es mayor que en J: aplicar los umbrales del J a J+60 sobreestima la elevación y da falsos positivos. A la inversa, un descenso con pendiente ascendente (De Winter, taquicardia) es profundo en J y casi nulo a J+80."],
      ["Cómo verlo aquí", "La tabla de abajo da J y J+60 de cada derivación; «Ampliar y medir» muestra el latido con J, J+60 y J+80 marcados para medirlos a mano."],
    ] },
  },
  t: {
    title: "Onda T: qué es normal",
    intro: "La T normal es asimétrica (asciende lento y desciende rápido) y sigue la dirección del QRS en la mayoría de las derivaciones.",
    items: [
      ["Normal", "Positiva en I, II y V3–V6; negativa en aVR. Puede ser negativa o aplanada en III, aVL, aVF y V1 (y en V2 en jóvenes) sin significado patológico."],
      ["Invertida", "Negativa donde debería ser positiva, en dos o más derivaciones contiguas. Profunda y simétrica en V2–V3 tras dolor torácico sugiere reperfusión de la DA (Wellens)."],
      ["Bifásica", "Con un componente positivo y otro negativo; positiva-negativa en V2–V3 es el Wellens tipo A."],
      ["Aplanada", "Menor de 1 mm donde debería ser positiva (I, II, V3–V6), en dos derivaciones contiguas."],
      ["Prominente («hiperaguda»)", "Ancha, voluminosa y grande para su QRS. Aquí se marca cuando mide ≥ 10 mm, o ≥ 7 mm y al menos el 80 % de un QRS de ≥ 8 mm; no hay un umbral universal, y una T de 6–8 mm en V2–V4 puede ser normal en hombres jóvenes."],
    ],
    refs: ["rautaharju2009", "wagner2009", "wellens1982", "deWinter2008"],
    columns: [["T máx.", (r) => mm(r.tMax)], ["T mín.", (r) => mm(r.tMin)], ["QRS", (r) => mm(r.qrs).replace("+", "")]],
  },
  q: {
    title: "Ondas Q patológicas: definiciones",
    intro: "Una q pequeña y estrecha es normal en I, aVL y V5–V6 (despolarización del septo), y una Q puede ser normal en III, aVR y V1. Lo patológico es su anchura, su profundidad y su distribución en derivaciones contiguas.",
    items: [
      ["Cuarta definición universal (2018) — la usada aquí", "Q ≥ 0,02 s o complejo QS en V2–V3; Q ≥ 0,03 s y ≥ 0,1 mV de profundidad, o QS, en I, II, aVL, aVF o V4–V6, en dos derivaciones contiguas del mismo grupo. Incluye también un equivalente posterior (R ≥ 0,04 s en V1–V2 con R/S ≥ 1 y T positiva), que esta descripción no evalúa."],
      ["Relación Q/R", "Criterio clásico: Q de profundidad ≥ 25 % de la R siguiente. Es sensible pero poco específico (varía con la posición y la amplitud del QRS)."],
      ["Código de Minnesota", "Clasificación epidemiológica en grados (1-1 mayor a 1-3 menor) según la duración de la Q, la relación Q/R y, en los grados menores, el ST-T asociado; se usa en estudios poblacionales más que en la clínica."],
      ["Con QRS ancho", "En bloqueo de rama izquierda, preexcitación, marcapasos o QRS ventricular las Q no se interpretan con estos criterios. En el bloqueo de rama derecha sí, porque la activación inicial se conserva."],
    ],
    refs: ["udmi2018", "minnesota2010"],
    columns: [["Q", (r) => (r.qDepth < 0 ? mm(r.qDepth) : "—")], ["Duración", (r) => (r.qDur > 0 ? ms(r.qDur) : "—")], ["QS", (r) => (r.qs ? "sí" : "")]],
  },
} as Record<DescriptionInfo, InfoContent>;

CONTENT.axis = {
  title: "Eje eléctrico del QRS",
  intro: "La dirección media de la despolarización ventricular en el plano frontal, en grados: 0° apunta a la izquierda del paciente (derivación I), +90° hacia abajo (aVF) y −90° hacia arriba.",
  items: [
    ["Normal (adulto)", "De −30° a +90°."],
    ["Desviación a la izquierda", "De −30° a −90°. Un eje de −45° a −90° con qR en aVL y rS en las inferiores sugiere hemibloqueo anterior izquierdo."],
    ["Desviación a la derecha", "De +90° a +180°. Con rS en I y aVL y qR en las inferiores, y sin otra causa (sobrecarga derecha, etc.), sugiere hemibloqueo posterior izquierdo."],
    ["Extremo («tierra de nadie»)", "De −90° a ±180°: QRS negativo en I y en aVF. Hace pensar en ritmo ventricular, inversión de electrodos o cardiopatía congénita."],
    ["Cómo estimarlo", "Mira el signo neto del QRS en I y en aVF para ubicar el cuadrante; luego busca la derivación más isodifásica: el eje es perpendicular a ella."],
  ],
  refs: ["kligfield2007", "surawicz2009"],
  columns: [],
};

/** Hexaxial reference system with the six frontal leads, the normal sector and the
 * case's axis. Own drawing; angles follow the clinical convention (clockwise
 * positive, 0° = lead I). */
export function hexaxialSvg(axis: number | null): string {
  const c = 150, r = 112, at = (deg: number, k = r) => [c + k * Math.cos(deg * Math.PI / 180), c + k * Math.sin(deg * Math.PI / 180)];
  const arc = (a0: number, a1: number, color: string) => { const [x0, y0] = at(a0), [x1, y1] = at(a1), large = Math.abs(a1 - a0) > 180 ? 1 : 0; return `<path d="M${c},${c} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${color}"/>`; };
  const leads: [string, number][] = [["I", 0], ["II", 60], ["III", 120], ["aVF", 90], ["aVL", -30], ["aVR", -150]];
  const label = (text: string, deg: number, k: number, cls = "") => { const [x, y] = at(deg, k); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"${cls ? ` class="${cls}"` : ""}>${text}</text>`; };
  const arrow = axis === null ? "" : (() => { const [x, y] = at(axis, r - 6); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="hex-axis" marker-end="url(#hex-head)"/>${label(`${Math.round(axis)}°`, axis, r + 44, "hex-axis-label")}`; })();
  return `<svg class="hexaxial" viewBox="-48 -40 396 380" role="img" aria-label="Sistema hexaxial: eje normal de −30° a +90°${axis === null ? "" : `; eje de este caso ${Math.round(axis)}°`}"><defs><marker id="hex-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hex-head"/></marker></defs>` +
    arc(-30, 90, "var(--hex-normal)") + arc(-90, -30, "var(--hex-left)") + arc(90, 180, "var(--hex-right)") + arc(180, 270, "var(--hex-extreme)") +
    `<circle cx="${c}" cy="${c}" r="${r}" class="hex-ring"/>` +
    leads.map(([name, deg]) => { const [x0, y0] = at(deg + 180), [x1, y1] = at(deg); return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="hex-lead"/>${label(name, deg, r + 14, "hex-lead-label")}`; }).join("") +
    [0, 30, 60, 90, 120, 150, 180, -30, -60, -90, -120, -150].map((d) => label(d === 180 ? "±180°" : `${d > 0 ? "+" : ""}${d}°`, d, r - 16, "hex-degree")).join("") +
    arrow + `</svg><ul class="hex-legend"><li><i style="background:var(--hex-normal)"></i>Normal (−30° a +90°)</li><li><i style="background:var(--hex-left)"></i>Izquierda (−30° a −90°)</li><li><i style="background:var(--hex-right)"></i>Derecha (+90° a +180°)</li><li><i style="background:var(--hex-extreme)"></i>Extremo (−90° a ±180°)</li></ul>`;
}

const marked = (kind: DescriptionInfo, m: LeadMeasure[]): Set<string> => {
  if (kind === "st") { const f = stFindings(m); return new Set([...f.elevation, ...f.mild, ...f.depression].map((r) => r.lead)); }
  if (kind === "t") { const f = tFindings(m); return new Set([...f.inverted, ...f.biphasic, ...f.flat, ...f.prominent].map((r) => r.lead)); }
  if (kind === "q") return new Set(pathologicalQ(m).map((r) => r.lead));
  return new Set<string>();
};

export function descriptionInfoTitle(kind: DescriptionInfo): string { return CONTENT[kind].title; }
export function descriptionInfoHtml(kind: DescriptionInfo, measures: LeadMeasure[], axis: number | null = null): string {
  const x = CONTENT[kind], hit = marked(kind, measures);
  const table = x.columns.length && measures.some((r) => r.beats > 0)
    ? `<details class="info-measures"><summary>Valores medidos en este trazado</summary><p class="control-note">Mediana de los latidos dominantes, respecto del segmento PR. Destacadas: las derivaciones que entran en la descripción.</p><div class="measurement-table-wrap"><table><thead><tr><th>Derivación</th>${x.columns.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${measures.map((r) => `<tr${hit.has(r.lead) ? ' class="info-hit"' : ""}><td>${esc(r.lead)}</td>${x.columns.map(([, f]) => `<td>${esc(f(r))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`
    : "";
  const items = (list: [string, string][]) => `<dl class="info-items">${list.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  return `<p class="dialog-lead">${esc(x.intro)}</p>${kind === "axis" ? hexaxialSvg(axis) : ""}${items(x.items)}` +
    (x.more ? `<details class="info-more"><summary>${esc(x.more.title)}</summary>${items(x.more.items)}</details>` : "") +
    (kind === "st" && measures.some((r) => r.beats > 0) ? `<button type="button" class="btn" data-action="st-zoom">Ampliar y medir el ST</button>` : "") + table +
    `<h3 class="info-refs-title">Referencias</h3><ol class="info-refs">${x.refs.map((id) => { const r = SOURCES[id]; return `<li><span class="ref-level">${esc(r.level)}</span> ${esc(r.cite)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a></li>`; }).join("")}</ol>`;
}
