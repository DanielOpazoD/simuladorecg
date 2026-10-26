import { describe, expect, it } from "vitest";
import { synthesize, type SynthesisOptions } from "../src/engine/signal";
import { realisticModelFor } from "../src/engine/realistic/scope";
import { LEADS, type ECGCase, type Lead, type Signal } from "../src/engine/types";
import { fromPreset, patchCase, presetById } from "../src/presets/catalog";
import { modelProvenance } from "../src/presets/model-provenance";
import { assertExactSamples } from "./support/exact-samples";

// Protocol and tolerances were written before running this matrix. Events place
// windows, never provide the expected waveform. This is not clinical validation.
const seeds = [1129, 2081];
const modes: [string, SynthesisOptions][] = [["learned", {}], ["kernels", { learnedBase: false }]];
const levels = {
  pr: [240, 242, 244, 246, 248],
  qrs: [116, 118, 120, 122, 124],
  qtc: [440, 442, 444, 446, 448],
  hr: [59, 59.5, 60, 60.5, 61],
  qrsAmp: [0.6, 0.8, 1, 1.2, 1.4],
};

function patient(seed: number, patch: Partial<ECGCase> = {}) {
  return patchCase(fromPreset(presetById("sinus")!), {
    seed, acquisition: "ideal", filter: "off", variability: 0,
    hr: 60, pr: 240, qrs: 120, qtc: 440, qrsAmp: 1,
    pAmp: 0, ...patch,
  });
}

function value(s: Signal, lead: Lead, time: number) {
  const sample = time * s.fs, lo = Math.floor(sample), fraction = sample - lo;
  return s.leads[lead][lo] * (1 - fraction) + s.leads[lead][lo + 1] * fraction;
}

function distance(a: Signal, b: Signal, start: number, end: number, shift = 0) {
  let error = 0, energy = 0, peak = 0, count = 0;
  for (const lead of LEADS) for (let i = Math.ceil(start * a.fs); i < Math.floor(end * a.fs); i++) {
    const x = a.leads[lead][i], y = value(b, lead, i / a.fs + shift);
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error(`Non-finite sample in ${lead} at ${i}`);
    const d = x - y;
    error += d * d; energy += (x * x + y * y) / 2;
    peak = Math.max(peak, Math.abs(d)); count++;
  }
  expect(count).toBeGreaterThan(0);
  return { relative: energy > 0 ? Math.sqrt(error / energy) : Infinity, peak, rms: Math.sqrt(energy / count) };
}

function interior(s: Signal) {
  return s.events.beats.filter(b => b.time > 2 && b.time < 8);
}

