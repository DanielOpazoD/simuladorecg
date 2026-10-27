import { chapterUrl, OMI_SHEETS, REFERENCES } from "../presets/omi-content";
import type { StructuredDescription } from "./structured-description";
import { esc, icon } from "./helpers";

/** Case sheet of an OMI-family pattern: context, ECG, interpretation and lesson,
 * expert notes and the support behind it, each reference with its level. */
export function omiSheetHtml(presetId: string, refsOpen = false, includeReferences = true): string {
  if (!Object.hasOwn(OMI_SHEETS, presetId)) return "";
  const s = OMI_SHEETS[presetId];
  const rows = [["Contexto", s.context], ["ECG", s.ecg], ["Interpretación", s.interpretation], ["Lección", s.lesson]] as const;
  return `<section class="omi-sheet" aria-label="Ficha del caso"><h3>Ficha del caso</h3><dl class="omi-sheet-rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` +
    `<div class="omi-notes">${s.notes.map((n) => `<div class="omi-note omi-note-${n.kind.toLowerCase()}"><span>${n.kind}</span><p>${esc(n.text)}</p></div>`).join("")}</div>` +
    (includeReferences ? `<details class="omi-refs"${refsOpen ? " open" : ""}><summary>Respaldo · ${s.refs.length + 1} fuentes</summary>${omiReferencesHtml(presetId)}</details>` : "") + `</section>`;
}

/** Shared list lets the reading sheet and the information dialog use one source. */
export function omiReferencesHtml(presetId: string): string {
  if (!Object.hasOwn(OMI_SHEETS, presetId)) return "";
  const s = OMI_SHEETS[presetId], refs = s.refs.map(id => REFERENCES[id]);
  return `<ol class="references">${refs.map(r => `<li><span class="ref-level">${esc(r.level)}</span> ${esc(r.cite)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a></li>`).join("")}` +
    `<li><span class="ref-level">docente</span> ECGsmith, capítulo «${esc(s.chapter.title)}» (redacción propia a partir de sus conceptos). <a href="${esc(chapterUrl(s.chapter.slug))}" target="_blank" rel="noopener">Abrir</a></li></ol>`;
}

export function structuredDescriptionHtml(d: StructuredDescription, open = true, flat = false): string {
  const info = (l: StructuredDescription["lines"][number]) => l.info
    ? (flat ? "" : `<button type="button" class="info-ref" data-action="description-info" data-info="${l.info}" aria-label="Criterios y referencias: ${esc(l.key)}"><sup>?</sup></button>`) +
      (l.info === "st" ? `<button type="button" class="info-ref" data-action="st-zoom" aria-label="Ampliar el ST y medir a mano">${icon("search")}</button><button type="button" class="text-button st-distribution-link" data-action="st-distribution">Explorar distribución ST ${icon("grid")}</button>` : "") : "";
  const body = `<dl>${d.lines.map((l) => `<div><dt>${esc(l.key)}</dt><dd>${esc(l.text)}${info(l)}</dd></div>`).join("")}</dl><button type="button" class="text-button present-30-button" data-action="present-30">${icon("book")} Presentación en 30 segundos</button>`;
  return flat
    ? `<section class="structured-description"><h3>Lectura paso a paso</h3>${body}</section>`
    : `<details class="structured-description"${open ? " open" : ""}><summary>Descripción estructurada</summary>${body}</details>`;
}
