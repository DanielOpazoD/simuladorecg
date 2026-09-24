import type { Signal, Measurement, ECGCase, MetricKey } from "../engine/types";
import { referenceForMeasurement } from "../engine/reference";
import { esc } from "./helpers";
const value = (v: number | null, u = "") =>
  v === null ? "—" : `${Math.round(v)} ${u}`;
export function measurementDialog(
  s: Signal,
  m: Measurement,
  c: ECGCase,
): string {
  const { reference } = referenceForMeasurement(s, m);
  const rows: [MetricKey, string, string][] = [
    ["hr", "FC ventricular", "lpm"],
    ["pr", "PR", "ms"],
    ["qrs", "QRS", "ms"],
    ["qt", "QT", "ms"],
    ["axis", "Eje QRS", "°"],
  ];
  return `<p class="dialog-lead">Las cifras y las marcas se obtienen de las mismas muestras, entre ${m.window.start} y ${m.window.end} segundos. La referencia usa los mismos latidos que contribuyen a cada intervalo; la FC se contrasta entre los extremos detectados. La auditoría comprueba también cada límite y retira candidatos discordantes; nunca rellena una medida con el valor del modelo.</p>
 <div class="measurement-table-wrap"><table><thead><tr><th>Variable</th><th>Señal</th><th>Referencia*</th><th>Consistencia</th></tr></thead><tbody>${rows
   .map(([key, label, unit]) => {
     const ev = m.evidence[key];
     return `<tr><td>${label}</td><td><strong>${value(m[key], unit)}</strong></td><td>${value(reference[key], unit)}</td><td><span class="evidence-badge ${ev.status}">${ev.status === "usable" ? "Reproducible" : ev.status === "review" ? "Revisar" : "No estimable"}</span><small>${ev.count}/${ev.total} ${key === "hr" ? "intervalos RR" : "latidos"}${ev.spread !== null && key !== "hr" ? ` · P90−P10 ${ev.spread.toFixed(1)} ${unit}` : ""}</small></td></tr>`;
   })
   .join("")}</tbody></table></div>
 <p class="control-note">La señal mostrada y exportada conserva las muestras originales. Los impulsos breves se neutralizan solo en una copia para el análisis. *La referencia contiene tiempos de activación y soporte del generador; no es una anotación clínica. Su eje es el solicitado antes de superponer lesión/sobrecarga. «Reproducible» describe consistencia interna, no exactitud clínica ni una probabilidad de acierto.</p>
 <div class="evidence-notes">${rows.map(([key, label]) => `<p><strong>${label}.</strong> ${esc(m.evidence[key].reason)}</p>`).join("")}</div>
 <h3>Corrección del QT</h3><div class="qt-grid">${Object.entries(m.qtc)
   .map(
     ([key, v]) =>
       `<div><span>${{ bazett: "Bazett", fridericia: "Fridericia", framingham: "Framingham", hodges: "Hodges" }[key]}</span><strong>${value(v, "ms")}</strong></div>`,
   )
   .join("")}</div>
 <p class="control-note">QT principal: retorno sostenido de amplitud o de pendiente terminal, para excluir la recuperación lenta del filtro. La tangente del latido ampliado se muestra aparte y puede acabar antes. El QTc usa RR mediano del registro; el QT del generador incorpora memoria de RR, por lo que ambos pueden diferir tras pausas o ectopia. QTc configurado: ${c.qtc} ms.</p>
 <details class="beat-table"><summary>Límites candidatos por latido (${m.beats.length})</summary><p class="control-note">Salida cruda del detector, previa a la auditoría. Consulta la columna Consistencia del resumen para saber qué medidas fueron aceptadas.</p><div class="measurement-table-wrap"><table><thead><tr><th>Latido</th><th>Inicio QRS</th><th>Final QRS</th><th>Final T</th><th>QRS</th><th>QT</th></tr></thead><tbody>${m.beats.map((b, i) => `<tr><td>${i + 1}</td><td>${b.onset.toFixed(3)} s</td><td>${b.offset.toFixed(3)} s</td><td>${b.tEnd === null ? "—" : b.tEnd.toFixed(3) + " s"}</td><td>${value(b.qrs, "ms")}</td><td>${value(b.qt, "ms")}</td></tr>`).join("")}</tbody></table></div></details>`;
}
