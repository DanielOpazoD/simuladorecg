import type { ECGCase, Measurement, Signal } from '../engine/types';
import { metricCards, modelMetricCards, type MetricCard } from './metric-cards';
import { measurementDialog } from './measurement-dialog';
import { esc } from './helpers';
import { modelIntervals } from './model-intervals';

export function rateHtml(card: MetricCard) {
  return `<button class="metric main-metric" data-action="measurements" aria-label="${esc(`Frecuencia ventricular: ${card.value.replace(/<[^>]+>/g, ' ')}. ${card.note}. Abrir medidas.`)}"><span>FC</span><strong>${card.value}</strong></button>`;
}

/** Small, always-visible values; full provenance stays available on each control. */
export function basicMetricsHtml(cards: MetricCard[]) {
  return cards.map(card => `<button class="metric" data-action="measurements" title="${esc(card.reason)}" aria-label="${esc(`${card.label}: ${card.value.replace(/<[^>]+>/g, ' ')}. ${card.note}. Abrir medidas.`)}"><span>${card.key === 'hr' ? 'FC' : card.label}</span><strong>${card.value}</strong></button>`).join('');
}

export function measurementsOverview(s: Signal, m: Measurement, c: ECGCase) {
  const model = modelMetricCards(c, s), estimates = metricCards(c, m);
  const qt = modelIntervals(c,s).qt;
  model.splice(3,0,{...model[3],label:'QT',value:qt === null ? '—' : `${Math.round(qt)}<small>ms</small>`,note:'modelo'});
  const qtAvailable = c.rhythm !== 'vf' && c.rhythm !== 'asystole' && m.evidence.qt.status !== 'unavailable' && m.qt !== null && Number.isFinite(m.qt);
  estimates.splice(3,0,{...estimates[3],label:'QT',value:qtAvailable ? `${Math.round(m.qt!)}<small>ms</small>` : '—',status:qtAvailable ? m.evidence.qt.status : 'unavailable'});
  return `<div class="measurements-overview"><p class="control-note">Estimación del ECG mostrado y valores del modelo. —: no disponible.</p>
    <table class="measurements-summary"><thead><tr><th>Medida</th><th>Modelo</th><th>Estimación</th></tr></thead><tbody>${model.map((x, i) => {
      const estimate = estimates[i], note = x.value === '—' ? '' : x.note.split(' · ').filter(n => n !== 'modelo' && n !== 'Fridericia').join(' · ');
      return `<tr><th scope="row">${x.label}${x.label === 'QTc' ? '<small>Fridericia</small>' : ''}</th><td>${x.value}${note ? `<small class="measurement-note">${esc(note)}</small>` : ''}</td><td${estimate.status === 'unavailable' ? ' aria-label="No estimable"' : ''}>${estimate.value}${estimate.status === 'review' ? '<small class="measurement-note">Revisar</small>' : ''}</td></tr>`;
    }).join('')}</tbody></table>
    <details class="information-section" id="analyzer-info"><summary>Detalle de las estimaciones</summary>${measurementDialog(s, m, c)}</details></div>`;
}
