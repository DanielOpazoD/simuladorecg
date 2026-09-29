import { describe, expect, it } from 'vitest';
import { PRESETS, fromPreset, presetById } from '../src/presets/catalog';
import { caseContext } from '../src/presets/case-context';
import { DIAGNOSIS_GROUPS, diagnosisFamilies, diagnosisForPreset } from '../src/ui/diagnosis-navigation';

const entries = (query = '', category = '', selected?: string) =>
  diagnosisFamilies(PRESETS, query, category, selected).flatMap(f => f.sections.flatMap(s => s.entries));

describe('Pattern entries and canonical variant navigation', () => {
  it('preserves all 61 active examples and five pending examples exactly once', () => {
    const before = JSON.stringify(PRESETS), all = entries();
    expect(all).toHaveLength(45);
    expect(all.filter(e => e.target.strategy !== 'pending')).toHaveLength(40);
    expect(all.filter(e => e.target.strategy === 'pending')).toHaveLength(5);
    expect(all.flatMap(e => e.matches.map(p => p.id)).sort()).toEqual(PRESETS.map(p => p.id).sort());
    expect(new Set(all.map(e => e.diagnosis.id)).size).toBe(45);
    expect(JSON.stringify(PRESETS)).toBe(before);
  });
  it('has no duplicate, unavailable or cross-family variants in grouped navigation', () => {
    const ids = DIAGNOSIS_GROUPS.flatMap(g => g.variants.map(v => v.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of DIAGNOSIS_GROUPS) {
      const members = g.variants.map(v => presetById(v.id)!);
      expect(members.every(p => p && p.strategy !== 'pending')).toBe(true);
      expect(new Set(members.map(p => p.group)).size).toBe(1);
      expect(g.variants).toHaveLength(entries().find(e => e.diagnosis.id === g.id)!.matches.length);
    }
  });
  it.each([
    ['sinus',['sinus','brady','tachy','rsa']],
    ['af',['af','af_fast','af_slow']],
    ['flutter',['flutter','flutter3']],
    ['pvc',['pvc','bigeminy','trigeminy','couplet']],
    ['complete',['complete','complete_v']],
    ['rbbb',['rbbb','irbbb']],
    ['aai',['aai','vvi','ddd']],
    ['wellens_a',['wellens_a','wellens_b']],
  ])('%s has the required internal variants, not duplicate sidebar rows', (id, ids) => {
    const entry = entries().find(e => e.diagnosis.id === id)!;
    expect(entry.diagnosis.variants.map(v => v.id)).toEqual(ids);
    expect(entry.matches.map(p => p.id)).toEqual(ids);
  });
  it.each(PRESETS)('$id remains reachable by its exact identifier', p => {
    expect(entries(p.id).some(e => e.target.id === p.id)).toBe(true);
    expect(diagnosisForPreset(p).variants.some(v => v.id === p.id)).toBe(true);
  });
  it.each(['FA','AF','fibrilación auricular','FIBRILACION AURICULAR'])('%s collapses three FA presets into one entry', q => {
    const result = entries(q);
    expect(result).toHaveLength(1);
    expect(result[0].diagnosis.id).toBe('af');
    expect(result[0].matches.map(p => p.id)).toEqual(['af','af_fast','af_slow']);
  });
  it('specific searches open the matched variant and do not hide its siblings in the sheet', () => {
    const result = entries('FA lenta');
    expect(result).toHaveLength(1);
    expect(result[0].target.id).toBe('af_slow');
    expect(result[0].matches.map(p => p.id)).toEqual(['af_slow']);
    expect(result[0].diagnosis.variants).toHaveLength(3);
  });
  it.each(['brady','af_slow','flutter3','irbbb','ddd'])('returning to the active group preserves %s when unfiltered', id => {
    const active = entries('', '', id).filter(e => e.selected);
    expect(active).toHaveLength(1);
    expect(active[0].target.id).toBe(id);
  });
  it('a search result takes priority over the other currently selected variant', () => {
    expect(entries('brady','','tachy')[0].target.id).toBe('brady');
    expect(entries('sinus','','tachy')[0].target.id).toBe('sinus');
  });
  it('searches the visible parent and variant names', () => {
    expect(entries('Respuesta basal')[0].target.id).toBe('af');
    expect(entries('hemibloqueos')[0].diagnosis.variants).toHaveLength(2);
    expect(entries('extrasístoles ventriculares')[0].diagnosis.variants).toHaveLength(4);
    expect(entries('marcapasos')[0].diagnosis.variants).toHaveLength(3);
  });
  it('keeps different clinical entities separate instead of inventing equivalence', () => {
    for (const id of ['wenckebach','mobitz2','av21','highav','lbbb','sgarbossa','hyperk','hypok','pericarditis'])
      expect(diagnosisForPreset(presetById(id)!).variants.map(v => v.id)).toEqual([id]);
  });
  it('category filters, no results and unrecognized future presets remain explicit', () => {
    expect(diagnosisFamilies(PRESETS,'','Conducción intraventricular')[0].entryCount).toBe(5);
    expect(entries('no-existe')).toEqual([]);
    expect(entries('FA','Sobrecarga')).toEqual([]);
    const extra = {...PRESETS[0],id:'future',name:'Future',short:'Future'};
    expect(diagnosisForPreset(extra)).toEqual({id:'future',title:'Future',variants:[{id:'future',label:'Future'}]});
  });
  it('does not infer a diagnosis for edited or misleadingly named cases', () => {
    const custom = {...fromPreset(presetById('af')!), hr:120};
    expect(caseContext(custom).preset).toBeUndefined();
    expect(caseContext({...custom,presetId:'custom',name:'Fibrilación auricular'}).preset).toBeUndefined();
  });
});
