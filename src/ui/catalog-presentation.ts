import type { Preset } from '../presets/catalog';

/** Presentation only: no preset patch, diagnosis or signal is rewritten. */
const labels: Readonly<Record<string, string>> = {
  Ritmos: 'Ritmo sinusal y auricular',
  Ectopia: 'Extrasístoles',
  'Conducción AV': 'Conducción AV',
  'Conducción intraventricular': 'Ramas y fascículos',
  'Isquemia y ST': 'Isquemia y repolarización',
  Sobrecarga: 'Sobrecarga de cavidades',
  'Otros patrones': 'Electrolitos, QT y voltaje',
  Pendientes: 'Aún no disponibles',
};
export const familyLabel = (group: string): string => labels[group] ?? group;

const displayNames: Readonly<Record<string, string>> = {
  sinus: 'Ritmo sinusal', brady: 'Bradicardia sinusal', tachy: 'Taquicardia sinusal',
  af: 'Fibrilación auricular', af_fast: 'FA · respuesta rápida', af_slow: 'FA · respuesta lenta',
  svt: 'TSV regular', junctional: 'Ritmo de la unión', pac: 'Extrasístole auricular',
  pvc: 'Extrasístole ventricular', couplet: 'Dupla ventricular', aivr: 'Idioventricular acelerado',
  complete: 'BAV completo · unión', complete_v: 'BAV completo · ventricular',
  rbbb: 'Rama derecha · BRD', irbbb: 'BRD incompleto', lbbb: 'Rama izquierda · BRI',
  lafb: 'Hemibloqueo anterior', lpfb: 'Hemibloqueo posterior', wpw: 'Preexcitación · WPW',
  inferior: 'Inferior · III > II', inferior_lcx: 'Inferior · II ≥ III',
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

interface Subdivision { title: string; ids: readonly string[] }
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
  'Isquemia y ST': [
    {title:'Patrones por territorio', ids:['inferior','inferior_lcx','anterior','lateral','posterior','rv_infarct']},
    {title:'Patrones difusos', ids:['diffuse','subendo']},
    {title:'Otros patrones ST–T', ids:['wellens_a','wellens_b','de_winter','sgarbossa','pericarditis']},
  ],
};
export interface CatalogFamily {
  id: string;
  label: string;
  count: number;
  available: number;
  sections: {title: string; presets: Preset[]}[];
}
const acronyms = new Set(['fa','af','tv','vt','fv','vf','brd','bri','tsv','svt','esa','esv','pac','pvc','wpw','qt','bav','riva']);
export function matchesCatalog(preset: Preset, tokens: readonly string[], extra = ''): boolean {
  const text = searchText(`${preset.id} ${preset.name} ${preset.short} ${catalogLabel(preset)} ${preset.group} ${familyLabel(preset.group)} ${aliases[preset.id] ?? ''} ${extra}`);
  const words = text.split(/[^a-z0-9]+/);
  // A short abbreviation must not match an unrelated fragment (FA ≠ fascículos).
  return tokens.every(token => acronyms.has(token) ? words.includes(token) : text.includes(token));
}
export function catalogFamilies(presets: readonly Preset[], query = '', group = ''): CatalogFamily[] {
  const tokens = searchText(query).split(/\s+/).filter(Boolean);
  const matching = presets.filter(p => (!group || p.group === group) && matchesCatalog(p, tokens));
  return [...new Set(matching.map(p => p.group))].map(id => {
    const members = matching.filter(p => p.group === id), used = new Set<string>();
    const sections: CatalogFamily['sections'] = [];
    for (const division of subdivisions[id] ?? []) {
      const subset = members.filter(p => division.ids.includes(p.id));
      if (subset.length) { sections.push({title:division.title,presets:subset});subset.forEach(p=>used.add(p.id)); }
    }
    const remainder = members.filter(p => !used.has(p.id));
    if (remainder.length) sections.push({title:sections.length?'Otros ejemplos':'',presets:remainder});
    return {id, label:familyLabel(id), count:members.length, available:members.filter(p=>p.strategy!=='pending').length, sections};
  });
}
