/** Native horizontal viewport context; all coordinates use the renderer's scale. */
import type { Layout } from "./ecg";

/** Keep a lead and a point on its baseline in view when sample extents change. */
export interface PaperAnchor {
  lead: string; start: number; xMm: number; yMm: number;
  screenX: number; screenY: number;
}
export function capturePaperAnchor(layout: Layout, left: number, top: number, width: number, height: number): PaperAnchor | null {
  if (layout.mode !== "paper" || !layout.segments.length) return null;
  const scale = layout.pxPerMm, x = (left + width / 2) / scale, y = (top + height / 2) / scale;
  const segment = layout.segments.reduce((best, seg) => {
    const distance = (s: typeof seg) => Math.hypot(Math.max(s.x - x, 0, x - s.x - s.width), s.baseline - y);
    return distance(seg) < distance(best) ? seg : best;
  });
  return {lead:segment.lead, start:segment.start, xMm:x-segment.x, yMm:y-segment.baseline, screenX:width/2, screenY:height/2};
}
export function restorePaperAnchor(layout: Layout, anchor: PaperAnchor): {left:number; top:number} | null {
  const segment = layout.segments.find(s => s.lead === anchor.lead && s.start === anchor.start);
  if (layout.mode !== "paper" || !segment) return null;
  // The caller adds the canvas margin before the native scrollport clamps x.
  return {left:(segment.x+anchor.xMm)*layout.pxPerMm-anchor.screenX, top:Math.max(0,(segment.baseline+anchor.yMm)*layout.pxPerMm-anchor.screenY)};
}

export function visiblePaperLeads(layout: Layout, leftPx: number, widthPx: number): string[] {
  const right = leftPx + widthPx;
  return [...new Set(layout.segments.filter((seg) =>
    (seg.x + seg.width) * layout.pxPerMm > leftPx && seg.x * layout.pxPerMm < right,
  ).map((seg) => `${seg.polarity < 0 ? "−" : ""}${seg.lead}`))];
}
