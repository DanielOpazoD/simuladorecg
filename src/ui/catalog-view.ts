import type { Preset } from "../presets/catalog";
import { diagnosisFamilies, diagnosisForPreset } from "./diagnosis-navigation";
import { esc, icon } from "./helpers";
import { catalogGroup, familyLabel } from "./catalog-presentation";

/** The library as an accordion: every family fits on one line, so all of them are
 * visible at once; the family of the case shown opens, plus those the reader opened
 * (`open`), and all of them while searching or filtering. */
export function catalogView(
  presets: readonly Preset[],
  search = "",
  group = "",
  selectedId?: string,
  open: ReadonlySet<string> = new Set(),
) {
  // Examples not yet available stay out of the library.
  const families = diagnosisFamilies(presets.filter(p => p.strategy !== "pending"), search, group, selectedId);
  // Cross-listed entries (imitators also shown in their own family) count once.
  const own = families.flatMap(f => f.sections.filter(s => !s.crossListed).flatMap(s => s.entries));
  const available = own.reduce((sum, e) => sum + e.matches.filter(p => p.strategy !== "pending").length, 0);
  const entries = own.filter(e => e.target.strategy !== "pending").length;
  const count = `${entries} ${entries === 1 ? "patrón" : "patrones"} · ${available} ${available === 1 ? "ejemplo" : "ejemplos"}`;
  const html = families.map(family =>
    `<details class="case-group" data-family="${esc(family.id)}"${search || group || open.has(family.id) || family.sections.some(sec => !sec.crossListed && sec.entries.some(e => e.selected)) ? " open" : ""}><summary><span>${esc(family.label)}</span><span class="case-group-count">${family.entryCount}</span></summary>${family.guide ? `<p class="case-group-guide">${esc(family.guide)}</p>` : ""}${family.sections.map(section =>
      `${section.title ? `<h4 class="case-subgroup">${esc(section.title)}</h4>` : ""}${section.entries.map(entry => {
        const {diagnosis, target, selected, matches} = entry;
        const pending = target.strategy === "pending";
        const multiple = diagnosis.variants.length > 1;
        const detail = pending ? "Pendiente" : section.crossListed ? `También en ${familyLabel(catalogGroup(target))}` : search && matches.length === 1 && multiple
          ? `Coincide: ${diagnosis.variants.find(v => v.id === target.id)!.label}`
          : multiple ? `${diagnosis.variants.length} variantes` : "";
        return `<button type="button" class="case-button ${selected ? "selected" : ""}" data-diagnosis="${esc(diagnosis.id)}" data-preset="${esc(target.id)}" title="${esc(target.name)}" aria-label="${esc(diagnosis.title)}${detail ? ` · ${esc(detail)}` : ""}" ${pending ? "disabled" : ""} ${selected ? 'aria-current="true"' : ""}><span>${esc(diagnosis.title)}${detail ? `<small class="case-variants-count">${esc(detail)}</small>` : ""}</span>${selected ? icon("check") : multiple ? icon("chevron") : ""}</button>`;
      }).join("")}`
    ).join("")}</details>`
  ).join("") || '<div class="catalog-empty"><strong>No encontramos ese patrón</strong><p>Prueba con el nombre completo o una sigla como FA, BRI o WPW.</p></div>';
  return { count, html, clearFiltersVisible: !!search || !!group };
}

export class VariantNavigation {
  private renderedKey = "";

  constructor(
    private readonly navigation: HTMLElement,
    private readonly content: HTMLElement,
  ) {}

  update(preset: Preset | undefined, concealed: boolean, reversed: boolean) {
    const diagnosis = preset && !concealed && !reversed ? diagnosisForPreset(preset) : null;
    const multi = diagnosis && diagnosis.variants.length > 1;
    const key = multi ? `${diagnosis.id}/${preset!.id}` : "";
    this.navigation.hidden = !multi;
    if (key !== this.renderedKey) {
      this.navigation.innerHTML = multi ? `<span id="variant-label" class="sr-only">Variantes del patrón</span><div class="variant-tabs" role="tablist" aria-labelledby="variant-label" data-activation="manual">${diagnosis.variants.map(v => `<button type="button" role="tab" id="variant-tab-${esc(v.id)}" data-variant="${esc(v.id)}" aria-selected="${v.id === preset!.id}" aria-controls="diagnosis-content" tabindex="${v.id === preset!.id ? 0 : -1}">${esc(v.label)}</button>`).join("")}</div>` : "";
      this.renderedKey = key;
    }
    if (multi) {
      this.content.setAttribute("role", "tabpanel");
      this.content.setAttribute("aria-labelledby", `variant-tab-${preset!.id}`);
    } else {
      this.content.removeAttribute("role");
      this.content.removeAttribute("aria-labelledby");
    }
  }
}
