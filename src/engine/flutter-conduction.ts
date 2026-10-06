import type { ECGCase } from './types';

/** Explicit teaching sequences, not a simulation of AV nodal refractoriness. */
export function flutterRatios(c: Pick<ECGCase, 'flutterRatio' | 'flutterPattern'>): readonly number[] {
  if (c.flutterPattern === '2-3') return [2, 3];
  if (c.flutterPattern === '3-4') return [3, 4];
  return [c.flutterRatio];
}
export function flutterMeanRatio(c: Pick<ECGCase, 'flutterRatio' | 'flutterPattern'>): number {
  const ratios = flutterRatios(c);
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}
