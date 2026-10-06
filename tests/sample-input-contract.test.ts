import { describe, expect, it } from 'vitest';
import { analyzeSamples } from '../src/engine/sample-analysis';
import { fixture } from './fixtures';
import { LEADS } from '../src/engine/lead-registry';

describe('Sample-domain boundary rejects invalid recordings before measurement', () => {
  it.each([0, -500, NaN, Infinity, 99, 1001, 500.5])('rejects unsupported fs %s', fs => {
    const input = fixture(); input.fs = fs;
    expect(() => analyzeSamples(input)).toThrow(/muestreo/i);
  });
  it.each(LEADS)('rejects a nonfinite sample in %s, including unused detector channels', lead => {
    const input = fixture(); input.leads[lead][12] = NaN;
    expect(() => analyzeSamples(input)).toThrow(/finita/i);
  });
  it('rejects channels with different time support', () => {
    const input = fixture(); input.leads.V6 = input.leads.V6.slice(1);
    expect(() => analyzeSamples(input)).toThrow(/longitud/i);
  });
  it('rejects an absent channel with a descriptive error', () => {
    const input = fixture(); delete (input.leads as Partial<typeof input.leads>).V2;
    expect(() => analyzeSamples(input)).toThrow(/V2/);
  });
  it('rejects an empty recording', () => {
    const input = fixture(); for (const lead of LEADS) input.leads[lead] = new Float64Array();
    expect(() => analyzeSamples(input)).toThrow(/muestras/i);
  });
  it.each([100, 250, 500, 1000])('preserves valid samples at %s Hz', fs => {
    const input = fixture({ fs }); const before = structuredClone(input);
    expect(() => analyzeSamples(input)).not.toThrow();
    expect(input).toEqual(before);
  });
});
