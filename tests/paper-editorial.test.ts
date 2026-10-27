import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase, type ECGCase, type Signal } from "../src/engine/types";
import { makeArrays } from "../src/engine/leads";
import { paperLayout, renderPaper } from "../src/render/ecg";
import { caliperMeasurement, caliperPosition, segmentIndexAt } from "../src/render/caliper-geometry";

type TextDraw = { text: string; x: number; y: number; maxWidth?: number; font: string };
function recorder() {
  const texts: TextDraw[] = [], fills: number[][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (o, key) => key === "fillText"
      ? (text: string, x: number, y: number, maxWidth?: number) => texts.push({text, x, y, maxWidth, font: String(o.font)})
      : key === "fillRect" ? (...coordinates: number[]) => fills.push(coordinates)
      : o[String(key)] ?? (() => {}),
    set: (o, key, value) => { o[String(key)] = value; return true; },
  });
  return { texts, fills, canvas: { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement };
}
const signal = (): Signal => ({ fs: 500, duration: 10, leads: makeArrays(5000),
  events: { beats: [], atria: [], spikes: [] }, truth: {hr: 60, pr: null, qrs: null, qt: null, axis: null}, warnings: [] });
const fontSize = (font: string) => Number(font.match(/([\d.]+)px/)![1]);
const formats: ECGCase["view"]["format"][] = ["3x4", "3x4+1", "3x4+3", "6x2", "12x1"];

