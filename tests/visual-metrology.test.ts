import { describe, expect, it } from "vitest";
import { LEADS, DEFAULT_CASE, type Signal } from "../src/engine/types";
import { stZoomMark } from "../src/ui/st-zoom";
import { paperLayout } from "../src/render/ecg";
import { visiblePaperLeads } from "../src/render/paper-viewport";

/** Deliberately different lead medians: independent selection would change beats. */
function variableST(): Signal {
  const fs = 500;
  const leads = Object.fromEntries(LEADS.map((l) => [l, new Float64Array(5 * fs)])) as Signal["leads"];
  const beats = [1, 2, 3].map((time) => ({ time, kind: "normal" as const, rr: 1, qrs: 0.08 }));
  for (const [lead, values] of [["I", [0.1, 0.2, 0.3]], ["V2", [0.5, 0.1, 0.3]]] as const)
    beats.forEach((b, i) => leads[lead].fill(values[i], Math.round((b.time + b.qrs) * fs), Math.round((b.time + b.qrs + 0.1) * fs)));
  return { fs, duration: 5, leads, events: { beats, atria: [], spikes: [] }, truth: { hr: 60, pr: null, qrs: 0.08, qt: null, axis: null }, warnings: [] };
}

describe("ST zoom retains a single event across leads", () => {
  it("uses the opening lead to choose, then reads every other lead at that event", () => {
    const s = variableST(), chosen = stZoomMark(s, "V2")!;
    expect(chosen.beat).toBe(2);
    expect(stZoomMark(s, "I")!.beat).toBe(1); // catches the old independent-median behavior
    for (const lead of LEADS) {
      const m = stZoomMark(s, lead, chosen.beat)!;
      expect(m.beat).toBe(2);
      expect(m.jTime).toBe(chosen.jTime);
    }
    expect(stZoomMark(s, "I", chosen.beat)!.j0).toBeCloseTo(0.3, 12);
    expect(chosen.j0).toBeCloseTo(0.3, 12);
  });
  it("selects an event that can be found on the first ten seconds of paper", () => {
    const s = variableST();
    s.duration = 20;
    s.leads = Object.fromEntries(LEADS.map((l) => { const a = new Float64Array(20 * s.fs); a.set(s.leads[l]); return [l, a]; })) as Signal["leads"];
    for (const time of [11, 12, 13, 14, 15]) s.events.beats.push({ time, kind: "normal", rr: 1, qrs: 0.08 });
    const chosen = stZoomMark(s, "V2")!;
    expect(s.events.beats[chosen.beat].time).toBeLessThan(10);
  });
  it("never silently substitutes another event when the retained event is unavailable", () => {
    expect(stZoomMark(variableST(), "I", 999)).toBeNull();
    const s = variableST();
    s.events.beats = [];
    expect(stZoomMark(s, "I")).toBeNull();
  });
});

describe("readable native paper viewport", () => {
  it("keeps the same calibrated geometry at mobile and desktop widths", () => {
    const c = structuredClone(DEFAULT_CASE), mobile = paperLayout(c, 352), desktop = paperLayout(c, 1100);
    expect(mobile.widthMm * mobile.pxPerMm).toBeGreaterThanOrEqual(960);
    expect(mobile.segments).toEqual(desktop.segments);
    expect(mobile.widthMm).toBe(desktop.widthMm);
    expect(mobile.heightMm).toBe(desktop.heightMm);
    // The rendered lead font is 3 mm: prevent the former ~6.6 px mobile labels.
    expect(3 * mobile.pxPerMm).toBeGreaterThan(9);
  });
  it("identifies leads at both horizontal edges, without inventing a lead for the margin", () => {
    const c = structuredClone(DEFAULT_CASE);
    c.view.format = "3x4";
    const layout = paperLayout(c, 352);
    expect(visiblePaperLeads(layout, 0, 352)).toContain("I");
    expect(visiblePaperLeads(layout, 0, 352)).not.toContain("V6");
    expect(visiblePaperLeads(layout, layout.widthMm * layout.pxPerMm - 352, 352)).toContain("V6");
    expect(visiblePaperLeads(layout, 0, 1)).toEqual([]);
  });
  it("preserves explicit fixed scales and Cabrera lead identity", () => {
    const c = structuredClone(DEFAULT_CASE);
    c.view.fit = false;
    expect(paperLayout(c, 352).pxPerMm).toBe(c.view.pxPerMm);
    const standard = paperLayout(c, 352);
    expect(visiblePaperLeads(standard, 0, standard.widthMm * standard.pxPerMm)).toContain("aVR");
    c.view.cabrera = true;
    const layout = paperLayout(c, 352);
    expect(visiblePaperLeads(layout, 0, layout.widthMm * layout.pxPerMm)).toEqual(["aVL", "I", "−aVR", "II", "aVF", "III", "V1", "V2", "V3", "V4", "V5", "V6"]);
  });
});
