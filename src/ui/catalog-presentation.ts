import type { Preset } from '../presets/catalog';

/** Presentation only: no preset patch, diagnosis or signal is rewritten. */
const labels: Readonly<Record<string, string>> = {
  Ritmos: 'Ritmo sinusal y auricular',
  Ectopia: 'Extrasístoles',
  'Conducción AV': 'Conducción AV',
  'Conducción intraventricular': 'Ramas y fascículos',
  Sobrecarga: 'Sobrecarga de cavidades',
  'Otros patrones': 'Electrolitos, QT y voltaje',
  Pendientes: 'Aún no disponibles',
};
/** The OMI paradigm (Meyers, Weingart, Smith; ECGsmith) replaces the territorial
 * «Isquemia y ST» family: four questions of care, each with its name in the current
 * guidelines (ACC/AHA 2025 and ESC 2023 keep STEMI / NSTE-ACS). Presets are unchanged;
 * only their place in the library moves. */
interface OmiFamily { id: string; label: string; guide: string; sections: readonly { title: string; ids: readonly string[]; crossListed?: boolean }[] }
export const OMI_FAMILIES: readonly OmiFamily[] = [
  { id: 'OMI evidente', label: 'OMI evidente', guide: 'En las guías: STEMI', sections: [
    { title: 'Descendente anterior', ids: ['anterior'] },
    { title: 'Coronaria derecha', ids: ['inferior', 'rv_infarct'] },
    { title: 'Circunfleja', ids: ['inferior_lcx', 'lateral'] },
  ] },
  { id: 'OMI sutil', label: 'OMI sutil y equivalentes', guide: 'En las guías: equivalente de STEMI o SCASEST con oclusión', sections: [
    { title: 'Sin elevación clásica del ST', ids: ['de_winter', 'posterior'] },
    { title: 'Tronco o tres vasos', ids: ['diffuse'] },
    { title: 'Con bloqueo de rama', ids: ['sgarbossa'] },
  ] },
  { id: 'NOMI', label: 'NOMI y reperfusión', guide: 'En las guías: SCASEST sin oclusión', sections: [
    { title: 'Isquemia sin oclusión', ids: ['subendo'] },
    { title: 'Reperfusión', ids: ['wellens_a', 'wellens_b'] },
    { title: 'Infarto establecido', ids: ['old_inferior', 'old_anterior'] },
  ] },
  { id: 'Imitadores', label: 'Imitadores del infarto', guide: 'Elevación del ST sin oclusión coronaria', sections: [
    { title: 'Pericardio', ids: ['pericarditis'] },
    { title: 'También en su familia', ids: ['lvh', 'hyperk', 'rv_acute'], crossListed: true },
  ] },
];
const OMI_SOURCE = 'Isquemia y ST';
/** The library family a preset lives in (its own; cross-listings are extra entries). */
export function catalogGroup(preset: Pick<Preset, 'id' | 'group'>): string {
  if (preset.group !== OMI_SOURCE) return preset.group;
  return OMI_FAMILIES.find(f => f.sections.some(s => !s.crossListed && s.ids.includes(preset.id)))?.id ?? OMI_FAMILIES[0].id;
}
const omiFamily = (id: string) => OMI_FAMILIES.find(f => f.id === id);
export const familyLabel = (group: string): string => omiFamily(group)?.label ?? labels[group] ?? group;
/** Name of an OMI family in the guidelines (empty for the other families). */
export const familyGuide = (group: string): string => omiFamily(group)?.guide ?? '';
/** Library families in display order: the OMI ones take the place of «Isquemia y ST». */
export function catalogGroups(presets: readonly Pick<Preset, 'id' | 'group'>[]): string[] {
  const out: string[] = [];
  for (const p of presets) {
    const ids = p.group === OMI_SOURCE ? OMI_FAMILIES.map(f => f.id) : [p.group];
    for (const id of ids) if (!out.includes(id)) out.push(id);
  }
  return out;
}

const displayNames: Readonly<Record<string, string>> = {
  sinus: 'Ritmo sinusal', brady: 'Bradicardia sinusal', tachy: 'Taquicardia sinusal',
  af: 'Fibrilación auricular', af_fast: 'FA · respuesta rápida', af_slow: 'FA · respuesta lenta',
  svt: 'TSV regular', junctional: 'Ritmo de la unión', pac: 'Extrasístole auricular',
  pvc: 'Extrasístole ventricular', couplet: 'Dupla ventricular', aivr: 'Idioventricular acelerado',
  complete: 'BAV completo · unión', complete_v: 'BAV completo · ventricular',
  rbbb: 'Rama derecha · BRD', irbbb: 'BRD incompleto', lbbb: 'Rama izquierda · BRI',
  lafb: 'Hemibloqueo anterior', lpfb: 'Hemibloqueo posterior', wpw: 'Preexcitación · WPW',
  anterior: 'Oclusión de la DA', inferior: 'Oclusión de la CD · III > II', inferior_lcx: 'Oclusión de la Cx · II ≥ III',
  sgarbossa: 'BRI con lesión concordante',
};
export const catalogLabel = (preset: Preset): string => displayNames[preset.id] ?? preset.short;

