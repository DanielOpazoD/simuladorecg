import { LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";
import type { Segment } from "../render/ecg";
import { caseReading } from "../presets/case-context";
import { esc } from "./helpers";
import { findingTarget, leadWindow, sampleExtent, type SampleWindow } from "./reading-focus";

/** Uniform ECG grid from final samples. All points are kept; no interpolation or smoothing. */
export function enlargedTrace(s: Signal, lead: Lead, w: SampleWindow, polarity: number): string {
  const speed = 50, gain = 10, width = (w.end - w.start) * speed + 8;
  const top = Math.ceil(Math.max(w.high * polarity, w.low * polarity) * 10) / 10 + .2;
  const low = Math.floor(Math.min(w.high * polarity, w.low * polarity) * 10) / 10 - .2;
  const height = Math.max(12, (top - low) * gain) + 8;
  const path: string[] = [];
  for (let i = Math.round(w.start * s.fs); i <= Math.round(w.end * s.fs); i++)
    path.push(`${path.length ? "L" : "M"}${(4 + (i / s.fs - w.start) * speed).toFixed(4)},${(4 + (top - s.leads[lead][i] * polarity) * gain).toFixed(4)}`);
  return `<svg class="lead-detail-trace" viewBox="0 0 ${width} ${height}" style="width:min(100%,${(400*width/height).toFixed(2)}px,${(40*width/height).toFixed(2)}dvh)" role="img" aria-label="ECG ampliado de ${esc(polarity < 0 ? "−" + lead : lead)}"><defs><pattern id="lead-small-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" class="lead-grid-fine"/></pattern><pattern id="lead-big-grid" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#lead-small-grid)"/><path d="M5 0H0V5" class="lead-grid-bold"/></pattern></defs><rect width="100%" height="100%" class="lead-paper"/><rect width="100%" height="100%" fill="url(#lead-big-grid)"/><path class="lead-sample-path" d="${path.join(" ")}"/></svg>`;
}

export function mountLeadExplorer(root: HTMLElement, s: Signal, c: ECGCase, seg: Segment, time?: number) {
  const initial = leadWindow(s, seg, time);
  if (!initial) { root.textContent = "No hay muestras completas y finitas en este fragmento."; return; }
  let lead = seg.lead;
  root.className = "lead-explorer";
  const title = root.closest("dialog")!.querySelector(".dialog-head h2")!;
  title.innerHTML = `<label class="lead-detail-select">Derivación <select aria-label="Derivación ampliada">${LEADS.map(l=>`<option value="${l}"${l === lead ? " selected" : ""}>${c.view.cabrera && l === 'aVR' ? '−' : ''}${l}</option>`).join("")}</select></label>`;
  root.innerHTML = `<div class="lead-detail-scroll"></div><p class="lead-detail-scale">50 mm/s · 10 mm/mV</p><p class="lead-detail-observe"></p>`;
  const update = () => {
    const w = sampleExtent(s, lead, initial.start, initial.end), polarity = c.view.cabrera && lead === "aVR" ? -1 : 1;
    root.dataset.lead = lead; root.dataset.start = String(initial.start); root.dataset.end = String(initial.end); root.dataset.polarity = String(polarity);
    const finding = !c.artifacts.reversed && polarity > 0 && caseReading(c).findings.find(f => findingTarget(f)?.leads.includes(lead));
    const hint = root.querySelector<HTMLElement>(".lead-detail-observe")!;
    hint.textContent = c.artifacts.reversed ? "Electrodos de brazos invertidos." : polarity < 0 ? "Polaridad invertida: −aVR." : finding ? finding + "." : "";
    hint.hidden = !hint.textContent;
    root.querySelector(".lead-detail-scroll")!.innerHTML = w ? enlargedTrace(s, lead, w, polarity) : "Muestras no disponibles en esta derivación.";
  };
  title.querySelector("select")!.addEventListener("change", e => { lead = (e.target as HTMLSelectElement).value as Lead; update(); });
  update();
}
