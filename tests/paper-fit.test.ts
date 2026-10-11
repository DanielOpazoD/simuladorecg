import { describe, expect, it } from "vitest";
import { DEFAULT_CASE } from "../src/engine/types";
import { heightFittedPxPerMm, paperLayout } from "../src/render/ecg";

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