const aliases: Readonly<Record<string, string>> = {
  af: 'FA AF fibrilacion auricular', af_fast: 'FA rapida AF RVR', af_slow: 'FA lenta AF',
  rbbb: 'RBBB BRD', irbbb: 'IRBBB BRD', lbbb: 'LBBB BRI',
  lafb: 'HBAI LAFB', lpfb: 'HBPI LPFB',
  pac: 'ESA PAC extrasistole supraventricular', pvc: 'ESV PVC extrasistole ventricular',
  aivr: 'RIVA AIVR', vt: 'TV VT', vf: 'FV VF',
  torsades: 'torsades de pointes TdP TV polimorfica',
  hyperk: 'hiperpotasemia hiperkalemia potasio', hypok: 'hipopotasemia hipokalemia potasio',
  lowvoltage: 'bajo voltaje', wpw: 'Wolff Parkinson White',
};
export function searchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

interface Subdivision { title: string; ids: readonly string[]; crossListed?: boolean }
const subdivisions: Readonly<Record<string, readonly Subdivision[]>> = {
  Ritmos: [
    {title:'Sinusales', ids:['sinus','brady','tachy','rsa']},
    {title:'Auriculares', ids:['af','af_fast','af_slow','flutter','flutter3']},
    {title:'Unión y TSV', ids:['svt','junctional']},
  ],
  'Conducción AV': [
    {title:'Grado I y II', ids:['av1','wenckebach','mobitz2','av21']},
    {title:'Avanzado y completo', ids:['highav','complete','complete_v']},
  ],
  'Conducción intraventricular': [
    {title:'Ramas', ids:['rbbb','irbbb','lbbb']},
    {title:'Fascículos y combinaciones', ids:['lafb','lpfb','bifascicular','bifascicular_pr']},
    {title:'Preexcitación', ids:['wpw']},
  ],
};
for (const f of OMI_FAMILIES) (subdivisions as Record<string, readonly Subdivision[]>)[f.id] = f.sections;
export interface CatalogFamily {
  id: string;
  label: string;
  /** Name in the guidelines (OMI families only). */
  guide: string;
  count: number;
  available: number;
  sections: {title: string; presets: Preset[]; crossListed?: boolean}[];
}
const acronyms = new Set(['fa','af','tv','vt','fv','vf','brd','bri','tsv','svt','esa','esv','pac','pvc','wpw','qt','bav','riva']);
export function matchesCatalog(preset: Preset, tokens: readonly string[], extra = ''): boolean {
  const family = catalogGroup(preset);
  const text = searchText(`${preset.id} ${preset.name} ${preset.short} ${catalogLabel(preset)} ${family} ${familyLabel(family)} ${familyGuide(family)} ${aliases[preset.id] ?? ''} ${extra}`);
  const words = text.split(/[^a-z0-9]+/);
  // A short abbreviation must not match an unrelated fragment (FA ≠ fascículos).
  return tokens.every(token => acronyms.has(token) ? words.includes(token) : text.includes(token));
}
export function catalogFamilies(presets: readonly Preset[], query = '', group = ''): CatalogFamily[] {
  const tokens = searchText(query).split(/\s+/).filter(Boolean);
  const matching = presets.filter(p => matchesCatalog(p, tokens));
  const crossIds = (id: string) => (subdivisions[id] ?? []).filter(d => d.crossListed).flatMap(d => d.ids);
  const families = catalogGroups(presets).filter(id => !group || id === group).map(id => {
    const own = matching.filter(p => catalogGroup(p) === id), used = new Set<string>();
    const cross = matching.filter(p => crossIds(id).includes(p.id));
    const sections: CatalogFamily['sections'] = [];
    for (const division of subdivisions[id] ?? []) {
      const subset = (division.crossListed ? cross : own).filter(p => division.ids.includes(p.id));
      if (subset.length) { sections.push({title:division.title,presets:subset,...(division.crossListed?{crossListed:true}:{})});subset.forEach(p=>used.add(p.id)); }
    }
    const remainder = own.filter(p => !used.has(p.id));
    if (remainder.length) sections.push({title:sections.length?'Otros ejemplos':'',presets:remainder});
    return {id, label:familyLabel(id), guide:familyGuide(id), count:own.length, available:own.filter(p=>p.strategy!=='pending').length, sections};
  });
  return families.filter(f => f.sections.length);
}
