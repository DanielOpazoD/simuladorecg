import { describe, it, expect } from 'vitest';
import { suggestTEnds } from '../src/engine/analysis/t-end-area';
import { measure } from '../src/engine/measure';
import { fixture, BIPHASIC_T, U } from './fixtures';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { beatDetail } from '../src/ui/beat-detail';

describe('Area T-end assistance is not automatic QT', () => {
  it.each([250, 500, 1000])('locates an independent triangular T at %i Hz', fs => {
    const s = fixture({fs}), m = measure(s), suggestions = suggestTEnds(s, m);
    expect(suggestions.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    for (const c of suggestions) if (c) {
      expect(Math.abs(c.time % 1 - .76)).toBeLessThanOrEqual(.012);
      expect(c.supportingLeads.length).toBeGreaterThanOrEqual(3);
      expect(c.spreadMs).toBeLessThanOrEqual(24.000001);
    }
  });
  it.each(['offset', 'inverted'] as const)('preserves locations under %s', kind => {
    const s = fixture(), m = measure(s), reference = suggestTEnds(s, m);
    const altered = kind === 'offset' ? fixture({offset:true}) : fixture({t:[[.52,0],[.615,-.3],[.76,0]]});
    const results = suggestTEnds(altered, measure(altered));
    expect(results.map(c=>c?.time??null)).toEqual(reference.map(c=>c?.time??null));
  });
  it.each([BIPHASIC_T, undefined])('abstains on the deliberately ambiguous T/U fixture', t => {
    const s = t ? fixture({t}) : fixture({u:U});
    expect(suggestTEnds(s, measure(s)).every(c=>c===null)).toBe(true);
  });
  it('does not create candidates from a flat trace or absent T', () => {
    for (const s of [fixture({t:[]}), fixture({noiseOnly:true})])
      expect(suggestTEnds(s, measure(s)).every(c=>c===null)).toBe(true);
  });
  it('requires three leads rather than accepting one clean lead as global truth', () => {
    const s = fixture(), m = measure(s); s.leads.V1.fill(0); s.leads.V5.fill(0);
    expect(suggestTEnds(s, m).every(c=>c===null)).toBe(true);
  });
  it('does not use data beyond the analyzed recording window', () => {
    const s = fixture(), m = measure(s), a = suggestTEnds(s,m);
    m.window.end=4;
    const b=suggestTEnds(s,m);
    expect(b.slice(0,2)).toEqual(a.slice(0,2));
    expect(b.slice(3).every(c=>c===null)).toBe(true);
  });
  it('requires a delineated next QRS and declines invalid candidates', () => {
    const s=fixture(),m=measure(s);
    const bad=structuredClone(m); bad.beats[2].tPeak=NaN;
    expect(suggestTEnds(s,bad)[2]).toBeNull();
    expect(suggestTEnds(s,m).at(-1)).toBeNull();
    for (const fs of [0,NaN,Infinity,10000]) expect(suggestTEnds({...s,fs},m).every(c=>c===null)).toBe(true);
    s.leads.I[2]=NaN;
    expect(suggestTEnds(s,m).every(c=>c===null)).toBe(true);
  });
  it('does not read truth, events, diagnosis or quality; never changes samples or measurements', () => {
    const s=fixture(),m=measure(s),saved=structuredClone({s,m});
    for(const key of ['events','truth','diagnosis']) Object.defineProperty(s,key,{get(){throw Error('Forbidden '+key);}});
    Object.defineProperty(m,'evidence',{get(){throw Error('Quality is not input');},configurable:true});
    const candidates=suggestTEnds(s,m);
    expect(candidates.some(Boolean)).toBe(true);
    expect(s.leads).toEqual(saved.s.leads);
    expect(m.beats).toEqual(saved.m.beats); expect(m.qt).toEqual(saved.m.qt); expect(m.qtc).toEqual(saved.m.qtc);
    expect(suggestTEnds(s,m)).toEqual(candidates);
  });
  it('displays a proposal on tachycardia without adding a QT interval', () => {
    const c=fromPreset(presetById('tachy')!),s=synthesize(c,10),m=measure(s),before=structuredClone(m);
    const i=suggestTEnds(s,m).findIndex(x=>x!==null); expect(i).toBeGreaterThanOrEqual(0);
    const html=beatDetail(s,m,c,i);
    expect(html).toContain('data-t-end-candidate'); expect(html).toContain('revisión manual');
    expect(html).toContain('No modifica QT/QTc'); expect(html).not.toMatch(/QT \d+ ms/);
    expect(m).toEqual(before); expect(m.qt).toBeNull(); expect(m.evidence.qt.status).toBe('unavailable');
    c.view.lead='V5'; expect(beatDetail(s,m,c,i)).toContain('no un límite validado de V5');
  });
});
