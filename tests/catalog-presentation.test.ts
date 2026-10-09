import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { PRESETS, type Preset } from '../src/presets/catalog';
import { catalogFamilies, catalogLabel, familyLabel, searchText } from '../src/ui/catalog-presentation';

const flatten = (query = '', group = '') => catalogFamilies(PRESETS, query, group)
  .flatMap(family => family.sections.flatMap(section => section.presets));
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
  it.each([...new Set(PRESETS.map(p => p.group))])('retains the stable category value %s', group => {
    assert.deepEqual(ids('', group), PRESETS.filter(p => p.group === group).map(p => p.id).sort());
    assert.equal(catalogFamilies(PRESETS, '', group)[0].id, group);
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
