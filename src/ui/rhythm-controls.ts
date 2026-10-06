import type { ECGCase } from '../engine/types';

/** Control applicability follows the implemented event scheduler, not a claim
 * that these physiological combinations are impossible in a real patient.
 */
export function rhythmControlState(c: ECGCase) {
  const sinus = c.rhythm === 'sinus';
  const atrialIndependent = c.rhythm === 'flutter' || c.rhythm === 'vt' || (sinus && c.av === 'complete');
  const noOrganizedBeats = c.rhythm === 'vf' || c.rhythm === 'asystole';
  return {
    baseRateDisabled: c.rhythm === 'flutter' || noOrganizedBeats,
    baseRateLabel: sinus && c.av === 'complete' ? 'Frecuencia de escape'
      : sinus && !['normal','first'].includes(c.av) ? 'Frecuencia auricular'
      : c.rhythm === 'paced' ? 'Frecuencia de estimulación' : 'Frecuencia base',
    atrialRateDisabled: !atrialIndependent,
    variabilityDisabled: !sinus || c.av === 'complete',
    couplingDisabled: !sinus || c.av !== 'normal' || c.ectopy === 'none',
    prDisabled: !(sinus && c.av !== 'complete') && !(c.rhythm === 'paced' && c.pacing !== 'VVI'),
  };
}
