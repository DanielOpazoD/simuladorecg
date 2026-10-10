import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { PRESETS, type Preset } from '../src/presets/catalog';
import { catalogFamilies, catalogGroup, catalogGroups, catalogLabel, familyGuide, familyLabel, OMI_FAMILIES, searchText } from '../src/ui/catalog-presentation';

// Each preset's own place; cross-listed imitators (also shown under «Imitadores») excluded.
const flatten = (query = '', group = '') => catalogFamilies(PRESETS, query, group)
  .flatMap(family => family.sections.filter(section => !section.crossListed).flatMap(section => section.presets));
const ids = (query = '', group = '') => flatten(query, group).map(p => p.id).sort();

describe('Catalog presentation never changes clinical presets', () => {
  it('keeps every identifier exactly once with the same preset object', () => {
    const all = flatten();
    assert.equal(all.length, PRESETS.length);
    assert.equal(new Set(all.map(p => p.id)).size, PRESETS.length);
    for (const preset of PRESETS) assert.equal(all.find(p => p.id === preset.id), preset);
  });
  it('leaves names, patches, findings, limits and strategies unchanged after searches', () => {
    const before = JSON.stringify(PRESETS);
    for (const q of ['', 'FA', 'WPW', 'hipokalemia', 'BRI', 'zzzz']) catalogFamilies(PRESETS, q);
    assert.equal(JSON.stringify(PRESETS), before);
  });
  it('keeps the actual available and pending counts', () => {
    const groups = catalogFamilies(PRESETS);
    assert.equal(groups.reduce((n,g) => n + g.count, 0), PRESETS.length);
    assert.equal(groups.reduce((n,g) => n + g.available, 0), 63);
    assert.equal(PRESETS.filter(p => p.strategy === 'pending').length, 5);
  });
  it('does not hide pending patterns or convert them to available', () => {
    const pending = flatten('', 'Pendientes');
    assert.equal(pending.length, 5);
    assert.ok(pending.every(p => p.strategy === 'pending'));
    assert.equal(catalogFamilies(PRESETS, '', 'Pendientes')[0].available, 0);
  });
  it.each(catalogGroups(PRESETS))('retains the stable category value %s', group => {
    assert.deepEqual(ids('', group), PRESETS.filter(p => catalogGroup(p) === group).map(p => p.id).sort());
    assert.equal(catalogFamilies(PRESETS, '', group)[0].id, group);
  });
  it('replaces «Isquemia y ST» by the four OMI families, in its place, with their guideline names', () => {
    const groups = catalogGroups(PRESETS), first = groups.indexOf('OMI evidente');
    assert.deepEqual(groups.slice(first, first + 4), ['OMI evidente', 'OMI sutil', 'NOMI', 'Imitadores']);
    assert.ok(!groups.includes('Isquemia y ST'));
    for (const p of PRESETS.filter(p => p.group === 'Isquemia y ST'))
      assert.equal(OMI_FAMILIES.filter(f => f.sections.some(s => !s.crossListed && s.ids.includes(p.id))).length, 1, p.id);
    assert.equal(familyGuide('OMI evidente'), 'En las guías: STEMI');
    assert.equal(familyGuide('NOMI'), 'En las guías: SCASEST sin oclusión');
    assert.equal(familyGuide('Ritmos'), '');
    assert.equal(catalogGroup(PRESETS.find(p => p.id === 'wellens_a')!), 'NOMI');
    // The data is untouched: only the library place moves.
    assert.equal(PRESETS.find(p => p.id === 'anterior')!.group, 'Isquemia y ST');
  });
  it('shows imitators that live in another family also under «Imitadores», marked as such', () => {
    const imit = catalogFamilies(PRESETS, '', 'Imitadores')[0];
    const cross = imit.sections.find(s => s.crossListed)!;
    assert.deepEqual(cross.presets.map(p => p.id).sort(), ['hyperk', 'lvh', 'rv_acute']);
    assert.equal(catalogGroup(PRESETS.find(p => p.id === 'lvh')!), 'Sobrecarga');
  });
  it('uses presentation labels without rewriting original groups', () => {
    assert.equal(familyLabel('Ectopia'), 'Extrasístoles');
    assert.equal(PRESETS.find(p => p.id === 'pvc')!.group, 'Ectopia');
  });
  it('retains canonical descriptive names behind concise labels', () => {
    const preset = PRESETS.find(p => p.id === 'lbbb')!;
    assert.equal(catalogLabel(preset), 'Rama izquierda · BRI');
    assert.notEqual(preset.name, catalogLabel(preset));
    assert.ok(ids(preset.name).includes(preset.id));
  });
  it('puts future entries in a fallback instead of dropping them', () => {
    const extra = {...PRESETS[0], id:'new-example', short:'Nuevo', name:'Nuevo ejemplo'} as Preset;
    const groups = catalogFamilies([...PRESETS, extra]);
    assert.equal(groups.flatMap(g => g.sections.flatMap(s => s.presets)).filter(p => p.id === extra.id).length, 1);
  });
  it('preserves a new family name as its own heading', () => {
    const extra = {...PRESETS[0], group:'Nueva familia'};
    assert.equal(catalogFamilies([extra])[0].label, 'Nueva familia');
  });
});

describe('Discoverable search without unrelated abbreviation matches', () => {
  it('normalizes accent, case and surrounding whitespace', () => {
    assert.equal(searchText('  FIBRILACIÓN AURICULAR  '), 'fibrilacion auricular');
    assert.deepEqual(ids('fibrilacion'), ids('FIBRILACIÓN'));
  });
  it('does not confuse FA with fascículos', () => {
    assert.deepEqual(ids('FA'), ['af','af_fast','af_slow']);
  });
  it.each([
    ['RBBB','rbbb'], ['LBBB','lbbb'], ['WPW','wpw'], ['ESV','pvc'], ['ESA','pac'],
    ['RIVA','aivr'], ['hipopotasemia','hypok'], ['hiperpotasemia','hyperk'],
    ['Wolff Parkinson White','wpw'], ['torsades de pointes','torsades'],
  ])('finds %s through the existing pattern %s', (query, expected) => {
    assert.ok(ids(query).includes(expected));
  });
  it('requires all search words', () => {
    assert.deepEqual(ids('FA rápida'), ['af_fast']);
    assert.deepEqual(ids('FA imposible'), []);
  });
  it('intersects search with the selected category', () => {
    assert.deepEqual(ids('FA', 'Conducción AV'), []);
    assert.deepEqual(ids('FA', 'Ritmos'), ['af','af_fast','af_slow']);
  });
  it('returns an empty result, not a fabricated match', () => {
    assert.deepEqual(catalogFamilies(PRESETS, 'zzzz-sin-patron'), []);
    assert.deepEqual(catalogFamilies(PRESETS, '', 'Categoría inexistente'), []);
  });
  it('treats whitespace-only input as all patterns', () => {
    assert.deepEqual(ids(' \t '), ids());
  });
});
