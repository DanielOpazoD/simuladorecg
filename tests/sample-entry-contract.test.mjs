import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertReviewedSampleEntry } from '../scripts/lib/sample-entry-contract.mjs';
const source = readFileSync('src/engine/sample-analysis.ts', 'utf8');
describe('Frozen comparison admits only the reviewed acquisition guard', () => {
  it('accepts the reviewed source', () => expect(() => assertReviewedSampleEntry(source)).not.toThrow());
  for (const [name, from, to] of [
    ['disabled guard', '  assertSampleInput(input);', ''],
    ['changed detector policy', 'candidateFraction: 0.6', 'candidateFraction: 0.2'],
    ['hidden nonfinite repair', '!Number.isFinite(samples[index])', 'false'],
  ]) it(`rejects ${name}`, () => {
    const changed = source.replace(from, to);
    expect(changed).not.toBe(source);
    expect(() => assertReviewedSampleEntry(changed)).toThrow(/Unreviewed/);
  });
});

it('verifies exact numerical-core preservation against the historical entry without Git history', () => {
  // Exact source from 8dd8af7; committed fixture also runs in shallow clones/ZIPs.
  const before = readFileSync('tests/fixtures/sample-analysis-before-guard.txt');
  expect(() => assertReviewedSampleEntry(source,before)).not.toThrow();
  expect(() => assertReviewedSampleEntry(source,before.toString().replace('candidateFraction: 0.6','candidateFraction: 0.2'))).toThrow(/Numerical/);
});
