import type { ECGCase, Signal } from "../engine/types";
import type { Layout } from "../render/ecg";
import { esc } from "./helpers";
import { findingBoxes, findingTarget } from "./reading-focus";

/** Separate DOM/SVG layer: neither source canvas nor PNG export is modified. */
export function readingOverlay(root: HTMLElement, signal: Signal, layout: Layout, c: ECGCase, finding: string | null, available: boolean) {
  root.hidden = !available;
  if (!available) { root.replaceChildren(); delete root.dataset.geometry; return []; }
  const geometry = JSON.stringify(layout);
  if (root.dataset.geometry !== geometry) {
    root.innerHTML = `<div class="reading-lead-labels" role="group" aria-label="Ampliar una derivación">${layout.segments.map((seg,i)=>`<button type="button" class="reading-lead-label" data-reading-segment="${i}" style="left:${seg.x * layout.pxPerMm}px;top:${(seg.y + .5) * layout.pxPerMm}px" aria-label="Ampliar ${seg.polarity < 0 ? "−" : ""}${seg.lead}, tramo ${seg.start} a ${seg.start + seg.duration} segundos" title="Ampliar ${seg.lead}"><span class="reading-lead-arrow" aria-hidden="true" style="left:${(3 + (seg.lead.length + (seg.polarity < 0 ? 1 : 0)) * 2.3) * layout.pxPerMm}px;top:${layout.pxPerMm}px;font-size:${2.5 * layout.pxPerMm}px">↗</span></button>`).join("")}</div><div class="reading-focus-overlay"></div>`;
    root.dataset.geometry = geometry;
  }
  root.style.width = `${layout.widthMm * layout.pxPerMm}px`; root.style.height = `${layout.heightMm * layout.pxPerMm}px`;
  const target = finding && findingTarget(finding), boxes = target ? findingBoxes(signal, layout, c, target) : [];
  const layer = root.querySelector<HTMLElement>(".reading-focus-overlay")!;
  layer.innerHTML = !boxes.length ? "" : `<svg class="reading-focus-svg" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}" aria-hidden="true"><defs><mask id="reading-focus-mask"><rect width="100%" height="100%" fill="white"/>${boxes.map(b=>`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="black"/>`).join("")}</mask></defs><rect width="100%" height="100%" class="reading-dim" mask="url(#reading-focus-mask)"/>${boxes.map(b=>`<rect class="reading-focus-box" data-lead="${b.lead}" data-segment="${b.segment}" data-start="${b.start}" data-end="${b.end}" data-low="${b.low}" data-high="${b.high}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"><title>${esc(finding!)} · ${b.lead}</title></rect>`).join("")}</svg>`;
  return boxes;
}
