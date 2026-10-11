import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CASE } from "../src/engine/types";
import { heightFittedPxPerMm, paperLayout, renderPaperSkeleton } from "../src/render/ecg";

describe("paper sheet fitted to the visible height", () => {
  const natural = paperLayout(structuredClone(DEFAULT_CASE), 1096);
  it("keeps the width-fitted scale when the sheet already fits", () => {
    expect(heightFittedPxPerMm(natural, 10_000)).toBe(natural.pxPerMm);
  });
  it("shrinks the scale until the whole sheet fits", () => {
    const px = heightFittedPxPerMm(natural, 450);
    expect(px).toBeLessThan(natural.pxPerMm);
    expect(natural.heightMm * px).toBeCloseTo(450, 6);
  });
  it("never goes below the readability floor of paper width", () => {
    expect(natural.widthMm * heightFittedPxPerMm(natural, 100)).toBeCloseTo(760, 6);
  });
  it("only changes the scale, never the paper geometry in mm", () => {
    const fitted = paperLayout(structuredClone(DEFAULT_CASE), 1096, heightFittedPxPerMm(natural, 450));
    expect([fitted.widthMm, fitted.heightMm, fitted.segments.length]).toEqual([natural.widthMm, natural.heightMm, natural.segments.length]);
  });
});

describe("empty paper while the signal is computed", () => {
  afterEach(() => vi.unstubAllGlobals());

  const fakeCanvas = () => {
    const ctx = {
      setTransform: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      fillText: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0,
    };
    const canvas = {
      width: 0, height: 0, style: { width: "", height: "" },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    return { canvas, ctx };
  };

  it.each(["paper", "dark"] as const)("draws only the %s grid, never a mock trace or a case name", (palette) => {
    const { canvas, ctx } = fakeCanvas();
    const c = structuredClone(DEFAULT_CASE);
    c.view.palette = palette;
    const layout = renderPaperSkeleton(canvas, c, 352);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, layout.widthMm, layout.heightMm);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(canvas.style.width).toBe(`${layout.widthMm * layout.pxPerMm}px`);
    expect(canvas.height).toBe(Math.round(layout.heightMm * layout.pxPerMm * 2));
  });

  it("reserves the previous amplitude with the same desktop height fitting", () => {
    const { canvas } = fakeCanvas();
    const c = structuredClone(DEFAULT_CASE);
    const natural = paperLayout(c, 1104, undefined, 24);
    const expected = paperLayout(c, 1104, heightFittedPxPerMm(natural, 591), 24);
    expect(renderPaperSkeleton(canvas, c, 1104, 591, 24)).toEqual(expected);
  });

  it("leaves the background without a grid when paper lines are disabled", () => {
    const { canvas, ctx } = fakeCanvas();
    const c = structuredClone(DEFAULT_CASE);
    c.view.grid = false;
    renderPaperSkeleton(canvas, c, 352);
    expect(ctx.fillRect).toHaveBeenCalledOnce();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("honors a fixed paper scale without fitting it to the viewport", () => {
    const { canvas } = fakeCanvas();
    const c = structuredClone(DEFAULT_CASE);
    c.view.fit = false;
    expect(renderPaperSkeleton(canvas, c, 352, 420).pxPerMm).toBe(c.view.pxPerMm);
  });
});
