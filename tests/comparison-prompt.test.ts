import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { comparisonPrompt } from '../src/ui/case-comparison';
import type { ECGCase, Signal } from '../src/engine/types';

const load = (id: string) => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal' as const, filter: 'off' as const });
const prepared = (id: string) => { const c = load(id); return { c, s: synthesize(c, 10) }; };
const LEADS = ['V1', 'I', 'V6'] as const;
const flattened = (s: Signal): Signal => { const copy = structuredClone(s); for (const l of LEADS) copy.leads[l] = new Float64Array(copy.leads[l].length); return copy; };
/** Diagnostic labels, unobserved signs, causality and values with units are never announced. */
const FORBIDDEN = /rama|BRD|BRI|bloqueo|R'|S ancha|porque|causa|diagn|\d+(?:[.,]\d+)?\s?(?:ms|mV|mm)\b/;
const FAMILIES = ['sinus', 'rbbb', 'lbbb'] as const;
const PAIRS = FAMILIES.flatMap(a => FAMILIES.filter(b => b !== a).map(b => [a, b] as const));

describe('pregunta única del comparador entre familias de conducción distintas', () => {
  it.each(PAIRS)('%s frente a %s: una sola pregunta sobre V1, I, V6 y el final del QRS, sin etiquetas ni mutación', (a, b) => {
    const x = prepared(a), y = prepared(b), before = structuredClone({ x, y });
    const text = comparisonPrompt(x.c, x.s, y.c, y.s);
    expect(text.length).toBeGreaterThan(40); expect(text.length).toBeLessThanOrEqual(320);
    expect(text.match(/\?/g)?.length).toBe(1);
    expect(text.match(/¿/g)?.length).toBe(1);
    for (const l of LEADS) expect(text).toMatch(new RegExp(`\\b${l}\\b`));
    expect(text).toMatch(/final del QRS/);
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(/positiv|negativ|plan[ao]/);
    expect(comparisonPrompt(y.c, y.s, x.c, x.s)).toBe(text);
    expect({ x, y }).toEqual(before);
  });
  it.each(FAMILIES)('%s frente a su misma familia devuelve cadena vacía', id => {
    const x = prepared(id), y = prepared(id);
    expect(comparisonPrompt(x.c, x.s, y.c, y.s)).toBe('');
  });
  it('fuera del dominio (FA, estimulación, lesión, brazos invertidos) no hay pregunta en ningún sentido', () => {
    const ref = prepared('rbbb'), sin = prepared('sinus');
    const reversed = load('lbbb'); reversed.artifacts = { ...reversed.artifacts, reversed: true };
    const probes = [prepared('af'), prepared('vvi'), prepared('anterior'), { c: reversed, s: synthesize(reversed, 10) }];
    for (const x of probes) for (const y of [ref, sin]) {
      expect(comparisonPrompt(x.c, x.s, y.c, y.s)).toBe('');
      expect(comparisonPrompt(y.c, y.s, x.c, x.s)).toBe('');
    }
  });
  it('normal artificialmente ancho, sin complejos y derivaciones planas devuelven cadena vacía sin mutar', () => {
    const ref = prepared('rbbb'), sin = prepared('sinus'), before = structuredClone({ ref, sin });
    const wide = { ...load('sinus'), qrs: 200, naturalQrs: false }, ws = synthesize(wide, 10);
    const empty: Signal = { ...sin.s, events: { ...sin.s.events, beats: [] } };
    const flat = flattened(sin.s), flatRef = flattened(ref.s);
    const probes: Array<[ECGCase, Signal]> = [[wide, ws], [sin.c, empty], [sin.c, flat]];
    for (const [c, s] of probes) {
      expect(comparisonPrompt(c, s, ref.c, ref.s)).toBe('');
      expect(comparisonPrompt(ref.c, ref.s, c, s)).toBe('');
      expect(comparisonPrompt(c, s, sin.c, sin.s)).toBe('');
    }
    expect(comparisonPrompt(ref.c, flatRef, sin.c, sin.s)).toBe('');
    expect(comparisonPrompt(sin.c, sin.s, ref.c, flatRef)).toBe('');
    expect({ ref, sin }).toEqual(before);
  });
});
