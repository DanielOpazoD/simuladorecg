import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { renderPaper } from "../src/render/ecg";
import { keepsPractice } from "../src/ui/case-state";

/** Canvas stub with a real save/restore stack that records the pen of every stroke. */
function recordingCanvas() {
  const noop = () => {};
  const state: Record<string, unknown> = { lineWidth: 1, strokeStyle: "#000" }, stack: Record<string, unknown>[] = [], strokes: number[] = [];
  const ctx = new Proxy({}, {
    get: (_o, k) => k === "save" ? () => stack.push({ ...state })
      : k === "restore" ? () => Object.assign(state, stack.pop())
      : k === "stroke" ? () => strokes.push(state.lineWidth as number)
      : k in state ? state[k as string] : noop,
    set: (_o, k, v) => { state[k as string] = v; return true; },
  });
  return { canvas: { width: 0, height: 0, style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement, strokes };
}

describe("lente ST sobre una hoja ajustada a la altura", () => {
  it("no cambia el grosor del trazo", () => {
    const c = cloneCase(DEFAULT_CASE); c.view.fit = true;
    const s = synthesize(c, 10), plain = recordingCanvas(), lens = recordingCanvas();
    renderPaper(plain.canvas, s, c, 1400, { ratio: 1, maxHeight: 420 });
    renderPaper(lens.canvas, s, c, 1400, { ratio: 1, maxHeight: 420, stLens: true });
    const trace = Math.max(...plain.strokes);
    expect(trace).toBeGreaterThan(0.29);
    // Every trace stroke keeps the compensated pen; the overlay's own strokes are extra.
    expect(lens.strokes.filter((w) => w === trace).length).toBe(plain.strokes.filter((w) => w === trace).length);
  });
});

describe("práctica sin responder", () => {
  it("sobrevive a la vista y al filtro de adquisición, no a la fisiología", () => {
    for (const key of ["view.gain", "view.speed", "view.format", "filter"]) expect(keepsPractice(key), key).toBe(true);
    for (const key of ["hr", "rhythm", "axis", "ischemia", "seed", "artifacts.reversed"]) expect(keepsPractice(key), key).toBe(false);
  });
});
