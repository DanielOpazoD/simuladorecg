import assert from "node:assert/strict";

/** Counts alone can hide replacement of one missed reference beat by another.
 * These are evaluator-owned reference identities, never analyzer inputs. */
export function lostVentricularReferences(before, after) {
  const lost = {};
  for (const key of ["matchedQrsReferenceTimes", "coveredQrsSupportTimes"]) {
    for (const side of [before, after]) {
      assert.ok(Array.isArray(side[key]), `Missing per-event coverage: ${key}`);
      assert.ok(
        side[key].every(Number.isFinite),
        `Invalid reference identity: ${key}`,
      );
      assert.equal(
        new Set(side[key]).size,
        side[key].length,
        `Duplicate reference identity: ${key}`,
      );
    }
    const retained = new Set(after[key]);
    lost[key] = before[key].filter((time) => !retained.has(time));
  }
  return lost;
}
