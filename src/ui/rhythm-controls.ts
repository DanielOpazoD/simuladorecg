import { isVviDemand } from "../engine/vvi-demand";
import type { ECGCase } from '../engine/types';

/** Control applicability follows the implemented event scheduler, not a claim
 * that these physiological combinations are impossible in a real patient.
 */
export function rhythmControlState(c: ECGCase) {
  const sinus = c.rhythm === 'sinus';
  const atrialIndependent = c.rhythm === 'flutter' || c.rhythm === 'vt' || (sinus && c.av === 'complete');
  const noOrganizedBeats = c.rhythm === 'vf' || c.rhythm === 'asystole';
  const pPresent = sinus || c.rhythm === 'junctional' || c.rhythm === 'vt'
    || (c.rhythm === 'paced' && c.pacing !== 'VVI');
  const sourceDriven = ['vt', 'torsades', 'idioventricular'].includes(c.rhythm)
    || (c.rhythm === 'paced' && c.pacing !== 'AAI')
    || (sinus && c.av === 'complete' && c.escape === 'ventricular');
  return {
    escapeDisabled: !(sinus && c.av === 'complete'),
    conductionDisabled: noOrganizedBeats || sourceDriven,
    qrsAxisDisabled: noOrganizedBeats || sourceDriven,
    noOrganizedBeats,
    pAmplitudeDisabled: !pPresent,
    pAxisDisabled: !pPresent || c.rhythm === 'junctional',
    baseRateDisabled: c.rhythm === 'flutter' || noOrganizedBeats,
    baseRateLabel: sinus && c.av === 'complete' ? 'Frecuencia de escape'
      : sinus && !['normal','first'].includes(c.av) ? 'Frecuencia auricular'
      : isVviDemand(c) ? 'Frecuencia mínima VVI' : c.rhythm === 'paced' ? 'Frecuencia de estimulación' : 'Frecuencia base',
    atrialRateDisabled: !atrialIndependent,
    variabilityDisabled: !sinus || c.av === 'complete',
    couplingDisabled: !sinus || c.av !== 'normal' || c.ectopy === 'none',
    prDisabled: !(sinus && c.av !== 'complete') && !(c.rhythm === 'paced' && c.pacing !== 'VVI'),
  };
}
