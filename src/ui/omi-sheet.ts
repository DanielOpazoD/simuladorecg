import { chapterUrl, OMI_SHEETS, REFERENCES } from "../presets/omi-content";
import type { StructuredDescription } from "./structured-description";
import { esc } from "./helpers";

/** Case sheet of an OMI-family pattern: context, ECG, interpretation and lesson,
 * expert notes and the support behind it, each reference with its level. */
export function omiSheetHtml(presetId: string, refsOpen = false): string {
  if (!Object.hasOwn(OMI_SHEETS, presetId)) return "";
  const s = OMI_SHEETS[presetId];
  const rows = [["Contexto", s.context], ["ECG", s.ecg], ["Interpretación", s.interpretation], ["Lección", s.lesson]] as const;
  const refs = s.refs.map((id) => REFERENCES[id]);
  return `<section class="omi-sheet" aria-label="Ficha del caso"><h3>Ficha del caso</h3><dl class="omi-sheet-rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` +
    `<div class="omi-notes">${s.notes.map((n) => `<div class="omi-note omi-note-${n.kind.toLowerCase()}"><span>${n.kind}</span><p>${esc(n.text)}</p></div>`).join("")}</div>` +
    `<details class="omi-refs"${refsOpen ? " open" : ""}><summary>Respaldo · ${refs.length + 1} fuentes</summary><ol>${refs.map((r) => `<li><span class="ref-level">${esc(r.level)}</span> ${esc(r.cite)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a></li>`).join("")}` +
    `<li><span class="ref-level">docente</span> ECGsmith, capítulo «${esc(s.chapter.title)}» (redacción propia a partir de sus conceptos). <a href="${esc(chapterUrl(s.chapter.slug))}" target="_blank" rel="noopener">Abrir</a></li></ol></details></section>`;
}

export function structuredDescriptionHtml(d: StructuredDescription, open = true): string {
  const info = (l: StructuredDescription["lines"][number]) => l.info
    ? `<button type="button" class="info-ref" data-action="description-info" data-info="${l.info}" aria-label="Criterios y referencias: ${esc(l.key)}"><sup>?</sup></button>` : "";
  return `<details class="structured-description"${open ? " open" : ""}><summary>Descripción estructurada</summary><dl>${d.lines.map((l) => `<div><dt>${esc(l.key)}</dt><dd>${esc(l.text)}${info(l)}</dd></div>`).join("")}</dl>` +
    `<details class="present-30"><summary>Presentación en 30 s</summary><p>${esc(d.summary)}</p></details></details>`;
}
