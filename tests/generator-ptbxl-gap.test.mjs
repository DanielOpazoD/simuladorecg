import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { compareGenerator, quartiles, GROUPS, LEADS, FIELDS, PRESETS } from '../scripts/compare-generator-ptbxl.mjs';
const fixture = () => {
  const external = { records: [1, 2, 3, 4].map(ecg_id => ({ ecg_id, groups: GROUPS,
    leads: Object.fromEntries(LEADS.map(l => [l, Object.fromEntries(FIELDS.map(f => [f, ecg_id]))])) })) };
  const generated = { records: PRESETS.map(preset => ({ preset,
    leads: Object.fromEntries(LEADS.map(l => [l, Object.fromEntries(FIELDS.map(f => [f, 8]))])) })) };
  const features = { tables: { '12sl': Object.fromEntries([1, 2, 3, 4].map(id => [id,
    Object.fromEntries(LEADS.map(l => [`QRS_AmpPP_${l}`, id]))])) } };
  return [external, generated, features];
};
describe('PTB-XL gap computes real comparisons, never a silent empty success', () => {
  it('computes type-7 quartiles with explicit zero and missingness', () => {
    assert.deepEqual(quartiles([0, 2, 4, 6, null, NaN]), {total: 6, n: 4, missing: 2, q25: 1.5, median: 3, q75: 4.5});
  });
  it('does not depend on nonexistent quartiles in aggregate summaries', () => {
    const inputs = fixture(), before = structuredClone(inputs), r = compareGenerator(...inputs);
    assert.equal(r.rows.length, 400);
    assert.equal(r.summary.coverage.MI.comparable, 400);
    assert.equal(r.rows[0].references.MI.robustDistanceIqr, (8 - 3.25) / 1.5);
    assert.ok(r.summary.largestMI.length); assert.deepEqual(inputs, before);
  });
  it('keeps missing synthetic metrics instead of dropping rows', () => {
    const inputs = fixture(); inputs[1].records[0].leads.I.tFwhmMs = null;
    const r = compareGenerator(...inputs);
    assert.equal(r.rows.length, 400); assert.equal(r.summary.coverage.MI.comparable, 399);
    assert.equal(r.summary.coverage.MI.unavailableByReason['missing-generator'], 1);
  });
  it('records absent references and zero IQR, never divides by epsilon', () => {
    const inputs = fixture(); for (const r of inputs[0].records) { r.leads.I.tToQrs = 0; r.leads.II.tFwhmMs = null; }
    const r = compareGenerator(...inputs);
    assert.equal(r.summary.coverage.MI.unavailableByReason['zero-iqr'], 10);
    assert.equal(r.summary.coverage.MI.unavailableByReason['missing-reference'], 10);
    assert.equal(r.rows.find(r => r.lead === 'I' && r.field === 'tToQrs').references.MI.robustDistanceIqr, null);
  });
  it('quarantines an amplitude factor-1000 conflict without altering inputs', () => {
    const inputs = fixture(); for (const r of inputs[0].records) for (const l of LEADS) r.leads[l].qrsPeakToPeakMv *= 1000;
    const r = compareGenerator(...inputs);
    assert.equal(r.summary.amplitudeAudit.median, 1000); assert.equal(r.summary.amplitudeAudit.rescalingApplied, false);
    assert.equal(r.summary.coverage.MI.unavailableByReason['scale-conflict'], 240);
    assert.equal(r.summary.coverage.MI.comparable, 160);
  });
  it('does not declare amplitude comparable without tabular support', () => {
    const inputs = fixture(); inputs[2].tables['12sl'] = {};
    assert.equal(compareGenerator(...inputs).summary.amplitudeAudit.status, 'unverified');
  });
  it('rejects missing schema instead of a green empty report', () => {
    assert.throws(() => compareGenerator({}, {}, {}), /Missing external/);
    const i = fixture(); i[0].records.forEach(r => r.groups = []);
    assert.throws(() => compareGenerator(...i), /Missing reference group/);
  });
  it('rejects missing or duplicate presets and duplicate external IDs', () => {
    const a = fixture(); a[1].records.pop(); assert.throws(() => compareGenerator(...a), /preset/);
    const b = fixture(); b[1].records.push(b[1].records[0]); assert.throws(() => compareGenerator(...b), /preset/);
    const c = fixture(); c[0].records[1].ecg_id = 1; assert.throws(() => compareGenerator(...c), /Duplicate external/);
  });
  it('rejects a wholly unmeasurable comparison', () => {
    const i = fixture(); i[1].records.forEach(r => r.leads = {});
    assert.throws(() => compareGenerator(...i), /No comparable/);
  });
});
