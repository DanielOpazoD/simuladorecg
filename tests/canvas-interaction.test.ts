import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { paperLayout } from "../src/render/ecg";
import { segmentIndexAt, sheetPoint } from "../src/render/caliper-geometry";
import { keepInView } from "../src/ui/helpers";
import { GAINS, SPEEDS, gainOptions, nextInCycle, speedOptions } from "../src/ui/view-scales";

describe("puntero sobre la hoja", () => {
  const layout = paperLayout(cloneCase(DEFAULT_CASE), 900);
  it("convierte coordenadas de cliente a mm de la hoja, con la escala del elemento", () => {
    const rect = { left: 10, top: 20, width: layout.widthMm * 2, height: layout.heightMm * 2 };
    expect(sheetPoint(rect, 10, 20, layout)).toEqual({ x: 0, y: 0 });
    expect(sheetPoint(rect, 10 + rect.width, 20 + rect.height, layout)).toEqual({ x: layout.widthMm, y: layout.heightMm });
  });
  it("encuentra el segmento bajo el punto, bordes incluidos, y -1 fuera", () => {
    const inside = (i: number, p: { x: number; y: number }) => {
      const s = layout.segments[i];
      return p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height;
    };
    layout.segments.forEach((s, i) => {
      for (const p of [{ x: s.x + s.width / 2, y: s.y + s.height / 2 }, { x: s.x, y: s.y }, { x: s.x + s.width, y: s.y + s.height }]) {
        // The first segment containing the point wins, as in the original hit test.
        const hit = segmentIndexAt(layout, p);
        expect(hit).toBeGreaterThanOrEqual(0);
        expect(hit).toBeLessThanOrEqual(i);
        expect(inside(hit, p)).toBe(true);
        for (let k = 0; k < hit; k++) expect(inside(k, p)).toBe(false);
      }
    });
    expect(segmentIndexAt(layout, { x: -1, y: -1 })).toBe(-1);
  });
});

describe("escalas de papel", () => {
  it("los atajos recorren las mismas opciones que los selectores", () => {
    expect(speedOptions.map(([v]) => v)).toEqual([...SPEEDS]);
    expect(gainOptions.map(([v]) => v)).toEqual([...GAINS]);
    expect(speedOptions.map(([, l]) => l)).toEqual(["12,5 mm/s", "25 mm/s", "50 mm/s"]);
    expect(gainOptions.map(([, l]) => l)).toEqual(["2,5 mm/mV", "5 mm/mV", "10 mm/mV", "20 mm/mV"]);
    expect([12.5, 25, 50].map((v) => nextInCycle(SPEEDS, v))).toEqual([25, 50, 12.5]);
    expect(nextInCycle(GAINS, 7)).toBe(2.5);
  });
});

describe("keepInView", () => {
  const wrap = (scrollLeft = 100, scrollTop = 100) => ({
    scrollLeft, scrollTop, getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 200 }),
  }) as unknown as HTMLElement;
  it("desplaza solo lo necesario para dejar el margen", () => {
    const w = wrap(); keepInView(w, 150, 100);
    expect([w.scrollLeft, w.scrollTop]).toEqual([100, 100]);
    keepInView(w, 5, 195);
    expect([w.scrollLeft, w.scrollTop]).toEqual([85, 115]);
    keepInView(w, 310, 0);
    expect([w.scrollLeft, w.scrollTop]).toEqual([115, 95]);
  });
});
