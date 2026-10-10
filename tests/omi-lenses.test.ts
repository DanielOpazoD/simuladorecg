/**
 * OMI lenses (A2): the same patient's previous ECG, the lesion alone, and the J
 * point with the ST read against the PR segment (SDST red, IDST blue).
 */
import { describe, expect, it, vi } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { lesionBaseline } from "../src/engine/lesion-baseline";
import { differenceSignal, stMarks, ST_LENS } from "../src/render/st-lens";
import type { SignalResponse } from "../src/engine/protocol";

const preset = (id: string) => ({ ...fromPreset(presetById(id)!), variability: 0 });

describe("lentes OMI", () => {
  it("el ECG previo es el mismo paciente sin su lesión aguda, y no existe en la fase crónica", () => {
    const c = preset("anterior"), b = lesionBaseline(c)!;
    expect(b.ischemia).toBe("none");
    expect({ ...b, ischemia: c.ischemia }).toEqual(c);
    expect(lesionBaseline(preset("sinus"))).toBeNull();
    expect(lesionBaseline(preset("old_inferior"))).toBeNull();
    expect(lesionBaseline({ ...c, phase: "hyperacute" })).not.toBeNull();
  });

  it("marca el punto J del modelo y lee SDST en V3 e IDST en III en la oclusión de la DA", () => {
    const s = synthesize(preset("anterior"), 10);
    const v3 = stMarks(s, "V3", 1, 9), iii = stMarks(s, "III", 1, 9);
    expect(v3.length).toBeGreaterThan(5);
    for (const m of v3) {
      const b = s.events.beats[m.beat];
      expect(m.jTime).toBeCloseTo(b.time + b.qrs!, 12);
      expect(m.endTime - m.jTime).toBeCloseTo(ST_LENS.windowS, 12);
      expect(m.kind).toBe("SDST");
    }
    expect(iii.every((m) => m.kind === "IDST")).toBe(true);
    // The normal ECG of the same textbook patient has no marked ST deviation in V5.
    expect(stMarks(synthesize(preset("sinus"), 10), "V5", 1, 9).every((m) => m.kind === null)).toBe(true);
  });

  it("solo el cambio es exactamente este trazado menos el ECG previo", () => {
    // Without the recorder's high-pass (a 0.05 Hz filter spreads the ST area into the
    // baseline, as a real electrocardiograph does).
    const c = { ...preset("inferior"), filter: "off" as const }, s = synthesize(c, 10), p = synthesize(lesionBaseline(c)!, 10), d = differenceSignal(s, p);
    for (const lead of ["II", "III", "aVL", "V2"] as const)
      for (let i = 0; i < s.leads[lead].length; i += 37) expect(d.leads[lead][i]).toBe(s.leads[lead][i] - p.leads[lead][i]);
    // Before the QRS the lesion changes nothing.
    const b = s.events.beats.find((x) => x.time > 1)!;
    expect(Math.abs(d.leads.III[Math.round((b.time - 0.03) * s.fs)])).toBeLessThan(1e-6);
  });

  it("el worker devuelve el ECG previo solo cuando se pide y es idéntico al del caso basal", async () => {
    const messages: SignalResponse[] = [];
    const worker = { postMessage: (v: SignalResponse) => messages.push(v), onmessage: null as unknown as (e: MessageEvent) => Promise<void> };
    vi.stubGlobal("self", worker);
    try {
      await import("../src/engine/worker");
      const c = preset("anterior");
      await worker.onmessage({ data: { id: 1, ecg: c, duration: 4, previous: true } } as MessageEvent);
      const r = messages.at(-1)!;
      expect("previous" in r && r.previous).toBeTruthy();
      if ("previous" in r && r.previous) expect(Array.from(r.previous.leads.V3)).toEqual(Array.from(synthesize(lesionBaseline(c)!, 4).leads.V3));
      await worker.onmessage({ data: { id: 2, ecg: c, duration: 4 } } as MessageEvent);
      expect("previous" in messages.at(-1)!).toBe(false);
      await worker.onmessage({ data: { id: 3, ecg: preset("old_inferior"), duration: 4, previous: true } } as MessageEvent);
      expect("previous" in messages.at(-1)!).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
