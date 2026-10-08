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

/** Preserve correct endpoints of the same evaluator-owned ventricular event.
 * A numerically plausible interval with two misplaced endpoints is not a
 * correct boundary. Missing usable measurements are reported separately.
 * Endpoint preservation supplements the existing width/QT gates. These
 * engineering error screens are not clinical accuracy thresholds. */
export function changedCorrectVentricularBoundaries(before, after) {
  const limits = {
    onsetErrorMs: 20,
    offsetErrorMs: 20,
    tEndErrorMs: 30,
    qrs: 20,
    qt: 30,
  };
  for (const side of [before, after]) {
    assert.ok(
      Array.isArray(side.intervalErrors),
      "Missing per-event boundaries",
    );
    assert.equal(
      new Set(side.intervalErrors.map((b) => b.referenceOnset)).size,
      side.intervalErrors.length,
      "Duplicated boundary reference",
    );
    for (const b of side.intervalErrors) {
      assert.ok(Number.isFinite(b.referenceOnset));
      assert.equal(typeof b.phaseValid, "boolean");
      for (const key of Object.keys(limits))
        assert.ok(
          b[key] === null || Number.isFinite(b[key]),
          "Invalid boundary error: " + key,
        );
    }
  }
  const regressions = [],
    withdrawals = [];
  const next = new Map(
    after.intervalErrors
      .filter((b) => b.phaseValid)
      .map((b) => [b.referenceOnset, b]),
  );
  const correct = (b, key) =>
    b[key] !== null && Math.abs(b[key]) <= limits[key];
  for (const b of before.intervalErrors.filter((b) => b.phaseValid)) {
    const a = next.get(b.referenceOnset);
    for (const [key, limit] of Object.entries(limits)) {
      if (!correct(b, key)) continue;
      if (
        key === "qrs" &&
        (!correct(b, "onsetErrorMs") || !correct(b, "offsetErrorMs"))
      )
        continue;
      if (
        key === "qt" &&
        (!correct(b, "onsetErrorMs") || !correct(b, "tEndErrorMs"))
      )
        continue;
      if (!a || a[key] === null) {
        const metric = key === "qt" || key === "tEndErrorMs" ? "qt" : "qrs";
        const endpoints =
          metric === "qt"
            ? ["onsetErrorMs", "tEndErrorMs", "qt"]
            : ["onsetErrorMs", "offsetErrorMs", "qrs"];
        if (
          before.intervalQuality[metric].status === "usable" &&
          endpoints.every((field) => correct(b, field))
        )
          withdrawals.push({
            referenceOnset: b.referenceOnset,
            key,
            before: b[key],
          });
      } else if (Math.abs(a[key]) > limit)
        regressions.push({
          referenceOnset: b.referenceOnset,
          key,
          before: b[key],
          after: a[key],
        });
    }
  }
  return { regressions, withdrawals };
}
