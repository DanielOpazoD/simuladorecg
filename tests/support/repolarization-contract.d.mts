import type { Beat, Lead, Signal } from '../../src/engine/types';
export const PHYSICAL_LEADS: Lead[];
export function beatWindows(beat: Pick<Beat, 'time' | 'qrs' | 'qt'>): {
  pre: [number, number]; qrs: [number, number]; postQrs: [number, number];
};
export interface RegionResult {
  checked: number; maxDifferenceMv: number;
  startSample: number; endSampleExclusive: number;
}
export function assertSampleRegion(
  a: Pick<Signal, 'fs' | 'leads'>, b: Pick<Signal, 'fs' | 'leads'>,
  start: number, end: number, options?: {label?: string; epsilon?: number},
): RegionResult;
export function assertTraceContract(a: Signal, b: Signal, label?: string, epsilon?: number): RegionResult;
