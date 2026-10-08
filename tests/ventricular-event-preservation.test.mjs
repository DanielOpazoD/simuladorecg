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
