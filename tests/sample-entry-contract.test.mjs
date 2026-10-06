import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertReviewedSampleEntry, assertReviewedImpulseConfidence, assertReviewedSampleDependencies } from '../scripts/lib/sample-entry-contract.mjs';
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

it('rejects bypassing the reviewed zero-information axis screen',()=>{
  const bypass=source.replace('retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality))','attachMeasurementSupport(next, quality)');
  expect(bypass).not.toBe(source);
  expect(()=>assertReviewedSampleEntry(bypass)).toThrow(/Unreviewed/);
});

it('pins impulse-confidence policy and rejects bypassing its entry',()=>{
 const helper=readFileSync('src/engine/analysis/impulse-confidence.ts');
 expect(()=>assertReviewedImpulseConfidence(helper)).not.toThrow();
 expect(()=>assertReviewedImpulseConfidence(Buffer.concat([helper,Buffer.from('\n')]))).toThrow(/Unreviewed/);
 const bypass=source.replace('return withholdImpulseDominatedMeasurements(input, retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality)));','return retireUnsupportedFrontalAxis(input, attachMeasurementSupport(next, quality));');
 expect(bypass).not.toBe(source);expect(()=>assertReviewedSampleEntry(bypass)).toThrow(/Unreviewed/);
});

it('permits only the pinned additional confidence dependency in the candidate, never the baseline',()=>{
 const before=['src/engine/measure.ts','src/engine/sample-analysis.ts'];
 const after=[...before,'src/engine/analysis/impulse-confidence.ts'];
 expect(()=>assertReviewedSampleDependencies(before,before,false)).not.toThrow();
 expect(()=>assertReviewedSampleDependencies(after,before,true)).not.toThrow();
 for(const [actual,candidate] of [[after,false],[before,true],[[...after,'src/engine/secret.ts'],true]])
  expect(()=>assertReviewedSampleDependencies(actual,before,candidate)).toThrow(/Unexpected/);
});
