import { presetById } from "../presets/catalog";
import { btn, esc } from "./helpers";
import type { PracticeState } from "./practice-session";

interface PracticeFeedbackView {
  observations: readonly string[];
  limitations: readonly string[];
  leads: string;
  cue: string;
}

export function practicePanelHtml(
  q: PracticeState,
  canExport: boolean,
  feedback: PracticeFeedbackView | null,
) {
  return `<div class="quiz-top"><strong>${q.answer ? (q.answer === q.preset.id ? "Coincide con el caso configurado" : "Compara los rasgos del ejercicio") : "¿Qué patrón representa este ejercicio?"}</strong><button data-action="end-quiz">Salir de práctica</button></div><div class="quiz-choices">${q.choices.map((p) => `<button data-answer="${p.id}" ${q.answer || !canExport ? "disabled" : ""} class="${q.answer && p.id === q.preset.id ? "correct" : q.answer === p.id ? "incorrect" : ""}">${esc(p.name)}</button>`).join("")}</div>${feedback ? `<div class="practice-feedback" role="status"><section><h3>Observaciones y estimaciones</h3><ul>${feedback.observations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section><section><h3>Referencia del ejercicio</h3><p><strong>${esc(q.preset.name)}</strong> · Etiqueta configurada, no diagnóstico automático.</p><p>${q.answer !== q.preset.id ? `Elegiste ${esc(presetById(q.answer!)?.name || "otra alternativa")}. ` : ""}Revisa ${esc(feedback.leads)}. ${esc(feedback.cue)}</p></section></div><div class="practice-limits">${feedback.limitations.map(x=>`<p>${esc(x)}</p>`).join("")}<p>Modelo aproximado. La puntuación compara tu opción con el ejercicio, no mide precisión clínica.</p></div>${btn("quiz", "Siguiente caso", "chevron", "primary")}` : `<p>Responde después de observar el ECG. Las referencias se muestran al contestar.</p>`}`;
}