describe("paper editorial bands preserve calibrated signal space", () => {
  it.each(formats)("%s preserves time windows and caliper scale across narrow gaps", format => {
    const c = cloneCase(DEFAULT_CASE); c.view.format = format;
    for (const timing of ["sequential", "simultaneous"] as const) {
      c.view.timing = timing;
      const layout = paperLayout(c, 1000, undefined, 80);
      const columns = format === "6x2" ? 2 : format === "12x1" ? 1 : 4, rows = 12 / columns;
      for (let i = 0; i < 12; i++) {
        const seg = layout.segments[i], col = Math.floor(i / rows);
        expect(seg.duration).toBe(10 / columns);
        expect(seg.start).toBe(timing === "sequential" ? col * 10 / columns : 0);
        expect(seg.baseline - 80).toBeGreaterThan(seg.y + 6); // clear label band even at the extreme
        const cal = {segment: i, x1: seg.x, x2: seg.x + 5, y1: seg.baseline, y2: seg.baseline - 10};
        expect(caliperMeasurement(cal, layout, c.view)).toEqual({ms: 200, mm: 10, mv: 1});
        expect(caliperPosition(cal, 1, layout, c.view).timeMs).toBe(seg.start * 1000);
        if (col > 0) expect(segmentIndexAt(layout, {x: seg.x - .5, y: seg.baseline})).toBe(-1);
      }
      for (const strip of layout.segments.slice(12)) expect([strip.start, strip.duration]).toEqual([0, 10]);
    }
  });
  it("the compact workspace preserves every lead and the export geometry without redundant technical captions", () => {
    const c = cloneCase(DEFAULT_CASE), s = signal(), compact = recorder(), exported = recorder();
    const a = renderPaper(compact.canvas, s, c, 1000, {ratio: 1, compactHeader: true});
    const b = renderPaper(exported.canvas, s, c, 1000, {ratio: 1});
    expect(a).toEqual(b);
    for (const lead of Object.keys(s.leads)) expect(compact.texts.some(t => t.text === lead)).toBe(true);
    const text = compact.texts.map(t => t.text).join(" ");
    expect(text).toContain("25 mm/s"); expect(text).toContain("10 mm/mV");
    expect(text).not.toMatch(/Hz|señal sintética|columnas secuenciales/);
    expect(exported.texts.map(t => t.text).join(" ")).toMatch(/Hz.*señal sintética/);
  });
  it.each(["aggressive", "monitor", "off"] as const)("compact paper still identifies the nonstandard %s acquisition", filter => {
    const c = cloneCase(DEFAULT_CASE); c.filter = filter;
    const r = recorder(); renderPaper(r.canvas, signal(), c, 1000, {ratio: 1, compactHeader: true});
    expect(r.texts.filter(t => t.y < 18).map(t => t.text).join(" ")).toContain({aggressive: "Filtro de demostración: modifica el ST", monitor: "Filtro de monitor", off: "Sin filtro diagnóstico"}[filter]);
  });
  it.each(formats)("%s retains independent mm geometry and text outside signal rows", format => {
    const c = cloneCase(DEFAULT_CASE); c.view.format = format; c.view.speed = 12.5;
    c.view.gain = 20; c.view.chestGain = 5; c.view.cabrera = true;
    c.filter = "monitor"; c.notch = 50;
    const s = signal(); s.leads.II[250] = 4;
    const before = s.leads.II.slice();
    const r = recorder(), layout = renderPaper(r.canvas, s, c, 390, {ratio: 1});
    const columns = format === "6x2" ? 2 : format === "12x1" ? 1 : 4;
    const rows = 12 / columns + (format === "3x4+1" ? 1 : format === "3x4+3" ? 3 : 0);
    expect(layout.widthMm).toBe(22 + (columns - 1) + 125);
    expect(layout.heightMm).toBe(26 + rows * 172); // ±80 mm, 6 mm label band and 6 mm signal clearance
    expect(layout.segments[0].y).toBe(18);
    expect(layout.segments[0].baseline).toBe(107);
    expect(s.leads.II).toEqual(before);
    const header = r.texts.filter(t => t.y < 18), footer = r.texts.filter(t => t.y > layout.heightMm - 8);
    expect(header).toHaveLength(3); expect(footer).toHaveLength(2);
    for (const t of [...header, ...footer]) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.maxWidth).toBeGreaterThan(0);
      expect(t.x + t.maxWidth!).toBeLessThanOrEqual(layout.widthMm);
      expect(t.y - fontSize(t.font)).toBeGreaterThanOrEqual(t.y < 18 ? 0 : layout.heightMm - 8);
      expect(t.y).toBeLessThan(t.y < 18 ? 18 : layout.heightMm);
    }
    expect(header.map(t => t.text).join(" ")).toContain("20 mm/mV / precordiales 5 mm/mV");
    expect(header.map(t => t.text).join(" ")).toContain("0,5–40 Hz · notch 50 Hz");
    expect(header.map(t => t.text).join(" ")).toContain("señal sintética");
    expect(footer.map(t => t.text).join(" ")).toContain("orden de Cabrera");
    expect(footer.map(t => t.text).join(" ")).toContain("sin validación clínica");
    expect(r.texts.some(t => t.text === "−aVR")).toBe(true);
    // Only the non-signal header/footer are cleared; no white panel can obscure a trace row.
    for (const [, y, , height] of r.fills.slice(1))
      expect(y + height <= 18 || y >= layout.heightMm - 8).toBe(true);
  });

  it("screen and export retain the same metadata, practice concealment and derived-trace disclosure", () => {
    const c = cloneCase(DEFAULT_CASE); c.name = "SECRET DIAGNOSIS";
    const s = signal(), screen = recorder(), exported = recorder();
    const options = {hideName: true, ratio: 1, traceNote: "solo el cambio: este trazado menos el ECG previo del mismo paciente"};
    renderPaper(screen.canvas, s, c, 390, options);
    renderPaper(exported.canvas, s, c, 1000, {...options, pxPerMm: 300 / 25.4});
    expect(screen.texts).toEqual(exported.texts);
    expect(screen.texts.some(t => t.text.includes("SECRET DIAGNOSIS"))).toBe(false);
    expect(screen.texts.some(t => t.text.includes("CASO DE PRÁCTICA"))).toBe(true);
    expect(screen.texts.some(t => t.text.includes(options.traceNote))).toBe(true);
  });

  it("bounds long supplied names and notes without silently dropping their content", () => {
    const c = cloneCase(DEFAULT_CASE); c.view.speed = 12.5;
    const r = recorder(), name = "Descripción extensa ".repeat(20), note = "Referencia del trazado ".repeat(20);
    const layout = renderPaper(r.canvas, signal(), c, 390, {ratio: 1, displayName: name, traceNote: note});
    const title = r.texts.find(t => t.text.startsWith("ECG LAB"))!;
    const disclosure = r.texts.find(t => t.text.startsWith("Uso educativo"))!;
    expect(title.text).toContain(name.toUpperCase()); expect(disclosure.text).toContain(note);
    expect(title.maxWidth).toBeLessThan(layout.widthMm - title.x);
    expect(disclosure.maxWidth).toBeLessThan(layout.widthMm - disclosure.x);
  });
});
