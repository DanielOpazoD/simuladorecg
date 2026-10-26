import { describe, expect, it } from "vitest";
import { synthesize, type SynthesisOptions } from "../src/engine/signal";
import { assignRepolarization } from "../src/engine/repolarization";
import { learnedEctopicModel, realisticModelFor } from "../src/engine/realistic/scope";
import { qtModelLimits } from "../src/ui/qt-model-limits";
import { fromPreset, patchCase, presetById } from "../src/presets/catalog";
import { LEADS, type Beat, type ECGCase, type Signal } from "../src/engine/types";
import { assertExactSamples } from "./support/exact-samples";

// This is an intervention audit of the generator, not an independent clinical
// delineator. Event metadata places windows; the assertions inspect the samples.
// Ideal acquisition isolates the mechanism; production-noise/filter contracts
// have their own tests. The kernel seam is named explicitly, never a fallback.
const modes: [string, SynthesisOptions][] = [["learned", {}], ["kernels", { learnedBase: false }]];
const seeds = [13, 53, 12066];

function patient(id: string, patch: Partial<ECGCase> = {}) {
  return patchCase(fromPreset(presetById(id)!), {
    acquisition: "ideal", filter: "off", variability: 0,
    hr: 60, atrialRate: 80, seed: 53, ...patch,
  });
}

function difference(a: Signal, b: Signal, start = 0, end = a.duration) {
  let peak = 0;
  for (const lead of LEADS)
    for (let i = Math.ceil(start * a.fs); i < Math.floor(end * a.fs); i++)
      peak = Math.max(peak, Math.abs(a.leads[lead][i] - b.leads[lead][i]));
  return peak;
}

function componentDifference(a: Signal, a0: Signal, b: Signal, b0: Signal, start: number, end: number) {
  let error = 0, peak = 0;
  for (const lead of LEADS)
    for (let i = Math.ceil(start * a.fs); i < Math.floor(end * a.fs); i++) {
      const x = a.leads[lead][i] - a0.leads[lead][i];
      const y = b.leads[lead][i] - b0.leads[lead][i];
      error = Math.max(error, Math.abs(x - y));
      peak = Math.max(peak, Math.abs(x));
    }
  return { error, peak };
}

