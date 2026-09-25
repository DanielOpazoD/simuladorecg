import type { Beat, ECGCase } from './types';

export const T_REFERENCE_AMPLITUDE = 0.28;
type SourceLead = 'I' | 'II' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';
type Territory = 'inferior_rca' | 'inferior_lcx' | 'anterior' | 'lateral';
/** Reduced lead-space profiles, not anatomical forward fields or fitted patient data.
 * Only I/II are specified for limbs; III/aV* are derived AFTER all processing.
 * Signs/relative locality encode the intended representative patterns, not artery diagnosis.
 * See docs/regional-repolarization-v1.4.md for assumptions and validation status.
 */
const PROFILES: Record<Territory, Readonly<Record<SourceLead, number>>> = {
  inferior_rca: { I: -.30, II: .75, V1: -.05, V2: -.10, V3: -.05, V4: .05, V5: .08, V6: .12 },
  inferior_lcx: { I: .15, II: .80, V1: -.12, V2: -.15, V3: -.08, V4: .15, V5: .35, V6: .30 },
  anterior: { I: .12, II: -.10, V1: .35, V2: .90, V3: 1, V4: .80, V5: .35, V6: .15 },
  lateral: { I: .75, II: .05, V1: -.05, V2: .02, V3: .08, V4: .30, V5: .90, V6: .75 },
};
export function regionalTerritory(c: ECGCase, b: Beat): Territory | null {
  // Do not silently extend this narrow calibration to wide/secondary or mixed causes.
  return b.kind === 'normal' && c.conduction === 'normal' &&
    c.overload === 'none' && c.electrolyte === 'none' && Object.hasOwn(PROFILES, c.ischemia)
    ? c.ischemia as Territory : null;
}
/** Smooth, symmetric, broad lobe inside the EXISTING support: preserves QT and scope.
 * sin^1.4 has zero value and zero derivative at both ends (no artificial sharp joins).
 * This broadens FWHM, not the programmed T support or cellular AP duration.
 */
function regionalWave(u: number): number {
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 1.4;
}
export function regionalTCorrection(
  c: ECGCase, b: Beat, lead: SourceLead, u: number, basalMv: number, basalWave: number,
): number {
  const territory = regionalTerritory(c, b);
  if (u <= 0 || u >= 1 || !territory || c.tAmp === 0 || c.st <= 0 || (c.phase !== 'hyperacute' && c.phase !== 'evolving')) return 0;
  const w = PROFILES[territory][lead], blend = Math.min(1, c.st / 2), scale = c.tAmp / T_REFERENCE_AMPLITUDE;
  if (c.phase === 'hyperacute') return blend * .55 * scale * w * regionalWave(u);
  // Replace a graded fraction of basal T locally; do not invert the entire baseline.
  return blend * (-.70 * scale * w * regionalWave(u) - Math.min(1, Math.abs(w)) * basalMv * basalWave);
}
