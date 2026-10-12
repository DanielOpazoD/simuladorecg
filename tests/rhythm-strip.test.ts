import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { paperLayout } from "../src/render/ecg";

describe("tira de ritmo", () => {
  for (const format of ["3x4+1", "3x4+3"] as const)
    for (const speed of [12.5, 25, 50])
      it(`${format} a ${speed} mm/s: el ancho es el de sus 10 s de trazado`, () => {
        const c = cloneCase(DEFAULT_CASE); c.view.format = format; c.view.speed = speed;
        const strips = paperLayout(c, 900).segments.filter((s) => s.duration === 10);
        expect(strips.length).toBe(format === "3x4+1" ? 1 : 3);
        for (const s of strips) expect(s.width).toBeCloseTo(s.duration * speed, 9);
      });
});
