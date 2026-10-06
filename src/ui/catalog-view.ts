import type { Preset } from "../presets/catalog";
import { diagnosisFamilies, diagnosisForPreset } from "./diagnosis-navigation";
import { esc, icon } from "./helpers";

export function catalogView(
  presets: readonly Preset[],
  search = "",
  group = "",
  selectedId?: string,
) {
  const families = diagnosisFamilies(presets, search, group, selectedId);
  const available = families.reduce((sum, family) => sum + family.available, 0);
  const entries = families.reduce((sum, family) => sum + family.availableEntries, 0);
  const count = `${entries} ${entries === 1 ? "patrón" : "patrones"} · ${available} ${available === 1 ? "ejemplo" : "ejemplos"}`;
  const html = families.map(family =>
    `<section class="case-group"><h3>${esc(family.label)}<span>${family.entryCount}</span></h3>${family.sections.map(section =>
      `${section.title ? `<h4 class="case-subgroup">${esc(section.title)}</h4>` : ""}${section.entries.map(entry => {
        const {diagnosis, target, selected, matches} = entry;
        const pending = target.strategy === "pending";
        const multiple = diagnosis.variants.length > 1;
        const detail = pending ? "Pendiente" : search && matches.length === 1 && multiple
          ? `Coincide: ${diagnosis.variants.find(v => v.id === target.id)!.label}`
          : multiple ? `${diagnosis.variants.length} variantes` : "";
        return `<button type="button" class="case-button ${selected ? "selected" : ""}" data-diagnosis="${esc(diagnosis.id)}" data-preset="${esc(target.id)}" title="${esc(target.name)}" aria-label="${esc(diagnosis.title)}${detail ? ` · ${esc(detail)}` : ""}" ${pending ? "disabled" : ""} ${selected ? 'aria-current="true"' : ""}><span>${esc(diagnosis.title)}${detail ? `<small class="case-variants-count">${esc(detail)}</small>` : ""}</span>${selected ? icon("check") : multiple ? icon("chevron") : ""}</button>`;
      }).join("")}`
    ).join("")}</section>`
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
      this.navigation.innerHTML = multi ? `<div class="variant-heading"><span id="variant-label">Variantes del patrón</span><small>Cambiar de variante carga su ejemplo original.</small></div><div class="variant-tabs" role="tablist" aria-labelledby="variant-label" data-activation="manual">${diagnosis.variants.map(v => `<button type="button" role="tab" id="variant-tab-${esc(v.id)}" data-variant="${esc(v.id)}" aria-selected="${v.id === preset!.id}" aria-controls="diagnosis-content" tabindex="${v.id === preset!.id ? 0 : -1}">${esc(v.label)}</button>`).join("")}</div>` : "";
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
