import {reviewAlternatingCandidates} from './analysis/alternating-confidence';
import {withholdImpulseDominatedMeasurements} from './analysis/impulse-confidence';
import { LEADS } from './lead-registry';
import { attachMeasurementSupport } from './measurement-support';
import type { Measurement, Signal } from './types';
import { measure } from './measure';
import { detectVentricularCandidates } from './analysis/ventricular-candidates';

type Samples = Pick<Signal, 'fs' | 'leads'>;

/** Detection-sensitivity screen, NOT a probability or a second independent detector.
 * Engineering constants selected on the exposed PR19 stress set. Irregular RR,
 * diagnosis, generator events and delineation success are not inputs.
 */
export const HR_QUALITY_POLICY = Object.freeze({
  candidateFraction: 0.6,
  matchSeconds: 0.04,
  backgroundRatio: 0.1,
  unmatchedFraction: 0.075,
  minimumUnmatched: 2,
});

export function heartRateDetectionQuality(input: Samples, peaksSeconds: readonly number[]) {
  const { peaks: challenged, energy } = detectVentricularCandidates(input, {
    candidateFraction: HR_QUALITY_POLICY.candidateFraction,
  });
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const upper = quantile(0.98);
  const backgroundRatio = upper > 0 ? quantile(0.5) / upper : null;
  // Ordered one-to-one matching also notices replacements with unchanged counts.
  let i = 0, j = 0, matched = 0;
  while (i < peaksSeconds.length && j < challenged.length) {
    const delta = peaksSeconds[i] - challenged[j] / input.fs;
    if (Math.abs(delta) <= HR_QUALITY_POLICY.matchSeconds) { matched++; i++; j++; }
    else if (delta < 0) i++;
    else j++;
  }
  const largest = Math.max(peaksSeconds.length, challenged.length);
  const unmatched = largest - matched;
  const unmatchedFraction = largest ? unmatched / largest : 0;
  const requiresReview = backgroundRatio !== null &&
    backgroundRatio > HR_QUALITY_POLICY.backgroundRatio &&
    unmatched >= HR_QUALITY_POLICY.minimumUnmatched &&
    unmatchedFraction >= HR_QUALITY_POLICY.unmatchedFraction;
  return { requiresReview, backgroundRatio, unmatchedFraction, unmatched, matched,
    nominalCount: peaksSeconds.length, challengedCount: challenged.length, challengedPeaksSeconds: challenged.map(p=>p/input.fs) };
}

/** Public sample-only pipeline used by the worker, BEFORE model audit.
 * The frozen measure() primitive still supplies all candidates and numeric values.
 * HR has its own screen; interval summaries receive candidate-specific support.
 * Never correct a rate, remove candidate peaks, promote a status or use truth.
 */
export function analyzeSamples(input: Samples): Measurement {
  assertSampleInput(input);
  const measurement = measure(input);
  const quality = measurement.detectedPeaks.length >= 3 ? heartRateDetectionQuality(input, measurement.detectedPeaks) : null;
  const next:Measurement = measurement.hr !== null && measurement.evidence.hr.status === 'usable' && quality?.requiresReview ?
    { ...measurement, evidence: { ...measurement.evidence,
      hr: { ...measurement.evidence.hr, status: 'review',
        reason: 'Frecuencia sensible al umbral de detección y actividad de fondo elevada: pueden existir detecciones extra u omitidas. Verifica con calibres.' } } } : measurement;
  return reviewAlternatingCandidates(input, withholdImpulseDominatedMeasurements(input, retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))));
}

/** Engineering acquisition domain shared with the external-record reader.
 * Validity of storage/time coordinates is not clinical signal quality. Never
 * repair missing channels, replace nonfinite samples or resample implicitly.
 */
export function assertSampleInput(input: Pick<Signal, 'fs' | 'leads'>): void {
  if (!Number.isSafeInteger(input.fs) || input.fs < 100 || input.fs > 1000)
    throw new RangeError('Frecuencia de muestreo admitida: entero entre 100 y 1000 Hz.');
  let length: number | undefined;
  for (const lead of LEADS) {
    const samples: unknown = input.leads?.[lead];
    if (!((samples instanceof Float64Array || samples instanceof Float32Array)))
      throw new TypeError(`Derivación ${lead}: se requiere un vector de muestras Float32Array o Float64Array.`);
    if (!samples.length) throw new RangeError(`Derivación ${lead}: no contiene muestras.`);
    if (length !== undefined && samples.length !== length)
      throw new RangeError(`Derivación ${lead}: longitud distinta; los canales deben compartir el mismo eje temporal.`);
    length = samples.length;
    for (let index = 0; index < samples.length; index++)
      if (!Number.isFinite(samples[index]))
        throw new RangeError(`Derivación ${lead}: muestra no finita en el índice ${index}.`);
  }
}

/** A constant pair I/II contains no frontal direction information. atan2(0,0)
 * returning zero is a programming convention, not a measured axis of zero degrees.
 * Exact constancy only: this is not a clinical low-voltage/noise threshold.
 */
function retireUnsupportedFrontalAxis(input: Samples, m: Measurement): Measurement {
  const n = Math.min(input.leads.I.length, Math.round(10 * input.fs));
  const flat = (lead: 'I' | 'II') => {
    const a=input.leads[lead];
    for(let i=1;i<n;i++)if(a[i]!==a[0])return false;
    return true;
  };
  if (!flat('I') || !flat('II') || (m.axis===null && m.pAxis===null && m.tAxis===null)) return m;
  return {...m, axis:null, pAxis:null, tAxis:null,
    rejected:m.axis===null?m.rejected:{...m.rejected,axis:m.axis},
    evidence:{...m.evidence,axis:{...m.evidence.axis,status:'unavailable',count:0,spread:null,
      reason:'I y II no contienen variación en la ventana analizada: no se puede estimar una dirección frontal. No equivale a un eje de 0°.'}}};
}
