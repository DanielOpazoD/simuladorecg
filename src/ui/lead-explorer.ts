import { LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";
import type { Segment } from "../render/ecg";
import { caseReading } from "../presets/case-context";
import { projectionSvg } from "./st-distribution";
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
  return `<svg class="lead-detail-trace" viewBox="0 0 ${width} ${height}" style="width:min(100%,${(400*width/height).toFixed(2)}px,${(40*width/height).toFixed(2)}dvh)" role="img" aria-label="${esc(polarity < 0 ? "−" + lead : lead)}, muestras finales de ${w.start.toFixed(3)} a ${w.end.toFixed(3)} segundos"><defs><pattern id="lead-small-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" class="lead-grid-fine"/></pattern><pattern id="lead-big-grid" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#lead-small-grid)"/><path d="M5 0H0V5" class="lead-grid-bold"/></pattern></defs><rect width="100%" height="100%" class="lead-paper"/><rect width="100%" height="100%" fill="url(#lead-big-grid)"/><path class="lead-sample-path" d="${path.join(" ")}"/></svg>`;
}

export function mountLeadExplorer(root: HTMLElement, s: Signal, c: ECGCase, seg: Segment, time?: number) {
  const initial = leadWindow(s, seg, time);
  if (!initial) { root.textContent = "No hay muestras completas y finitas en este fragmento."; return; }
  let lead = seg.lead;
  root.className = "lead-explorer";
  root.innerHTML = `<div class="lead-detail-top"><label>Derivación<select aria-label="Derivación ampliada">${LEADS.map(l=>`<option${l === lead ? " selected" : ""}>${l}</option>`).join("")}</select></label><p class="lead-detail-time"></p></div><p class="lead-detail-observe"></p><div class="lead-detail-scroll" tabindex="0" role="region" aria-label="ECG ampliado: desplazar para ver el fragmento completo"></div><p class="lead-detail-scale">50 mm/s · 10 mm/mV. Cuadro pequeño: 20 ms y 0,1 mV.</p><div class="lead-detail-orientation"></div><p class="lead-detail-limit">Orientación anatómica aproximada; no identifica una arteria ni su estado.</p>`;
  const update = () => {
    const w = sampleExtent(s, lead, initial.start, initial.end), polarity = c.view.cabrera && lead === "aVR" ? -1 : 1;
    root.dataset.lead = lead; root.dataset.start = String(initial.start); root.dataset.end = String(initial.end); root.dataset.polarity = String(polarity);
    const title = root.closest("dialog")?.querySelector(".dialog-head h2");
    if (title) title.textContent = `Explorar ${polarity < 0 ? "−" : ""}${lead}`;
    root.querySelector(".lead-detail-time")!.textContent = `${initial.start.toFixed(3)}–${initial.end.toFixed(3)} s del registro${initial.beat === null ? " · fragmento sin QRS delimitado" : ` · QRS ${initial.beat + 1} del modelo`}${polarity < 0 ? " · −aVR (Cabrera)" : ""}`;
    const finding = !c.artifacts.reversed && polarity > 0 && caseReading(c).findings.find(f => findingTarget(f)?.leads.includes(lead));
    root.querySelector(".lead-detail-observe")!.textContent = c.artifacts.reversed ? "Electrodos de brazos invertidos: se muestran las muestras adquiridas y se omite su asociación anatómica." : polarity < 0 ? "Vista −aVR: la polaridad y el eje se invierten respecto de aVR, como en el papel Cabrera." : finding ? `En este ejemplo, busca: ${finding}.` : "Observa la forma, amplitud y secuencia de las ondas en este fragmento.";
    root.querySelector(".lead-detail-scroll")!.innerHTML = w ? enlargedTrace(s, lead, w, polarity) : "Muestras no disponibles en esta derivación.";
    const diagram = root.querySelector<HTMLElement>(".lead-detail-orientation")!;
    diagram.innerHTML = c.artifacts.reversed ? "" : projectionSvg(lead, "all", polarity < 0);
    // Reuse the existing original anatomy diagram, showing only the relevant plane.
    diagram.querySelectorAll("figure").forEach((f,i)=>{ f.hidden = i !== (lead.startsWith("V") ? 1 : 0); });
    root.querySelector<HTMLElement>(".lead-detail-limit")!.hidden = c.artifacts.reversed;
  };
  root.querySelector("select")!.addEventListener("change", e => { lead = (e.target as HTMLSelectElement).value as Lead; update(); });
  update();
}
