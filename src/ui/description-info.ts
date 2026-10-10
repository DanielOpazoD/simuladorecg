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
  minnesota2010: { level: "docente", cite: "Prineas RJ, Crow RS, Zhang ZM. The Minnesota Code Manual of Electrocardiographic Findings. 2.ª ed. Londres: Springer; 2010.", url: doi("10.1007/978-1-84882-778-3") },
} as const satisfies Record<string, Reference>;
type SourceId = keyof typeof SOURCES;

interface InfoContent { title: string; intro: string; items: [string, string][]; refs: SourceId[]; columns: [string, (r: LeadMeasure) => string][] }
const CONTENT: Record<DescriptionInfo, InfoContent> = {
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
    refs: ["udmi2018", "wagner2009", "acc2025", "esc2023", "deWinter2008"],
    columns: [["J", (r) => mm(r.j0)], ["J+60", (r) => mm(r.j60)]],
  },
  t: {
    title: "Onda T: qué es normal",
    intro: "La T normal es asimétrica (asciende lento y desciende rápido) y sigue la dirección del QRS en la mayoría de las derivaciones.",
    items: [
      ["Normal", "Positiva en I, II y V3–V6; negativa en aVR. Puede ser negativa o aplanada en III, aVL, aVF y V1 (y en V2 en jóvenes) sin significado patológico."],
      ["Invertida", "Negativa donde debería ser positiva, en dos o más derivaciones contiguas. Profunda y simétrica en V2–V3 tras dolor torácico sugiere reperfusión de la DA (Wellens)."],
      ["Bifásica", "Con un componente positivo y otro negativo; positiva-negativa en V2–V3 es el Wellens tipo A."],
      ["Aplanada", "Menor de 1 mm donde debería ser positiva (I, II, aVF, V3–V6)."],
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
};

const marked = (kind: DescriptionInfo, m: LeadMeasure[]): Set<string> => {
  if (kind === "st") { const f = stFindings(m); return new Set([...f.elevation, ...f.mild, ...f.depression].map((r) => r.lead)); }
  if (kind === "t") { const f = tFindings(m); return new Set([...f.inverted, ...f.biphasic, ...f.flat, ...f.prominent].map((r) => r.lead)); }
  return new Set(pathologicalQ(m).map((r) => r.lead));
};

export function descriptionInfoTitle(kind: DescriptionInfo): string { return CONTENT[kind].title; }
export function descriptionInfoHtml(kind: DescriptionInfo, measures: LeadMeasure[]): string {
  const x = CONTENT[kind], hit = marked(kind, measures);
  const table = measures.some((r) => r.beats > 0)
    ? `<details class="info-measures"><summary>Valores medidos en este trazado</summary><p class="control-note">Mediana de los latidos dominantes, respecto del segmento PR. Destacadas: las derivaciones que entran en la descripción.</p><div class="measurement-table-wrap"><table><thead><tr><th>Derivación</th>${x.columns.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${measures.map((r) => `<tr${hit.has(r.lead) ? ' class="info-hit"' : ""}><td>${esc(r.lead)}</td>${x.columns.map(([, f]) => `<td>${esc(f(r))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`
    : "";
  return `<p class="dialog-lead">${esc(x.intro)}</p><dl class="info-items">${x.items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${table}` +
    `<h3 class="info-refs-title">Referencias</h3><ol class="info-refs">${x.refs.map((id) => { const r = SOURCES[id]; return `<li><span class="ref-level">${esc(r.level)}</span> ${esc(r.cite)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a></li>`; }).join("")}</ol>`;
}
