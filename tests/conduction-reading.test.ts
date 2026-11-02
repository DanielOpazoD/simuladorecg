import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { educationalReading, educationalReadingDetail } from '../src/ui/educational-reading';
import { structuredDescription } from '../src/ui/structured-description';
import { conductionObservation, type ConductionObservation, type TerminalPolarity } from '../src/ui/terminal-qrs';
import type { Signal } from '../src/engine/types';

const load = (id: string) => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal' as const, filter: 'off' as const });
const LEADS = ['V1', 'I', 'V6'] as const;
type ObservedLead = typeof LEADS[number];
const pol = (o: ConductionObservation): Record<ObservedLead, TerminalPolarity> => ({ V1: o.v1, I: o.i, V6: o.v6 });
const expectedLeads = (o: ConductionObservation, p: TerminalPolarity): string[] => LEADS.filter(l => pol(o)[l] === p);
/** Leads named right after a label in the copy, e.g. "positivo en V1 y negativo en I y V6" -> positivo: [V1]. */
const leadsAfter = (text: string, label: string): string[] => {
  const m = text.match(new RegExp(label + ' en ([^.]*?)(?= y negativo| y positivo|, sin polaridad|[.])'));
  return m ? m[1].split(/,| y /).map(x => x.trim()).filter(Boolean) : [];
};
const withLeads = (s: Signal, f: (a: Float64Array, l: ObservedLead) => Float64Array): Signal => {
  const copy = structuredClone(s);
  for (const l of LEADS) copy.leads[l] = f(copy.leads[l], l);
  return copy;
};

describe('lectura docente de conducción basada en la observación terminal', () => {
  it.each(['rbbb', 'lbbb'])('%s describe solo los signos leídos, mantiene el wrapper, la cautela y los inputs', id => {
    const c = load(id), s = synthesize(c, 10), d = structuredDescription(c, s), obs = conductionObservation(c, s);
    expect(obs).not.toBeNull();
    const before = structuredClone({ c, s, d }), detail = educationalReadingDetail(c, s, d);
    expect(educationalReading(c, s, d)).toBe(detail.text);
    expect(detail.text.length).toBeGreaterThan(50); expect(detail.text.length).toBeLessThanOrEqual(450);
    expect(detail.coversRows).toEqual(['ST/QRS']);
    expect(detail.text).toContain('no explica por sí solo');
    expect(detail.text).toContain('la T');
    expect(detail.text).not.toMatch(/rama|BRD|BRI|bloqueo|R'|S ancha|\d+(?:[.,]\d+)?\s?(?:ms|mV|mm)\b/);
    expect(leadsAfter(detail.text, 'positivo')).toEqual(expectedLeads(obs!, 'positive'));
    expect(leadsAfter(detail.text, 'negativo')).toEqual(expectedLeads(obs!, 'negative'));
    expect(leadsAfter(detail.text, 'sin polaridad terminal clara')).toEqual(expectedLeads(obs!, 'flat'));
    expect({ c, s, d }).toEqual(before);
  });
  it('en BRI con V1 sin polaridad clara nunca se dice que V1 sea negativa', () => {
    const c = load('lbbb'), s = withLeads(synthesize(c, 10), (a, l) => l === 'V1' ? new Float64Array(a.length) : a);
    const obs = conductionObservation(c, s);
    expect(obs?.v1).toBe('flat');
    const text = educationalReadingDetail(c, s, structuredDescription(c, s)).text;
    expect(leadsAfter(text, 'negativo')).not.toContain('V1');
    expect(leadsAfter(text, 'positivo')).not.toContain('V1');
    expect(leadsAfter(text, 'sin polaridad terminal clara')).toContain('V1');
    expect(leadsAfter(text, 'positivo')).toEqual(expectedLeads(obs!, 'positive'));
    expect(leadsAfter(text, 'negativo')).toEqual(expectedLeads(obs!, 'negative'));
  });
  it.each(['rbbb', 'lbbb'])('%s: aplanar V1, I y V6 en una copia elimina las afirmaciones de polaridad sin tocar el original', id => {
    const c = load(id), s = synthesize(c, 10), before = structuredClone(s);
    const flat = withLeads(s, a => new Float64Array(a.length)), obs = conductionObservation(c, flat);
    expect(obs).toEqual({ v1: 'flat', i: 'flat', v6: 'flat', narrow: expect.any(Boolean) });
    const text = educationalReadingDetail(c, flat, structuredDescription(c, flat)).text;
    expect(text).not.toMatch(/positivo|negativo/);
    expect(text).toContain('sin polaridad terminal clara');
    expect(text).toContain('no explica por sí solo');
    expect(text).not.toMatch(/rama|bloqueo/);
    expect(s).toEqual(before);
  });
  it.each(['rbbb', 'lbbb'])('%s: invertir la copia intercambia los signos de forma observada', id => {
    const c = load(id), s = synthesize(c, 10), inv = withLeads(s, a => a.map(x => -x));
    const o1 = conductionObservation(c, s)!, o2 = conductionObservation(c, inv)!;
    const swap: Record<TerminalPolarity, TerminalPolarity> = { positive: 'negative', negative: 'positive', flat: 'flat', unavailable: 'unavailable' };
    expect(o2).toEqual({ v1: swap[o1.v1], i: swap[o1.i], v6: swap[o1.v6], narrow: o1.narrow });
    const t1 = educationalReadingDetail(c, s, structuredDescription(c, s)).text;
    const t2 = educationalReadingDetail(c, inv, structuredDescription(c, inv)).text;
    expect(leadsAfter(t2, 'positivo')).toEqual(leadsAfter(t1, 'negativo'));
    expect(leadsAfter(t2, 'negativo')).toEqual(leadsAfter(t1, 'positivo'));
    expect(leadsAfter(t2, 'sin polaridad terminal clara')).toEqual(leadsAfter(t1, 'sin polaridad terminal clara'));
  });
  it('con brazos invertidos usa el aviso existente y no cubre filas', () => {
    const c = load('lbbb'); c.artifacts = { ...c.artifacts, reversed: true };
    const s = synthesize(c, 10), detail = educationalReadingDetail(c, s, structuredDescription(c, s));
    expect(detail.text).toContain('inversión de los brazos');
    expect(detail.text).not.toMatch(/positivo en|negativo en/);
    expect(detail.coversRows).toEqual([]);
    expect(educationalReading(c, s, structuredDescription(c, s))).toBe(detail.text);
  });
  it.each([['sinus', /Las P de este tramo|Sigue la secuencia P–QRS/], ['af', /fibrilación auricular/], ['anterior', /Relaciona el ST y la T/]] as const)('%s conserva el texto previo con coversRows vacío', (id, re) => {
    const c = load(id), s = synthesize(c, 10), d = structuredDescription(c, s), detail = educationalReadingDetail(c, s, d);
    expect(detail.text).toMatch(re);
    expect(detail.text).not.toMatch(/positivo en|negativo en|sin polaridad terminal clara/);
    expect(detail.coversRows).toEqual([]);
    expect(educationalReading(c, s, d)).toBe(detail.text);
  });
});
