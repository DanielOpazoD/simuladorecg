import { describe, expect, it, vi } from "vitest";
import { synthesize } from "../src/engine/signal";
import { lesionBaseline, synthesizeLesionBaseline } from "../src/engine/lesion-baseline";
import { realisticModelFor } from "../src/engine/realistic/scope";
import { fromPreset, presetById } from "../src/presets/catalog";
import { LEADS, type Lead } from "../src/engine/types";
import { differenceSignal } from "../src/render/st-lens";
import type { SignalRequest, SignalResponse } from "../src/engine/protocol";

const preset = (id: string) => fromPreset(presetById(id)!);

describe("same patient in the lesion comparison", () => {
  it.each(["sgarbossa", "lateral", "posterior", "de_winter", "anterior", "inferior"])("%s keeps its source family", (id) => {
    const c = { ...preset(id), acquisition: "ideal" as const, filter: "off" as const };
    const basal = lesionBaseline(c)!, previous = synthesizeLesionBaseline(c, 10)!;
    const expected = synthesize(basal, 10, { learnedBase: realisticModelFor(c) !== null });
    for (const lead of LEADS) expect(previous.leads[lead]).toEqual(expected.leads[lead]);
    if (realisticModelFor(c) !== null) {
      // A zero STAFF delta removes the lesion on the original learned family.
      // Its nonzero deltas can legitimately alter QRS, not just ST/T.
      const zero = synthesize({ ...c, st: 0 }, 10);
      for (const lead of LEADS) expect(previous.leads[lead]).toEqual(zero.leads[lead]);
      return;
    }
    const current = synthesize(c, 10), d = differenceSignal(current, previous);
    const beat = current.events.beats.find((b) => b.time > 1 && b.kind === "normal")!;
    let peak = 0;
    const unchanged: readonly Lead[] = id === "posterior" ? ["I", "II", "III", "aVR", "aVL", "aVF", "V4", "V5", "V6"] : LEADS;
    for (const lead of unchanged) for (let i = Math.ceil((beat.time + 0.02) * d.fs); i < Math.floor((beat.time + 0.06) * d.fs); i++) peak = Math.max(peak, Math.abs(d.leads[lead][i]));
    // Posterior includes an explicit R correction in V1–V3. Other kernel
    // interventions start after this early activation window.
    // This is an engineering control, not a law about real ischemia.
    expect(peak).toBeLessThan(0.001);
    if (id === "posterior") {
      const at = Math.round((beat.time + 0.56 * beat.qrs!) * d.fs);
      expect(Math.abs(d.leads.V1[at])).toBeGreaterThan(0.1);
    }
  });

  it("a kernel lesion must not silently acquire a learned basal patient", () => {
    const c = { ...preset("sgarbossa"), filter: "off" as const, acquisition: "ideal" as const };
    expect(realisticModelFor(c)).toBeNull();
    expect(realisticModelFor(lesionBaseline(c)!)).toBe("CLBBB");
    const old = synthesize(lesionBaseline(c)!, 10), previous = synthesizeLesionBaseline(c, 10)!;
    expect(previous.leads.V2).not.toEqual(old.leads.V2);
    expect(synthesizeLesionBaseline(preset("sinus"), 10)).toBeNull();
    expect(synthesizeLesionBaseline(preset("old_inferior"), 10)).toBeNull();
  });

  it("AF with a kernel lesion preserves the RR calendar as well as morphology", () => {
    const c = { ...preset("af"), ischemia: "lateral" as const, filter: "off" as const, acquisition: "ideal" as const };
    const actual = synthesize(c, 10), previous = synthesizeLesionBaseline(c, 10)!;
    expect(realisticModelFor(c)).toBeNull();
    expect(realisticModelFor(lesionBaseline(c)!)).toBe("NORM");
    expect(previous.events).toEqual(actual.events);
    for (const b of actual.events.beats.filter((x) => x.time > 1)) {
      for (const lead of LEADS) {
        const at = Math.round((b.time + 0.02) * actual.fs);
        expect(previous.leads[lead][at]).toBeCloseTo(actual.leads[lead][at], 9);
      }
    }
  });

  it("the product worker returns the matched kernel baseline", async () => {
    const messages: SignalResponse[] = [];
    const worker = { postMessage: (r: SignalResponse) => messages.push(r), onmessage: null as unknown as (event: MessageEvent<SignalRequest>) => Promise<void> };
    vi.stubGlobal("self", worker);
    try {
      vi.resetModules();
      await import("../src/engine/worker");
      const c = { ...preset("sgarbossa"), acquisition: "ideal" as const };
      await worker.onmessage({ data: { id: 10, ecg: c, duration: 10, previous: true } } as MessageEvent<SignalRequest>);
      const result = messages.at(-1)!;
      expect("previous" in result && result.previous).toBeTruthy();
      if ("previous" in result && result.previous) expect(result.previous.leads.V2).toEqual(synthesizeLesionBaseline(c, 10)!.leads.V2);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects mismatched sampling, duration and missing leads instead of subtracting zeros", () => {
    const c = synthesize(preset("sinus"), 10);
    expect(() => differenceSignal(c, { ...c, fs: 250 })).toThrow(/muestreo/);
    expect(() => differenceSignal(c, { ...c, leads: { ...c.leads, II: c.leads.II.slice(1) } })).toThrow(/duración/);
    const leads = { ...c.leads }; delete (leads as Partial<Record<Lead, Float64Array>>).V2;
    expect(() => differenceSignal(c, { ...c, leads })).toThrow(/derivaciones/);
  });
});
