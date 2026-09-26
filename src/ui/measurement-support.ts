import type { Measurement, MetricKey } from '../engine/types';
import { esc } from './helpers';
/** Candidate provenance remains explicit even if subsequent model audit rejects a summary. */
export function measurementSupportHtml(m:Measurement):string {
  if(!m.support)return '';
  const labels:Record<MetricKey,string>={hr:'FC',pr:'PR',qrs:'QRS',qt:'QT',axis:'Eje QRS'};
  return `<details class="beat-table"><summary>Qué muestras sostienen cada medida</summary>
  <p class="control-note">Candidatos del análisis de muestras, antes de la auditoría del modelo. Las derivaciones se combinan: no son cuatro mediciones independientes. «Estable» indica coincidencia al cambiar el umbral del mismo detector, no certeza clínica. La columna Consistencia del resumen indica si la cifra final se conserva.</p>
  ${Object.entries(m.support).map(([key,s])=>`<h4>${labels[key as MetricKey]} · ${esc(s.leads.join(', '))}</h4><p class="control-note">${s.stable}/${s.total} candidatos con detección estable.</p><div class="measurement-table-wrap"><table><thead><tr><th>Candidato</th><th>Inicio</th><th>Final</th><th>Detección estable</th></tr></thead><tbody>${s.candidates.map((c,i)=>`<tr><td>${i+1}</td><td>${c.start.toFixed(3)} s</td><td>${c.end.toFixed(3)} s</td><td>${c.stableDetection?'Sí':'No'}</td></tr>`).join('')}</tbody></table></div>`).join('')}
  </details>`;
}
