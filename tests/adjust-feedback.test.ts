import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { changeCase } from '../src/ui/case-state';
import { modelIntervals } from '../src/ui/model-intervals';
import { acquiredModelAxis } from '../src/ui/acquired-model-axis';
import { adjustmentFeedback, adjustmentSnapshot, isAdjustmentKey, type AdjustmentSnapshot } from '../src/ui/adjust-feedback';
import type { ECGCase, Lead, Signal } from '../src/engine/types';

const load = (id: string): ECGCase => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal', filter: 'off' });
const KEYS = ['hr', 'pr', 'axis', 'qrs', 'conduction', 'qtc'] as const;
const VALUES: Record<(typeof KEYS)[number], unknown> = { hr: 130, pr: 260, axis: -30, qrs: 140, conduction: 'rbbb', qtc: 520 };
const DIRECTION: Record<Exclude<(typeof KEYS)[number], 'conduction' | 'axis'>, [RegExp, RegExp]> = {
  hr: [/lenta/, /rápida/], pr: [/acorta/, /prolonga/], qrs: [/estrecho/, /ancho/], qtc: [/disminuye/, /aumenta/],
};
const withLeads = (s: Signal, f: (a: Float64Array, lead: Lead) => Float64Array): Signal => {
  const leads = { ...s.leads };
  for (const lead of Object.keys(leads) as Lead[]) leads[lead] = f(leads[lead], lead) as Signal['leads'][Lead];
  return { ...s, leads };
};
const sane = (f: string | null) => {
  expect(typeof f).toBe('string');
  expect(f!.length).toBeLessThanOrEqual(200);
  expect(f).not.toMatch(/\d\d/);
  expect(f).not.toMatch(/medid|diagn|bloqueo|aislad|únicamente/i);
};

describe('snapshot de ajustes (solo referencias del modelo)', () => {
  it.each(['sinus', 'rbbb', 'lbbb'])('%s: snapshot congelado, campos pequeños tomados de truth/modelIntervals/eje adquirido, sin mutar', id => {
    const c = load(id), s = synthesize(c, 10), before = structuredClone({ c, s });
    const a = adjustmentSnapshot(c, s);
    expect({ c, s }).toEqual(before);
    expect(a).not.toBeNull();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.keys(a!).sort()).toEqual(['axis', 'hr', 'pr', 'qrs', 'qtc', 'seed', 'terminal']);
    const m = modelIntervals(c, s);
    expect(a!.seed).toBe(c.seed);
    expect(a!.hr).toBe(s.truth.hr);
    expect(a!.pr).toBe(m.pr);
    expect(a!.qrs).toBe(m.qrs);
    expect(a!.qtc).toBe(m.qtc);
    expect(a!.axis).toBe(acquiredModelAxis(c, s).displayed);
    for (const k of ['hr', 'pr', 'qrs', 'qtc', 'axis'] as const) expect(a![k] === null || Number.isFinite(a![k])).toBe(true);
    expect(a!.terminal).toHaveLength(3);
    for (const p of a!.terminal) expect(['positive', 'negative', 'flat']).toContain(p);
    expect(a!.terminal.some(p => p !== 'flat')).toBe(true);
    expect(adjustmentFeedback(a, a, ['hr', 'pr', 'axis', 'qrs', 'conduction', 'qtc'])).toBeNull();
  });
  it('isAdjustmentKey reconoce las seis claves y rechaza el resto', () => {
    for (const k of KEYS) expect(isAdjustmentKey(k)).toBe(true);
    for (const k of ['rhythm', 'seed', 'view.gain', '', 'HR']) expect(isAdjustmentKey(k)).toBe(false);
  });
  it('fuera de dominio (af, estimulación, lesión, brazos invertidos) o todo plano → null', () => {
    for (const id of ['af', 'vvi', 'anterior']) { const c = load(id); expect(adjustmentSnapshot(c, synthesize(c, 10))).toBeNull(); }
    const base = load('sinus'), reversed = { ...base, artifacts: { ...base.artifacts, reversed: true } };
    expect(adjustmentSnapshot(reversed, synthesize(reversed, 10))).toBeNull();
    const s = synthesize(base, 10);
    const flat = withLeads(s, (a, l) => (['V1', 'I', 'V6'] as Lead[]).includes(l) ? new Float64Array(a.length) : a);
    expect(adjustmentSnapshot(base, flat)).toBeNull();
    expect(adjustmentSnapshot(base, s)).not.toBeNull();
  });
  it('sinusal con QRS ancho: el snapshot se conserva aunque la ventana terminal quede plana; copia con V1, I y V6 planas → null', () => {
    const base = load('sinus'), wide = changeCase(base, 'qrs', 140), s = synthesize(wide, 10), frozen = structuredClone({ wide, s });
    const a = adjustmentSnapshot(wide, s);
    expect({ wide, s }).toEqual(frozen);
    expect(a).not.toBeNull();
    expect(Object.isFrozen(a)).toBe(true);
    expect(a!.seed).toBe(wide.seed);
    expect(a!.qrs).toBe(modelIntervals(wide, s).qrs);
    expect(a!.terminal).toHaveLength(3);
    for (const p of a!.terminal) expect(['positive', 'negative', 'flat']).toContain(p);
    const flat = withLeads(s, (x, l) => (['V1', 'I', 'V6'] as Lead[]).includes(l) ? new Float64Array(x.length) : x);
    expect(adjustmentSnapshot(wide, flat)).toBeNull();
  });
});

