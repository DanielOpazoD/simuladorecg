import type { ECGCase, Measurement, Signal } from '../engine/types';
import { metricCards, modelMetricCards, type MetricCard } from './metric-cards';
import { measurementDialog } from './measurement-dialog';
import { esc } from './helpers';

export function rateHtml(card: MetricCard) {
  return `<button class="metric main-metric" data-action="measurements" aria-label="${esc(`Frecuencia ventricular: ${card.value.replace(/<[^>]+>/g, ' ')}. ${card.note}. Abrir medidas.`)}"><span>FC</span><strong>${card.value}</strong></button>`;
}

export function measurementsOverview(s: Signal, m: Measurement, c: ECGCase) {
  const model = modelMetricCards(c, s), estimates = metricCards(c, m);
  return `<div class="measurements-overview"><p class="control-note">Modelo: valores generados. Estimación: cálculo automático sobre las muestras.</p>
    <table class="measurements-summary"><thead><tr><th>Medida</th><th>Modelo</th><th>Estimación</th></tr></thead><tbody>${model.map((x, i) => {
      const estimate = estimates[i], note = x.note.split(' · ').filter(n => n !== 'modelo' && n !== 'Fridericia').join(' · ');
      return `<tr><th scope="row">${x.label}${x.key === 'qt' ? '<small>Fridericia</small>' : ''}</th><td>${x.value}${note ? `<small class="measurement-note">${esc(note)}</small>` : ''}</td><td>${estimate.value}${estimate.status !== 'usable' ? `<small class="measurement-note">${estimate.status === 'review' ? 'Revisar' : 'No estimable'}</small>` : ''}</td></tr>`;
    }).join('')}</tbody></table>
    <details class="information-section" id="analyzer-info"><summary>Detalle de las estimaciones</summary>${measurementDialog(s, m, c)}</details></div>`;
}
