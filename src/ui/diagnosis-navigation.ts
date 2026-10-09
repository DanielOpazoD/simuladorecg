import type { Preset } from '../presets/catalog';
import { catalogFamilies, catalogLabel, searchText, matchesCatalog, type CatalogFamily } from './catalog-presentation';

/** Explicit navigation groups, not diagnostic inference or a new clinical taxonomy.
 * Every variant still loads its own unmodified canonical preset.
 */
export interface DiagnosisVariant { readonly id: string; readonly label: string }
export interface DiagnosisGroup {
  readonly id: string;
  readonly title: string;
  readonly variants: readonly DiagnosisVariant[];
}
const group = (id: string, title: string, variants: readonly (readonly [string, string])[]): DiagnosisGroup =>
  ({ id, title, variants: variants.map(([id, label]) => ({ id, label })) });
export const DIAGNOSIS_GROUPS: readonly DiagnosisGroup[] = [
  group('sinus', 'Ritmo sinusal', [['sinus', 'Normal'], ['brady', 'Bradicardia'], ['tachy', 'Taquicardia'], ['rsa', 'Arritmia respiratoria']]),
  group('af', 'Fibrilación auricular', [['af', 'Respuesta basal'], ['af_fast', 'Respuesta rápida'], ['af_slow', 'Respuesta lenta']]),
  group('flutter', 'Flutter auricular', [['flutter', 'Conducción 2:1'], ['flutter3', 'Conducción 3:1']]),
  group('pvc', 'Extrasístoles ventriculares', [['pvc', 'Aisladas'], ['bigeminy', 'Bigeminismo'], ['trigeminy', 'Trigeminismo'], ['couplet', 'Dupla']]),
  group('idioventricular', 'Ritmo idioventricular', [['idioventricular', 'Lento'], ['aivr', 'Acelerado']]),
  group('vt', 'Taquicardia ventricular', [['vt', 'Monomórfica'], ['torsades', 'Polimórfica']]),
  group('complete', 'Bloqueo AV completo', [['complete', 'Escape de la unión'], ['complete_v', 'Escape ventricular']]),
  group('rbbb', 'Bloqueo de rama derecha', [['rbbb', 'Completo'], ['irbbb', 'Incompleto']]),
  group('lafb', 'Hemibloqueos izquierdos', [['lafb', 'Anterior'], ['lpfb', 'Posterior']]),
  group('bifascicular', 'Bloqueo bifascicular', [['bifascicular', 'BRD + HBAI'], ['bifascicular_pr', 'Con PR prolongado']]),
  group('inferior', 'Lesión inferior', [['inferior', 'Predominio en III'], ['inferior_lcx', 'Predominio en II']]),
  group('old_inferior', 'Infarto antiguo', [['old_inferior', 'Inferior'], ['old_anterior', 'Anteroseptal']]),
  group('wellens_a', 'Patrón de Wellens', [['wellens_a', 'Tipo A'], ['wellens_b', 'Tipo B']]),
  group('rv_acute', 'Sobrecarga del ventrículo derecho', [['rv_acute', 'Aguda'], ['rv_chronic', 'Hipertrofia']]),
  group('aai', 'Estimulación con marcapasos', [['aai', 'AAI'], ['vvi', 'VVI'], ['ddd', 'DDD']]),
  group('longqt', 'Alteraciones del QT', [['longqt', 'QT prolongado'], ['shortqt', 'QT corto']]),
];

export function diagnosisForPreset(preset: Preset): DiagnosisGroup {
  return DIAGNOSIS_GROUPS.find(g => g.variants.some(v => v.id === preset.id)) ??
    group(preset.id, catalogLabel(preset), [[preset.id, catalogLabel(preset)]]);
}
export interface DiagnosisEntry {
  diagnosis: DiagnosisGroup;
  matches: Preset[];
  target: Preset;
  selected: boolean;
}
export interface DiagnosisFamily extends Omit<CatalogFamily, 'sections'> {
  entryCount: number;
  availableEntries: number;
  sections: { title: string; entries: DiagnosisEntry[] }[];
}

/** Collapse only AFTER searching individual presets: specific variants stay discoverable.
 * Search picks the exact matching ID when possible, then the first matching example.
 * Without search, returning to the active group keeps the current variant.
 */
export function diagnosisFamilies(presets: readonly Preset[], query = '', category = '', selectedId?: string): DiagnosisFamily[] {
  const queryId = searchText(query);
  const tokens = queryId.split(/\s+/).filter(Boolean);
  const matching = presets.filter(p => {
    const diagnosis = diagnosisForPreset(p);
    const variant = diagnosis.variants.find(v => v.id === p.id)!;
    return matchesCatalog(p, tokens, `${diagnosis.title} ${variant.label}`);
  });
  return catalogFamilies(matching, '', category).map(family => {
    const sections = family.sections.map(section => {
      const entries: DiagnosisEntry[] = [];
      for (const preset of section.presets) {
        const diagnosis = diagnosisForPreset(preset);
        const existing = entries.find(e => e.diagnosis.id === diagnosis.id);
        if (existing) existing.matches.push(preset);
        else entries.push({ diagnosis, matches: [preset], target: preset, selected: false });
      }
      for (const entry of entries) {
        entry.selected = entry.diagnosis.variants.some(v => v.id === selectedId);
        entry.target = (queryId
          ? entry.matches.find(p => p.id === queryId)
          : entry.matches.find(p => p.id === selectedId)) ?? entry.matches[0];
      }
      return { title: section.title, entries };
    });
    const entries = sections.flatMap(s => s.entries);
    return { ...family, sections, entryCount: entries.length,
      availableEntries: entries.filter(e => e.target.strategy !== 'pending').length };
  });
}