for (const [mode, options] of modes) describe(`Interventions on the same ${mode} patient`, () => {
  function record(c: ECGCase) {
    if (options.learnedBase !== false) {
      expect(realisticModelFor(c), "the learned arm must not silently use kernels").toBe("NORM");
      if (c.av === "complete" && c.escape === "ventricular")
        expect(learnedEctopicModel(c, "ventricular")).toBe("PVC");
    }
    return synthesize(c, 10, options);
  }

  it.each(seeds)("PR changes the AV link, preserving atrial timing and the sampled early P (seed %s)", seed => {
    // A slow isolated cycle keeps the preceding post-T/Ta tail out of P. At a
    // shorter cycle that tail can legitimately move when the preceding PR moves.
    const c = patient("sinus", { seed, hr: 40, pr: 240, qrs: 100, qtc: 460 });
    const later = { ...c, pr: 320 };
    const a = record(c), b = record(later);
    const a0 = record({ ...c, pAmp: 0 }), b0 = record({ ...later, pAmp: 0 });
    const atria = a.events.atria.filter(p => p.time > 1 && p.time < 8);
    expect(atria.length).toBeGreaterThan(3);
    for (const p of atria) {
      expect(b.events.atria.some(q => q.time === p.time && q.conducted)).toBe(true);
      const before = a.events.beats.find(q => Math.abs(q.time - p.time - 0.240) < 1e-9)!;
      const after = b.events.beats.find(q => Math.abs(q.time - p.time - 0.320) < 1e-9)!;
      expect(before).toBeDefined(); expect(after).toBeDefined();
      expect(after.time - before.time).toBeCloseTo(0.080, 10);
      expect(after.qrs).toBe(before.qrs);
      expect(after.qt).toBeCloseTo(before.qt!, 10);
      // Stay before the PQ handover, whose duration legitimately changes. The
      // differential removes any overlapping ventricular wave or Ta component.
      const sample = componentDifference(a, a0, b, b0, p.time - 0.020, p.time + 0.040);
      expect(sample.peak).toBeGreaterThan(0.005);
      expect(sample.error).toBeLessThan(1e-10);
    }
    expect(difference(a, b)).toBeGreaterThan(0.1);
  });

  it("a blocked Wenckebach P remains in the trace without acquiring a QRS", () => {
    const c = patient("wenckebach", { hr: 75, pr: 160, qrs: 90, qtc: 410 });
    const s = record(c), noP = record({ ...c, pAmp: 0 });
    const blocked = s.events.atria.filter(p => !p.conducted && p.time > 1 && p.time < 8);
    expect(blocked.length).toBeGreaterThanOrEqual(2);
    for (const p of blocked) {
      expect(p.pr).toBeUndefined();
      // The next atrial activation is 800 ms later. No ventricular activation
      // may be invented in this blocked P's conduction window.
      expect(s.events.beats.filter(b => b.time >= p.time && b.time < p.time + 0.400)).toHaveLength(0);
      expect(difference(s, noP, p.time, p.time + 0.120)).toBeGreaterThan(0.02);
    }
    // Removing the waveform must not alter the hidden conduction schedule.
    expect(noP.events).toEqual(s.events);
  });

  it.each(["complete", "complete_v"])("%s keeps the entire isolated ventricular trace independent of atrial rate", id => {
    const c = patient(id, { hr: 40, atrialRate: 60, pAmp: 0 });
    const a = record(c), b = record({ ...c, atrialRate: 100 });
    expect(b.events.beats).toEqual(a.events.beats);
    expect(b.events.atria.length).toBeGreaterThan(a.events.atria.length);
    expect(b.events.atria.every(p => !p.conducted && p.pr === undefined)).toBe(true);
    for (const lead of LEADS) assertExactSamples(b.leads[lead], a.leads[lead], `${id}/${mode}/${lead}`);
    // Negative control: the independent atrial clock must become visible when
    // the P component is restored, even though the ventricular events stay put.
    const withP = record({ ...c, pAmp: 0.15 });
    const fasterP = record({ ...c, pAmp: 0.15, atrialRate: 100 });
    expect(fasterP.events.beats).toEqual(withP.events.beats);
    expect(difference(withP, fasterP)).toBeGreaterThan(0.03);
  });

  it("QTc moves repolarization in the samples while preserving activation timing and early QRS", () => {
    const c = patient("sinus", { hr: 60, pAmp: 0, qrs: 120, qtc: 400 });
    const a = record(c), b = record({ ...c, qtc: 520 });
    const beats = a.events.beats.filter(q => q.time > 1 && q.time < 8);
    expect(beats.length).toBeGreaterThan(5);
    for (const before of beats) {
      const after = b.events.beats.find(q => q.time === before.time)!;
      expect(after).toBeDefined();
      expect(after.qrs).toBe(before.qrs);
      expect(after.pr).toBe(before.pr);
      expect(after.adaptedRR).toBe(before.adaptedRR);
      expect(after.qt! - before.qt!).toBeCloseTo(0.120, 10);
      // The antialias FIR extends ±40 ms: avoid the legitimate QRS/ST handover.
      expect(difference(a, b, before.time + 0.010, before.time + before.qrs! - 0.050)).toBeLessThan(1e-10);
      expect(difference(a, b, before.time + 0.250, before.time + 0.550)).toBeGreaterThan(0.02);
    }
  });
});

describe("History and explicit limits of the existing QT model", () => {
  function history(rr: number, count: number): Beat[] {
    return Array.from({ length: count }, (_, i) => ({ time: (i + 1) * rr, rr, kind: "normal" }));
  }

  it("equal current RR retains different QT after different histories and converges under a shared subsequent clock", () => {
    const c = patient("sinus", { hr: 60, qrs: 90, qtc: 410 });
    const slower = history(1.2, 101), faster = history(0.6, 202);
    // Both histories reach 121.2 s, then receive exactly the same 1 s intervals.
    expect(slower.at(-1)!.time).toBeCloseTo(faster.at(-1)!.time, 10);
    for (let i = 1; i <= 240; i++) {
      const beat: Beat = { time: 121.2 + i, rr: 1, kind: "normal" };
      slower.push({ ...beat }); faster.push({ ...beat });
    }
    assignRepolarization(c, slower); assignRepolarization(c, faster);
    const firstSlow = slower[101], firstFast = faster[202];
    expect(firstSlow.rr).toBe(firstFast.rr);
    expect(firstSlow.qt! - firstFast.qt!).toBeGreaterThan(0.050);
    expect(firstSlow.adaptedRR!).toBeGreaterThan(1);
    expect(firstFast.adaptedRR!).toBeLessThan(1);
    expect(Math.abs(slower.at(-1)!.qt! - faster.at(-1)!.qt!)).toBeLessThan(0.001);
    expect(Math.abs(firstSlow.qt! - slower[100].qt!)).toBeLessThan(0.002);
    expect(Math.abs(firstFast.qt! - faster[201].qt!)).toBeLessThan(0.002);
  });

  it("does not report a learned ectopic beat's own duration as QTc clipping", () => {
    const c = patient("vvi", { qtc: 650 });
    expect(realisticModelFor(c)).toBe("NORM");
    expect(learnedEctopicModel(c, "paced")).toBe("VPACE");
    const s = synthesize(c, 10);
    expect(s.events.beats.length).toBeGreaterThan(0);
    expect(s.events.beats.every(b => b.ownDurations)).toBe(true);
    expect(qtModelLimits(c, s)).toEqual([]);
  });
});
