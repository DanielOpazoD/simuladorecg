import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect } from "vitest";

/**
 * Platform-portable regression fingerprint of a synthesized lead.
 *
 * A SHA-256 of the raw sample buffer differs between Linux x64 and macOS arm64
 * because libm-level transcendental results may differ by one ULP. These values
 * tolerate that last-bit rounding noise while still failing on any
 * morphological change. Exact sample identity remains enforced on Linux CI by
 * scripts/validate-posterior-amplitude.mjs.
 */
export interface CatalogFingerprint {
  n: number;
  sum: number;
  sumAbs: number;
  sumSq: number;
  moment: number;
  min: number;
  max: number;
  samples: number[];
}

const FILE = new URL("../__snapshots__/catalog-fingerprints.json", import.meta.url);
const STRIDE = 100;
const SAMPLE_TOL_MV = 1e-5;
const AGGREGATE_REL_TOL = 1e-6;
const AGGREGATE_ABS_TOL = 1e-4;

export function catalogFingerprint(x: ArrayLike<number>): CatalogFingerprint {
  let sum = 0, sumAbs = 0, sumSq = 0, moment = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    sum += v; sumAbs += Math.abs(v); sumSq += v * v; moment += (i / x.length) * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const samples: number[] = [];
  for (let i = 0; i < x.length; i += STRIDE) samples.push(x[i]);
  return { n: x.length, sum, sumAbs, sumSq, moment, min, max, samples };
}

const update = process.env.UPDATE_CATALOG_FINGERPRINTS === "1";
const stored: Record<string, CatalogFingerprint> = existsSync(FILE)
  ? JSON.parse(readFileSync(FILE, "utf8"))
  : {};

function close(actual: number, expected: number, tol: number, label: string) {
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

export function expectCatalogFingerprint(id: string, x: ArrayLike<number>) {
  const actual = catalogFingerprint(x);
  if (update) {
    stored[id] = actual;
    const sorted = Object.fromEntries(Object.entries(stored).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(FILE, JSON.stringify(sorted, null, 1) + "\n");
    return;
  }
  const expected = stored[id];
  expect(expected, `${id}: missing fingerprint; run UPDATE_CATALOG_FINGERPRINTS=1 npx vitest run tests/engine.test.ts`).toBeDefined();
  expect(actual.n).toBe(expected.n);
  expect(actual.samples.length).toBe(expected.samples.length);
  for (const key of ["sum", "sumAbs", "sumSq", "moment", "min", "max"] as const)
    close(actual[key], expected[key], AGGREGATE_ABS_TOL + AGGREGATE_REL_TOL * Math.abs(expected[key]), `${id}.${key}`);
  actual.samples.forEach((v, i) => close(v, expected.samples[i], SAMPLE_TOL_MV, `${id}.samples[${i}]`));
}
