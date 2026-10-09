/**
 * On-demand loading of the learned class models (F3). tests/setup preloads every
 * model; these tests drop them first, so they exercise the product path.
 */
import { describe, expect, it, vi } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { forgetClassShapeModels, hasShapeModel } from "../src/engine/realistic/shape-model";
import type { SignalResponse } from "../src/engine/protocol";

const preset = (id: string) => ({ ...fromPreset(presetById(id)!), variability: 0 });

describe("modelos de clase bajo demanda", () => {
  it("sin cargar, el motor falla de forma explícita y no cae en otra población", () => {
    forgetClassShapeModels();
    expect(hasShapeModel("CLBBB")).toBe(false);
    expect(() => synthesize(preset("lbbb"), 4)).toThrow(/CLBBB no está cargado/);
    expect(() => synthesize(preset("sinus"), 4)).not.toThrow();
  });
  it("el worker del producto carga el modelo de cada clase antes de sintetizar", async () => {
    forgetClassShapeModels();
    const messages: SignalResponse[] = [];
    const worker = { postMessage: (v: SignalResponse) => messages.push(v), onmessage: null as unknown as (e: MessageEvent) => Promise<void> };
    vi.stubGlobal("self", worker);
    try {
      await import("../src/engine/worker");
      for (const [id, code] of [["lbbb", "CLBBB"], ["irbbb", "IRBBB"], ["lafb", "LAFB"], ["lvh", "LVH"]] as const) {
        expect(hasShapeModel(code)).toBe(false);
        await worker.onmessage({ data: { id: 1, ecg: preset(id), duration: 4 } } as MessageEvent);
        const r = messages.at(-1)!;
        expect("error" in r ? r.error : null).toBeNull();
        expect(hasShapeModel(code)).toBe(true);
        if ("signal" in r) expect(r.signal.leads.V1.every(Number.isFinite)).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
