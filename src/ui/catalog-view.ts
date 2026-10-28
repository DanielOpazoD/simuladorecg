import { presetTitle } from "../presets/nomenclature";
import { PRESETS, type Preset } from "../presets/catalog";
import { diagnosisFamilies, diagnosisForPreset } from "./diagnosis-navigation";
import { esc, icon } from "./helpers";
import { catalogFamilies, catalogGroup, familyLabel, isIschemiaFamily } from "./catalog-presentation";

const indexGroup = (id: string) => isIschemiaFamily(id) ? 'Isquemia y ST' : id;
const shortFamilies: Record<string, string> = {Ritmos:'Sinusal y auricular', 'Ritmos ventriculares':'Ventriculares', Sobrecarga:'Sobrecargas'};
export const catalogFamilyLabel = (id:string) => shortFamilies[id] ?? familyLabel(id);
/** Keep the route used for cross-listed cases; otherwise reveal the case's own family. */
export function catalogFamilyForPreset(preset:Preset, preferred='') {
  const routes=catalogFamilies(PRESETS).filter(f=>f.sections.some(s=>s.presets.some(p=>p.id===preset.id))).map(f=>indexGroup(f.id));
  return routes.includes(preferred)?preferred:indexGroup(catalogGroup(preset));
}
const shortCases: Record<string, string> = {anterior:'DA · anterior', lateral:'Cx · lateral'};
/** A stable family index above one result area. Searching spans every family. */
export function catalogView(
  presets: readonly Preset[],
  search = "",
  group = "",
  selectedId?: string,
  activeFamily = "",
) {
  // Examples not yet available stay out of the library.
  const families = diagnosisFamilies(presets.filter(p => p.strategy !== "pending"), search, group, selectedId);
  const all = diagnosisFamilies(presets.filter(p => p.strategy !== 'pending'));
  const keys = [...new Set(all.map(f => indexGroup(f.id)))].sort((a,b) => Number(b === 'Isquemia y ST') - Number(a === 'Isquemia y ST'));
  const selected = presets.find(p => p.id === selectedId);
  const active = keys.includes(activeFamily) ? activeFamily : selected ? indexGroup(catalogGroup(selected)) : keys[0];
  const navigation = keys.map(id => `<button type="button" data-action="catalog-family" data-catalog-family="${esc(id)}" aria-pressed="${!search && id === active}" aria-controls="case-list">${esc(catalogFamilyLabel(id))}</button>`).join('');
  // Cross-listed entries (imitators also shown in their own family) count once.
  const own = families.flatMap(f => f.sections.filter(s => !s.crossListed).flatMap(s => s.entries));
  const available = own.reduce((sum, e) => sum + e.matches.filter(p => p.strategy !== "pending").length, 0);
  const entries = own.filter(e => e.target.strategy !== "pending").length;
  const count = `${entries} ${entries === 1 ? "patrón" : "patrones"} · ${available} ${available === 1 ? "ejemplo" : "ejemplos"}`;
  const renderFamily = (family: typeof families[number]) =>
    `<section class="case-group" data-family="${esc(family.id)}" data-index-family="${esc(indexGroup(family.id))}"${!search && !group && indexGroup(family.id) !== active ? ' hidden' : ''}><h3 class="family-result-title${!search && !isIschemiaFamily(family.id) ? ' sr-only' : ''}">${esc(family.id === 'OMI evidente' ? 'Territorios' : family.label)}</h3>${family.guide ? `<p class="case-group-guide">${esc(family.guide)}</p>` : ""}${family.sections.map(section =>
      `${section.title && !isIschemiaFamily(family.id) && !(section.entries.length === 1 && section.title === section.entries[0].diagnosis.title) ? `<h4 class="case-subgroup">${esc(section.title)}</h4>` : ""}${section.entries.map(entry => {
        const {diagnosis, target, selected, matches} = entry;
        const pending = target.strategy === "pending";
        const multiple = diagnosis.variants.length > 1;
        const detail = pending ? "Pendiente" : section.crossListed ? `También en ${familyLabel(catalogGroup(target))}` : search && matches.length === 1 && multiple
          ? `Coincide: ${diagnosis.variants.find(v => v.id === target.id)!.label}`
          : multiple ? `${diagnosis.variants.length} variantes` : "";
        return `<button type="button" class="case-button ${selected ? "selected" : ""}" data-diagnosis="${esc(diagnosis.id)}" data-preset="${esc(target.id)}" title="${esc(presetTitle(target))}" aria-label="${shortCases[target.id] ? esc(shortCases[target.id]) + " · " : ""}${esc(diagnosis.title)}${detail ? ` · ${esc(detail)}` : ""}" ${pending ? "disabled" : ""} ${selected ? 'aria-current="true"' : ""}><span>${esc(shortCases[target.id] ?? diagnosis.title)}${detail ? `<small class="case-variants-count">${esc(detail)}</small>` : ""}</span>${selected ? icon("check") : multiple ? icon("chevron") : ""}</button>`;
      }).join("")}`
    ).join("")}</section>`;
  const ischemia = families.filter(f => isIschemiaFamily(f.id));
  const html = (ischemia.length ? `<section class="ischemia-library" aria-label="Isquemia y ST"${!search && !group && active !== 'Isquemia y ST' ? ' hidden' : ''}>${ischemia.map(renderFamily).join('')}</section>` : '') + families.filter(f => !isIschemiaFamily(f.id)).map(renderFamily).join('') || '<div class="catalog-empty"><strong>No encontramos ese patrón</strong><p>Prueba con el nombre completo o una sigla como FA, BRI o WPW.</p></div>';
  return { count, html, navigation, active, clearFiltersVisible: !!search || !!group };
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
