import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { modelIntervals } from '../src/ui/model-intervals';
import { conductionObservation, terminalQrs, TERMINAL_QRS } from '../src/ui/terminal-qrs';
import type { Lead, Signal } from '../src/engine/types';

const load = (id: string) => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal' as const, filter: 'off' as const });
const LEADS: Lead[] = ['V1', 'I', 'V6'];
const withLeads = (s: Signal, f: (a: Float64Array, lead: Lead) => Float64Array): Signal => {
  const leads = { ...s.leads };
  for (const lead of Object.keys(leads) as Lead[]) leads[lead] = f(leads[lead], lead) as Signal['leads'][Lead];
  return { ...s, leads };
};

describe('polaridad terminal del QRS (lectura ilustrativa)', () => {
  it.each(['sinus', 'rbbb', 'lbbb'])('%s: lee >=2 latidos dominantes, es coherente con su media y no muta caso ni señal', id => {
    const c = load(id), s = synthesize(c, 10), before = structuredClone({ c, s });
    const rows = terminalQrs(s), o = conductionObservation(c, s);
    expect({ c, s }).toEqual(before);
    expect(rows.map(r => r.lead)).toEqual(LEADS);
    for (const r of rows) {
      expect(r.beats).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(r.meanMv)).toBe(true);
      const m = r.meanMv!, th = TERMINAL_QRS.thresholdMv;
      if (r.polarity === 'positive') expect(m).toBeGreaterThanOrEqual(th);
      else if (r.polarity === 'negative') expect(m).toBeLessThanOrEqual(-th);
      else expect(r.polarity).toBe('flat');
    }
    expect(o).toEqual({ v1: rows[0].polarity, i: rows[1].polarity, v6: rows[2].polarity, narrow: modelIntervals(c, s).qrs! < 120 });
  });
  it('contraste con la caracterización previa: sinusal V1 negativo, BRD V1 positivo; BRI puede ser flat y sigue disponible', () => {
    const v1 = (id: string) => terminalQrs(synthesize(load(id), 10))[0].polarity;
    expect(v1('sinus')).toBe('negative'); expect(v1('rbbb')).toBe('positive'); expect(v1('lbbb')).not.toBe('unavailable');
  });
  it('narrow sale de los intervalos del modelo, nunca de c.qrs objetivo', () => {
    const c = { ...load('sinus'), qrs: 200, naturalQrs: false }, s = synthesize(c, 10);
    expect(conductionObservation(c, s)?.narrow).toBe(false);
    expect(conductionObservation({ ...c, qrs: 80 }, s)?.narrow).toBe(false);
  });
  it('aplanar copias de las derivaciones usadas elimina la polaridad; invertir las amplitudes cambia el signo', () => {
    const c = load('rbbb'), s = synthesize(c, 10), base = terminalQrs(s);
    expect(base.some(r => r.polarity !== 'flat')).toBe(true);
    const flat = terminalQrs(withLeads(s, (a, l) => LEADS.includes(l) ? new Float64Array(a.length) : a));
    expect(flat.map(r => r.polarity)).toEqual(['flat', 'flat', 'flat']);
    expect(flat.map(r => r.meanMv)).toEqual([0, 0, 0]);
    const inv = terminalQrs(withLeads(s, a => Float64Array.from(a, v => -v)));
    const swap = { positive: 'negative', negative: 'positive', flat: 'flat', unavailable: 'unavailable' } as const;
    inv.forEach((r, n) => { expect(r.polarity).toBe(swap[base[n].polarity]); expect(r.meanMv).toBeCloseTo(-base[n].meanMv!, 12); });
    expect(terminalQrs(s)).toEqual(base);
    const reversed = { ...c, artifacts: { ...c.artifacts, reversed: true } };
    expect(conductionObservation(reversed, synthesize(reversed, 10))).toBeNull();
  });
  it('no inventa lectura: PR/ventana no finitos, registro corto, sin eventos, QRS solapados, fs inválido', () => {
    const c = load('sinus'), s = synthesize(c, 10), fs = s.fs, beats = s.events.beats;
    const nanPr = withLeads(s, (a, l) => { if (l !== 'V1') return a; const b = Float64Array.from(a); for (const x of beats) b[Math.round((x.time + TERMINAL_QRS.prFromS) * fs)] = NaN; return b; });
    const r = terminalQrs(nanPr);
    expect(r[0]).toEqual({ lead: 'V1', polarity: 'unavailable', meanMv: null, beats: 0 });
    expect(r.slice(1)).toEqual(terminalQrs(s).slice(1));
    expect(conductionObservation(c, nanPr)).toBeNull();
    const infWindow = withLeads(s, (a, l) => { if (l !== 'I') return a; const b = Float64Array.from(a); for (const x of beats) b[Math.round((x.time + x.qrs!) * fs)] = Infinity; return b; });
    expect(terminalQrs(infWindow)[1]).toMatchObject({ polarity: 'unavailable', meanMv: null });
    // Cutting one sample before the second J leaves at most one readable beat: unavailable, never flat.
    const short = withLeads(s, a => a.slice(0, Math.round((beats[1].time + beats[1].qrs!) * fs) - 1));
    for (const x of terminalQrs(short)) expect(x).toMatchObject({ polarity: 'unavailable', meanMv: null });
    const empty: Signal = { ...s, events: { ...s.events, beats: [] } };
    expect(terminalQrs(empty).every(x => x.polarity === 'unavailable' && x.meanMv === null)).toBe(true);
    expect(conductionObservation(c, empty)).toBeNull();
    const overlapped: Signal = { ...s, events: { ...s.events, beats: [...beats, ...beats.map(b => ({ ...b, time: b.time + 0.02 }))] } };
    expect(terminalQrs(overlapped).every(x => x.polarity === 'unavailable')).toBe(true);
    expect(terminalQrs({ ...s, fs: NaN }).every(x => x.polarity === 'unavailable')).toBe(true);
    expect(terminalQrs({ ...s, leads: {} as Signal['leads'] }).every(x => x.polarity === 'unavailable')).toBe(true);
  });
  it('ritmos, fuentes y espículas ajenos al dominio devuelven null aunque la lectura cruda exista', () => {
    for (const id of ['af', 'pvc', 'vvi', 'anterior', 'wpw', 'wenckebach']) {
      const c = load(id), s = synthesize(c, 10);
      expect(conductionObservation(c, s)).toBeNull();
      if (id === 'anterior') expect(terminalQrs(s)[0].polarity).not.toBe('unavailable');
    }
    const c = { ...load('vvi'), pacingBehavior: 'demand-no-capture' as const };
    expect(conductionObservation(c, synthesize(c, 10))).toBeNull();
  });
  it('el modo DDD en sinusal sin espículas no excluye; una espícula observada sí excluye sin alterar la lectura cruda', () => {
    const c = { ...load('sinus'), pacing: 'DDD' as const }, s = synthesize(c, 10);
    expect(s.events.spikes?.length ?? 0).toBe(0);
    expect(s.events.beats.some(b => (b.kind as string) === 'paced')).toBe(false);
    const o = conductionObservation(c, s);
    expect(o).not.toBeNull();
    expect(o!.v1).not.toBe('unavailable');
    const spike = s.events.beats[0].time;
    const spiked: Signal = { ...s, events: { ...s.events, spikes: [...(s.events.spikes ?? []), spike] } };
    expect(conductionObservation(c, spiked)).toBeNull();
    expect(terminalQrs(spiked)).toEqual(terminalQrs(s));
    expect(conductionObservation(c, s)).toEqual(o);
  });
  it('una suma que desborda a Infinity no se lee: V1 queda unavailable y el resto intacto', () => {
    const c = load('sinus'), s = synthesize(c, 10);
    const overflow = withLeads(s, (a, l) => l === 'V1' ? Float64Array.from(a, () => Number.MAX_VALUE) : a);
    const r = terminalQrs(overflow);
    expect(r[0]).toEqual({ lead: 'V1', polarity: 'unavailable', meanMv: null, beats: 0 });
    expect(r.slice(1)).toEqual(terminalQrs(s).slice(1));
    expect(conductionObservation(c, overflow)).toBeNull();
  });
});