for (const [mode, options] of modes) describe(`Local control continuity: ${mode}`, () => {
  function record(c: ECGCase) {
    expect(realisticModelFor(c), "the selected population must remain NORM across each continuous sweep").toBe("NORM");
    return synthesize(c, 10, options);
  }

  it.each(seeds)("PR has no hidden jump between adjacent 2 ms steps (seed %s)", seed => {
    const configs = levels.pr.map(pr => patient(seed, { hr: 40, pAmp: 0.15, pr }));
    const signals = configs.map(record), isolated = configs.map(c => record({ ...c, pAmp: 0 }));
    for (let j = 1; j < signals.length; j++) {
      const a = signals[j - 1], b = signals[j];
      expect(b.events.atria).toEqual(a.events.atria.map(p => ({ ...p, pr: p.pr === undefined ? undefined : p.pr + 0.002 })));
      const beats = interior(a);
      expect(beats.length).toBeGreaterThan(3);
      for (const beat of beats) {
        const next = b.events.beats.find(q => Math.abs(q.time - beat.time - 0.002) < 1e-9)!;
        expect(next).toBeDefined();
        expect(next.qrs).toBe(beat.qrs);
        expect(next.qt).toBeCloseTo(beat.qt!, 10);
        expect(distance(a, b, beat.time, beat.time + 0.12).peak).toBeGreaterThan(1e-5);
        // Added after independent review, with its acceptance criterion recorded
        // before execution: a correct clock alone cannot rule out a shape jump.
        const aligned = distance(isolated[j - 1], isolated[j], beat.time, beat.time + 0.17, next.time - beat.time);
        expect(aligned.rms).toBeGreaterThan(0.01);
        expect(aligned.relative).toBeLessThan(0.20);
      }
      for (const p of a.events.atria.filter(p => p.time > 2 && p.time < 8)) {
        let peak = 0, residual = 0;
        for (const lead of LEADS) for (let i = Math.ceil((p.time - 0.020) * a.fs); i < Math.floor((p.time + 0.040) * a.fs); i++) {
          const x = a.leads[lead][i] - isolated[j - 1].leads[lead][i];
          const y = b.leads[lead][i] - isolated[j].leads[lead][i];
          peak = Math.max(peak, Math.abs(x)); residual = Math.max(residual, Math.abs(x - y));
        }
        expect(peak).toBeGreaterThan(0.005);
        expect(residual).toBeLessThan(1e-10);
      }
    }
  });

  it.each(seeds)("QRS width responds locally without replacing patient or clock (seed %s)", seed => {
    const signals = levels.qrs.map(qrs => record(patient(seed, { qrs })));
    for (let j = 1; j < signals.length; j++) {
      const a = signals[j - 1], b = signals[j];
      expect(b.events.atria).toEqual(a.events.atria);
      expect(b.events.beats.map(q => q.time)).toEqual(a.events.beats.map(q => q.time));
      for (const beat of interior(a)) {
        const next = b.events.beats.find(q => q.time === beat.time)!;
        expect(next.qrs! - beat.qrs!).toBeCloseTo(0.002, 10);
        expect(next.qt).toBe(beat.qt);
        const d = distance(a, b, beat.time - 0.02, beat.time + 0.17);
        expect(d.rms).toBeGreaterThan(0.01);
        expect(d.peak).toBeGreaterThan(1e-5);
        expect(d.relative).toBeLessThan(0.20);
      }
    }
  });

  it.each(seeds)("QTc is locally active while early activation is invariant (seed %s)", seed => {
    const signals = levels.qtc.map(qtc => record(patient(seed, { qtc })));
    for (let j = 1; j < signals.length; j++) {
      const a = signals[j - 1], b = signals[j];
      expect(b.events.atria).toEqual(a.events.atria);
      expect(b.events.beats.map(q => q.time)).toEqual(a.events.beats.map(q => q.time));
      for (const beat of interior(a)) {
        const next = b.events.beats.find(q => q.time === beat.time)!;
        expect(next.qrs).toBe(beat.qrs);
        expect(next.qt).toBeGreaterThan(beat.qt!);
        expect(distance(a, b, beat.time + 0.010, beat.time + beat.qrs! - 0.050).peak).toBeLessThan(1e-10);
        const d = distance(a, b, beat.time + 0.20, beat.time + 0.55);
        expect(d.rms).toBeGreaterThan(0.001);
        expect(d.peak).toBeGreaterThan(1e-5);
        expect(d.relative).toBeLessThan(0.20);
      }
    }
  });

  it.each(seeds)("rate changes time continuously while the aligned QRS keeps its patient (seed %s)", seed => {
    const signals = levels.hr.map(hr => record(patient(seed, { hr })));
    for (let j = 1; j < signals.length; j++) {
      const a = signals[j - 1], b = signals[j];
      const before = interior(a), after = interior(b);
      expect(before.length).toBeGreaterThan(3); expect(after.length).toBeGreaterThan(3);
      expect(after[1].time - after[0].time).toBeLessThan(before[1].time - before[0].time);
      expect(distance(a, b, 2, 8).peak).toBeGreaterThan(0.01);
      // Use a complex at the same interior ordinal; respiratory phase and QT
      // history may legitimately differ. No equality of the full trace is implied.
      const d = distance(a, b, before[1].time, before[1].time + 0.12, after[1].time - before[1].time);
      expect(d.rms).toBeGreaterThan(0.01);
      expect(d.relative).toBeLessThan(0.20);
    }
  });

  it.each(seeds)("QRS gain is affine across the sweep and display gain is inert (seed %s)", seed => {
    const configs = levels.qrsAmp.map(qrsAmp => patient(seed, { qrsAmp }));
    const signals = configs.map(record);
    for (const signal of signals) expect(signal.events).toEqual(signals[0].events);
    for (let j = 2; j < signals.length; j++) {
      let residual = 0, response = 0;
      for (const lead of LEADS) for (let i = signals[j].fs; i < 9 * signals[j].fs; i++) {
        const prev = signals[j - 1].leads[lead][i] - signals[j - 2].leads[lead][i];
        const next = signals[j].leads[lead][i] - signals[j - 1].leads[lead][i];
        residual = Math.max(residual, Math.abs(next - prev));
        response = Math.max(response, Math.abs(next));
      }
      expect(response).toBeGreaterThan(0.01);
      expect(residual).toBeLessThan(1e-10);
    }
    const display = record({ ...configs[2], view: { ...configs[2].view, gain: 20, speed: 50 } });
    expect(display.events).toEqual(signals[2].events);
    for (const lead of LEADS) assertExactSamples(display.leads[lead], signals[2].leads[lead], `${mode}/display/${lead}`);
  });
});

describe("Discrete source transitions are not continuous physiology", () => {
  it.each(seeds)("normal, LBBB, LVH and combined activation expose their effective route (seed %s)", seed => {
    const normal = patient(seed);
    const cases: [ECGCase, string | null][] = [
      [normal, "NORM"],
      [patchCase(normal, { conduction: "lbbb" }), "CLBBB"],
      [patchCase(normal, { overload: "lv" }), "LVH"],
      [patchCase(normal, { conduction: "lbbb", overload: "lv" }), null],
    ];
    const signals = cases.map(([c]) => synthesize(c, 10));
    const provenance = cases.map(([c, expected]) => {
      expect(realisticModelFor(c)).toBe(expected);
      const p = modelProvenance(c);
      expect(p.clinicalValidation).toBe("pending");
      expect(p.sources.includes("PTB-XL")).toBe(expected !== null);
      if (expected) expect(p.summary).toContain(`(${expected})`);
      return p.summary;
    });
    expect(new Set(provenance).size).toBe(cases.length);
    for (const [from, to] of [[0, 1], [0, 2], [1, 3]])
      expect(distance(signals[from], signals[to], 2, 8).peak).toBeGreaterThan(0.01);
  });
});
