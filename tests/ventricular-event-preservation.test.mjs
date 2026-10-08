import { it, expect } from "vitest";
import { lostVentricularReferences } from "../scripts/lib/ventricular-event-preservation.mjs";
const coverage = (times) => ({
  matchedQrsReferenceTimes: times,
  coveredQrsSupportTimes: times,
});
it("accepts actual reference coverage, including additional recovered beats", () => {
  expect(
    lostVentricularReferences(coverage([1, 3]), coverage([1, 2, 3])),
  ).toEqual(coverage([]));
});
it("rejects a reference substitution even when TP/FN counts and mean HR agree", () => {
  expect(
    lostVentricularReferences(coverage([1, 2, 4]), coverage([1, 3, 4])),
  ).toEqual(coverage([2]));
});
it("does not silently accept aggregate-only historical reports", () => {
  expect(() =>
    lostVentricularReferences({ tp: 3, fn: 1 }, coverage([1, 2, 3])),
  ).toThrow();
});
it("rejects non-finite or duplicated evaluator identities", () => {
  expect(() =>
    lostVentricularReferences(coverage([1, 1]), coverage([1])),
  ).toThrow();
  expect(() =>
    lostVentricularReferences(coverage([NaN]), coverage([1])),
  ).toThrow();
});

import { changedCorrectVentricularBoundaries } from "../scripts/lib/ventricular-event-preservation.mjs";
const boundary = (referenceOnset, changes = {}) => ({
  referenceOnset,
  phaseValid: true,
  onsetErrorMs: 0,
  offsetErrorMs: 0,
  tEndErrorMs: 0,
  qrs: 0,
  qt: 0,
  ...changes,
});
const measured = (intervalErrors, status = "usable") => ({
  intervalErrors,
  intervalQuality: { qrs: { status }, qt: { status } },
});
it("preserves matched correct boundaries and permits genuine improvement", () => {
  expect(
    changedCorrectVentricularBoundaries(
      measured([boundary(1, { qrs: 80, offsetErrorMs: 80 })]),
      measured([boundary(1)]),
    ),
  ).toEqual({ regressions: [], withdrawals: [] });
});
it("finds a per-event boundary regression even if another beat improves the average", () => {
  const result = changedCorrectVentricularBoundaries(
    measured([boundary(1), boundary(2, { qrs: 50, offsetErrorMs: 50 })]),
    measured([boundary(1, { qrs: 25, offsetErrorMs: 25 }), boundary(2)]),
  );
  expect(result.regressions.map((r) => r.referenceOnset)).toEqual([1, 1]);
});
it("does not label cancellation of misplaced endpoints as a correct interval", () => {
  const before = boundary(1, {
    onsetErrorMs: 80,
    offsetErrorMs: 80,
    tEndErrorMs: 80,
  });
  expect(
    changedCorrectVentricularBoundaries(
      measured([before]),
      measured([boundary(1, { qt: 40, tEndErrorMs: 40 })]),
    ),
  ).toEqual({ regressions: [], withdrawals: [] });
});
it("ignores a prior measurement whose marker was not in actual QRS support", () => {
  expect(
    changedCorrectVentricularBoundaries(
      measured([boundary(1, { phaseValid: false })]),
      measured([]),
    ),
  ).toEqual({ regressions: [], withdrawals: [] });
});
it("reports withdrawal of a correct usable measurement without calling it a numerical correction", () => {
  const result = changedCorrectVentricularBoundaries(
    measured([boundary(1)]),
    measured([boundary(1, { qt: null, tEndErrorMs: null })]),
  );
  expect(result.regressions).toEqual([]);
  expect(result.withdrawals.map((r) => r.key)).toEqual(["tEndErrorMs", "qt"]);
});
it("retains uncertainty when an already reviewed boundary is withdrawn", () => {
  expect(
    changedCorrectVentricularBoundaries(
      measured([boundary(1)], "review"),
      measured([]),
    ),
  ).toEqual({ regressions: [], withdrawals: [] });
});
it("rejects missing, duplicated or non-finite per-event boundary evidence", () => {
  for (const entries of [
    [boundary(1), boundary(1)],
    [boundary(1, { qrs: NaN })],
  ])
    expect(() =>
      changedCorrectVentricularBoundaries(measured(entries), measured([])),
    ).toThrow();
  expect(() => changedCorrectVentricularBoundaries({}, measured([]))).toThrow();
});
