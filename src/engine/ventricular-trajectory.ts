import { axisFromLeads, project, type Vec } from "./leads";
import type { Kernel } from "./morphology";

export interface SpatialQrsSummary {
  integrated: Vec;
  frontalAxis: number;
  peakSpatialMagnitude: number;
  pathLength: number;
  reversals: number;
}

const magnitude = (v: Vec) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec, b: Vec) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

/**
 * Summarises the spatial activation trajectory represented by QRS kernels.
 * This is deliberately analyzer-independent: it describes the generator's
 * vector loop before lead projection, filtering, rendering or measurement.
 */
export function spatialQrsSummary(kernels: readonly Kernel[]): SpatialQrsSummary {
  const integrated: Vec = [0, 0, 0];
  let peakSpatialMagnitude = 0, pathLength = 0, reversals = 0;
  let previous: Vec | null = null;
  for (const k of kernels) {
    for (let j=0;j<3;j++) integrated[j] += k.v[j] * k.sigma;
    peakSpatialMagnitude = Math.max(peakSpatialMagnitude, magnitude(k.v));
    if (previous) {
      const delta: Vec = [k.v[0]-previous[0], k.v[1]-previous[1], k.v[2]-previous[2]];
      pathLength += magnitude(delta);
      const denom = magnitude(previous) * magnitude(k.v);
      if (denom > 1e-12 && dot(previous, k.v) / denom < -0.25) reversals++;
    }
    previous = k.v;
  }
  const p = project(integrated);
  return {
    integrated,
    frontalAxis: axisFromLeads(p.I, p.II),
    peakSpatialMagnitude,
    pathLength,
    reversals,
  };
}

/** Smallest absolute angular separation in degrees. */
export function angularSeparation(a: number, b: number): number {
  return Math.abs((((a-b)%360)+540)%360-180);
}
