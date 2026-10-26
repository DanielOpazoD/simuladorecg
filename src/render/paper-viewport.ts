/** Native horizontal viewport context; all coordinates use the renderer's scale. */
import type { Layout } from "./ecg";


export function visiblePaperLeads(layout: Layout, leftPx: number, widthPx: number): string[] {
  const right = leftPx + widthPx;
  return [...new Set(layout.segments.filter((seg) =>
    (seg.x + seg.width) * layout.pxPerMm > leftPx && seg.x * layout.pxPerMm < right,
  ).map((seg) => `${seg.polarity < 0 ? "−" : ""}${seg.lead}`))];
}
