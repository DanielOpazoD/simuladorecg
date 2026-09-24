import type { Signal, Measurement, Beat, DelineatedBeat } from "./types";
import { median } from "./analysis/statistics";
/** Generator reference over exactly the same time interval as sample analysis. */
export function referenceInWindow(
  signal: Signal,
  start = 0,
  end = 10,
): Signal["truth"] {
  const beats = signal.events.beats.filter(
    (b) => b.time >= start && b.time < end,
  );
  const intervals = beats.slice(1).map((b, i) => b.time - beats[i].time);
  const prs = beats.flatMap((b) => (b.pr === undefined ? [] : [b.pr * 1000]));
  const stablePR = prs.length && Math.max(...prs) - Math.min(...prs) < 1;
  return {
    ...signal.truth,
    hr: intervals.length
      ? 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : 0,
    pr: stablePR ? median(prs) : null,
    qrs: beats.length
      ? median(
          beats.flatMap((b) => (b.qrs === undefined ? [] : [b.qrs * 1000])),
        ) || null
      : null,
    qt: beats.length
      ? median(
          beats.flatMap((b) => (b.qt === undefined ? [] : [b.qt * 1000])),
        ) || null
      : null,
  };
}

/** Compare the population actually measured; the detector never receives this data. */
export function referenceForMeasurement(signal: Signal, m: Measurement) {
  const source = signal.events.beats.filter(
    (b) => b.time < m.window.end && b.time + (b.qrs ?? 0) >= m.window.start,
  );
  const used = new Set<Beat>();
  const identities = new Map<number, Beat>();
  for (const peak of m.detectedPeaks) {
    const candidates = source.filter(
      (b) =>
        !used.has(b) &&
        peak >= b.time - 0.025 &&
        peak <= b.time + (b.qrs ?? 0) + 0.025,
    );
    // Overlapping plausible supports are ambiguous, not silently assigned.
    if (candidates.length !== 1) continue;
    used.add(candidates[0]);
    identities.set(peak, candidates[0]);
  }
  const matched = [...used].sort((a, b) => a.time - b.time);
  const observed =
    matched.length > 1
      ? source.filter(
          (b) => b.time >= matched[0].time && b.time <= matched.at(-1)!.time,
        )
      : matched;
  const pairs: { measured: DelineatedBeat; source: Beat }[] = [];
  for (const measured of m.beats) {
    const source = identities.get(measured.peak);
    if (source) pairs.push({ measured, source });
  }
  const value = (values: number[]) => (values.length ? median(values) : null);
  const observedPRs = observed.flatMap((b) =>
    b.pr === undefined ? [] : [b.pr * 1000],
  );
  const stablePR =
    observedPRs.length > 0 &&
    Math.max(...observedPRs) - Math.min(...observedPRs) < 1;
  const reference: Signal["truth"] = {
    hr:
      observed.length > 1
        ? (60 * (observed.length - 1)) /
          (observed.at(-1)!.time - observed[0].time)
        : 0,
    pr: stablePR
      ? value(
          pairs.flatMap(({ measured, source }) =>
            measured.pr !== null && source.pr !== undefined
              ? [source.pr * 1000]
              : [],
          ),
        )
      : null,
    qrs: value(
      pairs.flatMap(({ source }) =>
        source.qrs === undefined ? [] : [source.qrs * 1000],
      ),
    ),
    qt: value(
      pairs.flatMap(({ measured, source }) =>
        measured.qt !== null && source.qt !== undefined
          ? [source.qt * 1000]
          : [],
      ),
    ),
    axis: signal.truth.axis,
  };
  return {
    reference,
    pairs,
    falsePeaks: m.detectedPeaks.length - identities.size,
    missedBeats: observed.filter((b) => !used.has(b)).length,
    unpairedBounds: m.beats.length - pairs.length,
  };
}
