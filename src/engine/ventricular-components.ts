import type {ECGCase} from './types';
import type {Kernel} from './morphology';
import {frontal,type Vec} from './leads';
import {regionalWindow} from './regional-activation';

export function gaussian(u: number, mu: number, sigma: number) {
  return Math.exp(-0.5 * ((u - mu) / sigma) ** 2);
}
export function compact(u: number) {
  if (u <= 0 || u >= 1) return 0;
  return Math.min(1, u / 0.035, (1 - u) / 0.035);
}
/** Existing QRS gain and low-voltage factor, shared by vector and local components. */
export function qrsAmplitudeScale(c: Pick<ECGCase, "qrsAmp" | "electrolyte">): number {
  return c.qrsAmp * (c.electrolyte === "lowvoltage" ? 0.38 : 1);
}
/** Illustrative delta pulse with explicit compact support; beat eligibility is owned by the caller.
 * Keep arithmetic order identical to the synthesizer; this is not an accessory-pathway model.
 */
export const WPW_DELTA_SECONDS = 0.045;
export function wpwDeltaVector(c: ECGCase, phase: number): Vec {
  if (phase <= 0 || phase >= 1) return [0, 0, 0];
  const v = frontal(c.axis, 0.25, 0.03),
    gain = qrsAmplitudeScale(c) * Math.sin(Math.PI * phase);
  return [v[0] * gain, v[1] * gain, v[2] * gain];
}
/** Shared shape evaluation; the legacy arithmetic remains bit-for-bit intact. */
export function qrsKernelValue(k: Kernel, u: number): number {
  return gaussian(u, k.mu, k.sigma) * (k.regional ? regionalWindow(u, k.regional) : compact(u));
}

// Gaussian phase-area units match the existing secondary-source normalization.
// Unlike the legacy sigma proxy, WPW uses the actual compact basis integral.
const areas = new Map<string,number>();
export function compactQrsAreaWeight(k:Kernel):number {
  if(k.regional)return k.regional.weight;
  const key=`${k.mu}:${k.sigma}`,cached=areas.get(key);if(cached!==undefined)return cached;
  const n=2000;let sum=0;
  for(let i=1;i<n;i++)sum+=qrsKernelValue(k,i/n)*(i%2?4:2);
  const area=sum/(3*n*Math.sqrt(2*Math.PI));areas.set(key,area);return area;
}
/** Integrated represented ventricular activation, including the same finite
 * delta pulse used by the renderer. No anatomical pathway or AVRT is inferred. */
export function preexcitedActivationReference(c:ECGCase,kernels:readonly Kernel[],qrsSeconds:number):Vec {
  if(!Number.isFinite(qrsSeconds)||qrsSeconds<WPW_DELTA_SECONDS)throw new Error('QRS preexcitado menor que el soporte delta representado.');
  const v:Vec=[0,0,0];
  for(const k of kernels){const area=compactQrsAreaWeight(k);for(let j=0;j<3;j++)v[j]+=k.v[j]*area;}
  const delta=wpwDeltaVector(c,.5),weight=2*WPW_DELTA_SECONDS/(Math.PI*qrsSeconds*Math.sqrt(2*Math.PI));
  for(let j=0;j<3;j++)v[j]+=delta[j]*weight;
  return v;
}
