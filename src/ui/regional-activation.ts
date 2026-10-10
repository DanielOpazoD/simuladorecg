import type { ECGCase } from "../engine/types";
import { regionalActivationState, regionalActivationTimeline } from "../engine/regional-activation";
import { esc, select } from "./helpers";
import { usesRealisticBase } from "../engine/realistic/scope";

/** A view of the selected model, never an anatomical map or a measurement. */
export function regionalActivationControls(c: ECGCase): string {
  const state = regionalActivationState(c);
  // What the conducted beats actually use when no regional model applies.
  const base = usesRealisticBase(c) ? "Latido aprendido (PTB-XL)" : "Plantilla histórica";
  const label = state.active ? "Regional activo · experimental" : state.requested
    ? "Regional no aplicado" : base;
  const names = { septal: "Septal", "lv-main": "VI principal", "lv-terminal": "VI terminal", "rv-delayed": "VD tardío", "rv-septal": "VD/septo inicial", "lv-delayed": "VI lateral" };
  const timeline = state.active ? `<svg style="display:block;width:100%;height:auto" viewBox="0 0 340 124" role="img" aria-label="Soporte temporal programado de las cuatro bases de activación, en milisegundos">
    ${regionalActivationTimeline(c.qrs,state.model).map((row, i) => {
      const x = 98 + row.startMs / c.qrs * 210, width = (row.endMs - row.startMs) / c.qrs * 210;
      return `<text x="0" y="${22 + i * 26}" fill="currentColor" font-size="11">${names[row.region]}</text>
        <rect x="${x}" y="${10 + i * 26}" width="${width}" height="15" rx="3" fill="currentColor" opacity="${i === 3 ? .8 : .35}"/>
        <text x="${98 + 210 + 4}" y="${22 + i * 26}" fill="currentColor" font-size="10">${Math.round(row.endMs)}</text>`;
    }).join("")}</svg>` : "";
  const note = state.active && state.model === "regional-lbbb-v1"
    ? "Al ampliar QRS se conserva la base inicial VD/septal y se difieren las bases VI. Los soportes se solapan; no representan regiones anatómicas medidas ni predicen respuesta a resincronización."
    : state.active
    ? "Al ampliar QRS se ensancha la base del VD desde 55 ms, sin estirar el reloj septal/VI. La T secundaria se orienta por la región VD, no por un porcentaje temporal del QRS. Tiempos y áreas de ingeniería: sin calibración clínica."
    : state.available ? "Compara la base del caso (latido aprendido o plantilla que se estira en conjunto) con un reloj regional. El modo experimental actúa solo sobre latidos conducidos; las extrasístoles conservan su propia fuente."
      : `${state.reason}${state.requested ? ` La señal usa ${usesRealisticBase(c) ? "el latido aprendido (PTB-XL)" : "la plantilla histórica"}; la selección regional permanece guardada.` : ""}`;
  return `<h3>Modelo de activación QRS</h3>${select("activationModel", "Modelo de activación",
    [["template", "Sin modelo regional (base del caso)"], ["regional-rbbb-v1", "BRD regional · experimental"], ["regional-lbbb-v1", "BRI regional · experimental"]],
    c.activationModel ?? "template", !state.available && !state.requested)}
    <p class="control-note" id="regional-activation-status"><strong>${label}.</strong> ${esc(note)}</p>
    ${timeline}<p class="control-note">Incluye ST/T secundarios aproximados. No representa refractariedad ni isquemia causal.</p>`;
}
