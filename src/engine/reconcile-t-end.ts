import type { DelineatedBeat, Signal } from './types';
import { suggestTEnds } from './t-end-area';
import { median } from './analysis/statistics';

/** Sample-only reconciliation of terminal return with a separate area estimator.
 * The 40 ms disagreement interval is the existing return detector's quiet span.
 * A later area maximum can be U or P: it cannot lengthen an existing endpoint.
 * New endpoints cannot extend the established within-record QT center either.
 * This changes numbers, never grants clinical confidence from lead agreement.
 */
export const T_END_RECONCILIATION = Object.freeze({
  version: 'area-return-reconciliation-v1' as const,
  disagreementSeconds: 0.04,
  minimumExistingIntervals: 3,
});
export function reconcileTEnds(
  input: Pick<Signal, 'fs' | 'leads'>,
  beats: DelineatedBeat[],
  detectedPeaks: number[],
  window: { start: number; end: number },
): number {
  const proposals = suggestTEnds(input, { beats, detectedPeaks, window });
  const priorQt = beats.flatMap(b => b.qt === null ? [] : [b.qt]);
  const center = priorQt.length >= T_END_RECONCILIATION.minimumExistingIntervals ? median(priorQt) : null;
  const margin = T_END_RECONCILIATION.disagreementSeconds;
  let changed = 0;
  for (let i = 0; i < beats.length; i++) {
    const proposal = proposals[i], beat = beats[i];
    if (!proposal) continue;
    const proposedQt = (proposal.time - beat.onset) * 1000;
    const recover = beat.tEnd === null && (center === null || proposedQt <= center + margin * 1000);
    const shorten = beat.tEnd !== null && beat.tEnd - proposal.time > margin;
    if (!recover && !shorten) continue;
    beat.terminalRevision = {
      method: T_END_RECONCILIATION.version,
      previousEnd: beat.tEnd, previousQt: beat.qt, previousTangentEnd: beat.tTangentEnd,
      areaEnd: proposal.time, leadCount: proposal.supportingLeads.length, spreadMs: proposal.spreadMs,
    };
    beat.tEnd = proposal.time;
    beat.qt = proposedQt;
    beat.tTangentEnd = null;
    changed++;
  }
  return changed;
}