describe('feedback de ajustes', () => {
  const c = load('sinus'), s = synthesize(c, 10), a = adjustmentSnapshot(c, s)!;
  it.each(KEYS)('%s: changeCase + nueva señal produce una frase breve coherente con la referencia generada', key => {
    const next = changeCase(c, key, VALUES[key]), s2 = synthesize(next, 10), frozen = structuredClone({ c, s, next, s2 });
    const b = adjustmentSnapshot(next, s2);
    expect({ c, s, next, s2 }).toEqual(frozen);
    expect(b).not.toBeNull();
    expect(b!.seed).toBe(a.seed);
    const f = adjustmentFeedback(a, b, [key]);
    sane(f);
    if (key === 'conduction') {
      expect(b!.terminal).not.toEqual(a.terminal);
      expect(f).toMatch(/conducción de referencia/);
      expect(f).toMatch(/V1/);
      expect(f).toMatch(/ST/);
    } else if (key === 'axis') {
      expect(Math.round(a.axis!)).not.toBe(Math.round(b!.axis!));
      expect(f).toMatch(/eje de referencia/);
      expect(f).toMatch(/dirección/);
    } else {
      expect(Math.round(a[key]!)).not.toBe(Math.round(b![key]!));
      expect(f).toMatch(/de referencia/);
      expect(f).toMatch(DIRECTION[key][b![key]! > a[key]! ? 1 : 0]);
    }
  });
  it('objetivo del caso cambiado pero MISMA señal previa → mismo snapshot y sin feedback para ninguna clave', () => {
    for (const key of KEYS) {
      const next = changeCase(c, key, VALUES[key]), same = adjustmentSnapshot(next, s);
      expect(same).toEqual(a);
      expect(adjustmentFeedback(a, same, [key])).toBeNull();
      expect(adjustmentFeedback(a, same, [...KEYS])).toBeNull();
    }
  });
  it('elige la última clave solicitada con diferencia real', () => {
    const next = changeCase(changeCase(c, 'hr', 130), 'pr', 260), b = adjustmentSnapshot(next, synthesize(next, 10));
    expect(adjustmentFeedback(a, b, ['hr', 'pr'])).toMatch(/PR de referencia/);
    expect(adjustmentFeedback(a, b, ['pr', 'hr'])).toMatch(/frecuencia de referencia/);
  });
  it('conducción: varios readouts coordinados se reportan como un solo cambio, sin efecto aislado', () => {
    const next = changeCase(c, 'conduction', 'rbbb'), b = adjustmentSnapshot(next, synthesize(next, 10))!;
    const f = adjustmentFeedback(a, b, ['conduction']);
    expect(adjustmentFeedback(a, b, ['conduction', 'qrs'])).toBe(f);
    expect(adjustmentFeedback(a, b, ['qrs', 'conduction'])).toBe(f);
    expect(f).toMatch(/conducción de referencia/);
    expect(f).not.toMatch(/secundari|aislad|solo /i);
    const q = adjustmentFeedback(a, b, ['qrs']);
    sane(q);
    expect(q).toMatch(/QRS de referencia/);
    const t = [...a.terminal]; t[0] = t[0] === 'positive' ? 'negative' : 'positive';
    const onlyTerminal: AdjustmentSnapshot = { ...a, terminal: t };
    expect(adjustmentFeedback(a, onlyTerminal, ['conduction'])).toMatch(/conducción de referencia/);
    expect(adjustmentFeedback(a, onlyTerminal, ['hr', 'qrs', 'axis'])).toBeNull();
  });
  it('null sin inventar: snapshots nulos, seed distinto, keys vacíos/ajenos, readout no estimable, resolución entera, wrap del eje', () => {
    const next = changeCase(c, 'pr', 260), b = adjustmentSnapshot(next, synthesize(next, 10))!;
    expect(adjustmentFeedback(a, b, ['pr'])).not.toBeNull();
    expect(adjustmentFeedback(null, b, ['pr'])).toBeNull();
    expect(adjustmentFeedback(a, null, ['pr'])).toBeNull();
    expect(adjustmentFeedback({ ...a, seed: a.seed + 1 }, b, ['pr'])).toBeNull();
    expect(adjustmentFeedback(a, b, [])).toBeNull();
    expect(adjustmentFeedback(a, b, ['pr', 'rhythm'])).toBeNull();
    expect(adjustmentFeedback({ ...a, pr: null }, b, ['pr'])).toBeNull();
    expect(adjustmentFeedback(a, { ...b, pr: null }, ['pr'])).toBeNull();
    expect(adjustmentFeedback(a, b, ['hr'])).toBeNull();
    const base = Math.floor(a.hr!);
    expect(adjustmentFeedback({ ...a, hr: base + 0.2 }, { ...a, hr: base + 0.4 }, ['hr'])).toBeNull();
    expect(adjustmentFeedback({ ...a, axis: 180 }, { ...a, axis: -180 }, ['axis'])).toBeNull();
    expect(adjustmentFeedback({ ...a, axis: 10 }, { ...a, axis: -10 }, ['axis'])).toMatch(/dirección/);
  });
  it('NaN/Infinity en un snapshot manual → sin feedback para ningún readout, sin inventar números', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const k of ['hr', 'pr', 'qrs', 'qtc', 'axis'] as const) {
        const broken = { ...a, [k]: bad } as AdjustmentSnapshot;
        expect(adjustmentFeedback(broken, a, [k])).toBeNull();
        expect(adjustmentFeedback(a, broken, [k])).toBeNull();
        expect(adjustmentFeedback(broken, broken, [k])).toBeNull();
        expect(adjustmentFeedback(broken, a, [...KEYS])).toBeNull();
      }
    }
  });
});
