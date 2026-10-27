import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CASE, cloneCase, LEADS, type Signal } from "../src/engine/types";
import type { Layout, Segment } from "../src/render/ecg";
import { renderPaper } from "../src/render/ecg";
import { pngWithDpi } from "../src/ui/persistence";
import { buildTeachingPng, drawTeachingNotes, projectTeachingNote } from "../src/ui/teaching-export";
import type { TeachingNote } from "../src/ui/teaching-notes";

vi.mock("../src/render/ecg", async original => ({ ...await original<typeof import("../src/render/ecg")>(), renderPaper: vi.fn() }));
vi.mock("../src/ui/persistence", async original => ({ ...await original<typeof import("../src/ui/persistence")>(), pngWithDpi: vi.fn(async (blob: Blob) => blob) }));
const note: TeachingNote = { id: "a", lead: "II", kind: "box", t0: 2.2, t1: 2.4, v0: -0.2, v1: 0.6, text: "Mi observación" };
const segment: Segment = { lead: "II", x: 16, y: 18, width: 250, height: 32, baseline: 34, start: 2, duration: 10, polarity: 1 };
const layout: Layout = { mode: "paper", widthMm: 272, heightMm: 410, pxPerMm: 300 / 25.4, segments: [segment] };
const signal = (): Signal => ({ fs: 100, duration: 12, leads: Object.fromEntries(LEADS.map(lead => [lead, new Float64Array(1200)])) as Signal["leads"], events: { beats: [], atria: [], spikes: [] }, truth: { hr: null as unknown as number, qrs: null, pr: null, qt: null, axis: null }, warnings: [] });

describe("independent millimetre-coordinate checks", () => {
  it.each([25, 50])("uses recording seconds, segment origin and speed %s mm/s", speed => {
    const p = projectTeachingNote(note, segment, { ...DEFAULT_CASE.view, speed })!;
    expect(p.x0).toBeCloseTo(16 + 0.2 * speed, 12); expect(p.x1).toBeCloseTo(16 + 0.4 * speed, 12);
  });
  it.each([5, 10, 20])("uses %s mm/mV for limb voltage, never the precordial gain", gain => {
    const p = projectTeachingNote(note, segment, { ...DEFAULT_CASE.view, gain, chestGain: 3 })!;
    expect(p.y0).toBeCloseTo(34 + 0.2 * gain, 12); expect(p.y1).toBeCloseTo(34 - 0.6 * gain, 12);
  });
  it("uses precordial gain and preserves absolute rather than baseline-referenced mV", () => {
    const p = projectTeachingNote({ ...note, lead: "V2" }, { ...segment, lead: "V2" }, { ...DEFAULT_CASE.view, gain: 20, chestGain: 5 })!;
    expect(p.y0).toBe(35); expect(p.y1).toBe(31); expect(p.height).toBe(4);
  });
  it("reflects aVR under Cabrera display without mutating source coordinates", () => {
    const original = { ...note, lead: "aVR" as const };
    const p = projectTeachingNote(original, { ...segment, lead: "aVR", polarity: -1 }, DEFAULT_CASE.view)!;
    expect(p.y0).toBe(32); expect(p.y1).toBe(40); expect(p.top).toBe(32); expect(p.height).toBe(8);
    expect(original.v0).toBe(-0.2);
  });
  it("preserves reverse arrow endpoints while normalizing only its bounding box", () => {
    const p = projectTeachingNote({ ...note, kind: "arrow", t0: 2.4, t1: 2.2 }, segment, DEFAULT_CASE.view)!;
    expect(p.x0).toBeCloseTo(26); expect(p.x1).toBeCloseTo(21); expect(p.left).toBeCloseTo(21); expect(p.width).toBeCloseTo(5);
  });
  it.each([{ lead: "V1" }, { t0: 1.9 }, { t1: 12.01 }, { v1: 2 }, { v0: Infinity }])("refuses unmatched or clipped coordinates %j", patch => {
    expect(projectTeachingNote({ ...note, ...patch } as TeachingNote, segment, DEFAULT_CASE.view)).toBeNull();
  });
});

