import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect } from "vitest";

/**
 * Platform-portable regression fingerprint of a synthesized lead.
 *
 * A SHA-256 of the raw sample buffer differs between Linux x64 and macOS arm64
 * because libm-level transcendental results may differ by one ULP. These values
 * tolerate that last-bit rounding noise while still failing on any
 * morphological change. They are the catalog's sample regression contract.
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
// Only the 19 reviewed PR–QRS changes use a new baseline. The original
// fingerprints remain intact; scripts/verify-learned-handoff.mjs reproduces
// their predecessor and bounds every raw delta to the handoff's grid samples.
const HANDOFF_FILE = new URL("../__snapshots__/catalog-pr-qrs-v2.json", import.meta.url);
const handoff: Record<string, CatalogFingerprint> = JSON.parse(readFileSync(HANDOFF_FILE, "utf8"));
// Only AAI changes in the independently audited ventricular terminal fix.
const TERMINAL_FILE = new URL("../__snapshots__/catalog-post-t-v3.json", import.meta.url);
const terminal: Record<string, CatalogFingerprint> = JSON.parse(readFileSync(TERMINAL_FILE, "utf8"));
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
    if (terminal[id]) throw new Error(`${id}: preserve the audited terminal reference; run scripts/verify-ventricular-terminal.mjs first`);
    if (handoff[id]) throw new Error(`${id}: use scripts/verify-learned-handoff.mjs --write-fingerprints; preserve the historical fingerprint`);
    stored[id] = actual;
    const sorted = Object.fromEntries(Object.entries(stored).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(FILE, JSON.stringify(sorted, null, 1) + "\n");
    return;
  }
  const expected = terminal[id] ?? handoff[id] ?? stored[id];
  expect(expected, `${id}: missing fingerprint; run UPDATE_CATALOG_FINGERPRINTS=1 npx vitest run tests/engine.test.ts`).toBeDefined();
  expect(actual.n).toBe(expected.n);
  expect(actual.samples.length).toBe(expected.samples.length);
  for (const key of ["sum", "sumAbs", "sumSq", "moment", "min", "max"] as const)
    close(actual[key], expected[key], AGGREGATE_ABS_TOL + AGGREGATE_REL_TOL * Math.abs(expected[key]), `${id}.${key}`);
  actual.samples.forEach((v, i) => close(v, expected.samples[i], SAMPLE_TOL_MV, `${id}.samples[${i}]`));
}