let ctx: CanvasRenderingContext2D, canvases: Array<HTMLCanvasElement>, png: Blob;
beforeEach(() => {
  vi.clearAllMocks(); png = new Blob(["PNG"], { type: "image/png" });
  ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), rect: vi.fn(), arc: vi.fn(), fillText: vi.fn(), setTransform: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), measureText: vi.fn((text: string) => ({ width: text.length * 1.8 })) } as unknown as CanvasRenderingContext2D;
  canvases = Array.from({ length: 2 }, () => ({ width: 3213, height: 4843, style: {}, getContext: vi.fn(() => ctx), toBlob: vi.fn((cb: BlobCallback) => cb(png)) }) as unknown as HTMLCanvasElement);
  let next = 0; vi.stubGlobal("document", { createElement: () => canvases[next++] });
  vi.mocked(renderPaper).mockReturnValue(layout);
  vi.mocked(pngWithDpi).mockImplementation(async blob => blob);
});
afterEach(() => vi.unstubAllGlobals());

describe("annotated export contract", () => {
  it("keeps original note numbers when only a subset is visible on the paper", () => {
    drawTeachingNotes(ctx, layout, DEFAULT_CASE.view, [note], [7]);
    expect(ctx.fillText).toHaveBeenCalledWith("7", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).not.toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
  });
  it("draws unfilled physical contours and sends long text only to the footer", async () => {
    const c = cloneCase(DEFAULT_CASE), c0 = structuredClone(c), s = signal(), before = structuredClone(s);
    await expect(buildTeachingPng(s, c, [note])).resolves.toBe(png);
    const [_, __, copy, width, options] = vi.mocked(renderPaper).mock.calls[0];
    expect(copy.view).toMatchObject({ format: "12x1", timing: "simultaneous", palette: "paper", grid: true });
    expect(width).toBe(1000); expect(options).toMatchObject({ pxPerMm: 300 / 25.4, ratio: 1 });
    expect(ctx.rect).toHaveBeenCalledWith(expect.closeTo(21, 10), 28, expect.closeTo(5, 10), 8);
    expect(pngWithDpi).toHaveBeenCalledWith(png, 300);
    expect(vi.mocked(ctx.fillText).mock.calls.some(([text]) => text.includes("Mi observación"))).toBe(true);
    expect(c).toEqual(c0); expect(s).toEqual(before);
  });
  it("draws all four annotation kinds without a filled patch over the tracing", () => {
    const notes = ["box", "arrow", "interval", "label"].map((kind, i) => ({ ...note, kind: kind as TeachingNote["kind"], id: `n${i}` }));
    drawTeachingNotes(ctx, layout, DEFAULT_CASE.view, notes);
    expect(ctx.rect).toHaveBeenCalledTimes(1); expect(ctx.arc).toHaveBeenCalledTimes(1); expect(ctx.stroke).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).not.toHaveBeenCalled(); expect(ctx.save).toHaveBeenCalledTimes(1); expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
  it("rejects a note beyond the 10 s sheet without invoking the renderer", async () => {
    await expect(buildTeachingPng(signal(), cloneCase(DEFAULT_CASE), [{ ...note, t1: 10.1 }])).rejects.toThrow(/10 segundos/);
    expect(renderPaper).not.toHaveBeenCalled(); expect(pngWithDpi).not.toHaveBeenCalled();
  });
  it("rejects an annotation absent from the export layout instead of dropping it", async () => {
    await expect(buildTeachingPng(signal(), cloneCase(DEFAULT_CASE), [{ ...note, lead: "V6" }])).rejects.toThrow(/no cabe/);
    expect(canvases[1].toBlob).not.toHaveBeenCalled(); expect(pngWithDpi).not.toHaveBeenCalled();
  });
  it("rejects clipping and restores context state", () => {
    expect(() => drawTeachingNotes(ctx, layout, DEFAULT_CASE.view, [{ ...note, v0: 9 }])).toThrow(/no cabe/);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it("rejects a short record rather than labeling an incomplete image as 10 s", async () => {
    const s = signal(); for (const lead of LEADS) s.leads[lead] = s.leads[lead].slice(0, 500);
    await expect(buildTeachingPng(s, cloneCase(DEFAULT_CASE), [])).rejects.toThrow(/registro completo/);
  });
  it("rejects failed encoding and preserves a metadata failure", async () => {
    vi.mocked(canvases[1].toBlob).mockImplementation(cb => cb(null));
    await expect(buildTeachingPng(signal(), cloneCase(DEFAULT_CASE), [note])).rejects.toThrow(/codificar/);
    expect(pngWithDpi).not.toHaveBeenCalled();
  });
  it("propagates a metadata failure", async () => {
    vi.mocked(pngWithDpi).mockRejectedValue(new Error("bad PNG"));
    await expect(buildTeachingPng(signal(), cloneCase(DEFAULT_CASE), [note])).rejects.toThrow(/bad PNG/);
  });
});
