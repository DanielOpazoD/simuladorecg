import { describe, it, expect } from 'vitest';
import { auditEvidenceLedger, metricEligibility, METRICS } from '../scripts/lib/fidelity-evidence-ledger.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = (id, role, records, extra = {}) => ({ id, dataset: 'PTB-XL', version: '1.0.3', role,
  identityEvidence: 'observed', membershipComplete: true, records, units: { allowedMetrics: METRICS }, ...extra });
const inventory = sources => ({ schemaVersion: 1, coverageComplete: true, sources });
const row = (recordId, patientId, fold = 1) => ({ recordId, patientId, fold });

describe('fidelity evidence ledger: patient membership, not record disjunction', () => {
  it('detects one exposed patient across different records, once, and preserves every use', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7), row('b', 7)]), source('reserve', 'candidate', [row('c', 7)])]));
    expect(audit.observedExposedPatientCount).toBe(1);
    expect(audit.overlapCount).toBe(1);
    expect(audit.holdoutReady).toBe(false);
    expect(audit.patients[0].records).toEqual(['a', 'b', 'c']);
    expect(audit.patients[0].sources).toEqual(['reserve', 'train']);
  });
  it('can recognize a fully enumerated independent reserve with supported metrics', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7)]), source('reserve', 'candidate', [row('b', 8)])]));
    expect(audit).toMatchObject({ overlapStatus: 'known', overlapCount: 0, holdoutReady: true, clinicalValidation: false });
  });
  it('keeps unknown distinct from zero when any executed manifest is missing', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [], { membershipComplete: false }), source('reserve', 'candidate', [row('b', 8)])]));
    expect(audit).toMatchObject({ observedOverlapCount: 0, overlapCount: null, overlapStatus: 'unknown', holdoutReady: false });
  });
  it('does not replace missing patient IDs with record IDs', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', null)]), source('reserve', 'candidate', [row('b', 8)])]));
    expect(audit.sources[0]).toMatchObject({ observedPatientCount: 0, unresolvedRecords: 1, membershipStatus: 'incomplete' });
    expect(audit.holdoutReady).toBe(false);
  });
  it('does not treat policy patient IDs or a count as proof of executed membership', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7)], { identityEvidence: 'policy-only' }), source('reserve', 'candidate', [row('b', 8)])]));
    expect(audit.observedExposedPatientCount).toBe(0);
    expect(audit.overlapCount).toBeNull();
  });
  it('rejects conflicting record identities and inconsistent patient folds', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7, 1), row('b', 7, 9)]), source('reserve', 'candidate', [row('a', 8, 1)])]));
    expect(audit.issues.map(i => i.code)).toContain('record-patient-conflict');
    expect(audit.issues.map(i => i.code)).toContain('patient-fold-conflict');
    expect(audit.holdoutReady).toBe(false);
  });
  it('requires folds when the data source promises them', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [{ recordId: 'a', patientId: 7 }], { requireFold: true }), source('reserve', 'candidate', [row('b', 8)])]));
    expect(audit.issues.map(i => i.code)).toContain('missing-fold');
    expect(audit.holdoutReady).toBe(false);
  });
  it('preserves version provenance without splitting known canonical patients', () => {
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7)], { version: '1.0.2' }), source('reserve', 'candidate', [row('b', 7)])]));
    expect(audit.observedOverlapCount).toBe(1);
    expect(audit.patients[0].versions).toEqual(['1.0.2', '1.0.3']);
    expect(audit.issues.map(i => i.code)).toContain('cross-version-identity-unresolved');
    expect(audit.holdoutReady).toBe(false);
  });
  it('blocks partial counts, empty candidates and inventory-level omissions', () => {
    const base = [source('train', 'exposed', [row('a', 7)]), source('reserve', 'candidate', [row('b', 8)], { expectedRecords: 2 })];
    expect(auditEvidenceLedger(inventory(base)).holdoutReady).toBe(false);
    expect(auditEvidenceLedger(inventory([base[0], source('reserve', 'candidate', [])])).holdoutReady).toBe(false);
    expect(auditEvidenceLedger({ ...inventory(base), coverageComplete: false }).overlapCount).toBeNull();
  });
  it('blocks cross-lead and absolute metrics when only within-lead scaling is supported', () => {
    const units = { allowedMetrics: ['withinLeadRatio', 'timing'], reason: 'compatible-channel-normalization-in-audited-selection' };
    expect(metricEligibility(units, 'withinLeadRatio').eligible).toBe(true);
    expect(metricEligibility(units, 'absoluteAmplitude').eligible).toBe(false);
    expect(metricEligibility(units, 'crossLeadVoltage').eligible).toBe(false);
    const audit = auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7)]), source('reserve', 'candidate', [row('b', 8)], { units })]));
    expect(audit.overlapCount).toBe(0);
    expect(audit.holdoutReady).toBe(false);
  });
  it('fails malformed data instead of silently treating it as an empty source', () => {
    for (const invalid of [null, {}, { schemaVersion: 1, sources: [], coverageComplete: 'yes' },
      inventory([source('a', 'unknown', [])]), inventory([source('a', 'exposed', [{ recordId: null }])]),
      inventory([source('a', 'exposed', [row('r', {}, 1)])]), inventory([source('a', 'exposed', [row('r', 7, 11)])]),
      inventory([source('a', 'exposed', [row('r', 7)]), source('a', 'candidate', [row('s', 8)])])]) {
      expect(() => auditEvidenceLedger(invalid)).toThrow(TypeError);
    }
  });
  it('rejects falsy, nonintegral and malformed manifest-size assertions', () => {
    for (const expectedRecords of [0, null, NaN, Infinity, -1, 1.5, '2', false]) {
      expect(() => auditEvidenceLedger(inventory([source('train', 'exposed', [row('a', 7)], { expectedRecords })]))).toThrow(TypeError);
    }
  });
  it('rejects empty or unrecognized metric requirements instead of approving a vacuous gate', () => {
    for (const requiredMetrics of [[], null, {}, '', false, ['unknown'], ['timing', null]]) {
      expect(() => auditEvidenceLedger({ ...inventory([source('reserve', 'candidate', [row('a', 7)])]), requiredMetrics })).toThrow(TypeError);
    }
  });
  it('refuses to overwrite earlier results, including adverse results', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'ecg-ledger-'));
    try {
      const output = join(temporary, 'result.json');
      writeFileSync(output, '{"adverse":true}\n');
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/audit-fidelity-evidence.mjs', import.meta.url)), '--output', output], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Output already exists');
      expect(readFileSync(output, 'utf8')).toBe('{"adverse":true}\n');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
  it('keeps recovered exposed membership linked across512, median64 and original-scale64 without inventing secondary IDs', () => {
    const snapshot = JSON.parse(readFileSync(new URL('../benchmarks/fidelity/ptbxl-exposed-selection.json', import.meta.url), 'utf8'));
    const originalScale = JSON.parse(readFileSync(new URL('../docs/evidence/source-scale-reference.json', import.meta.url), 'utf8'));
    expect(snapshot.records).toHaveLength(512);
    expect(new Set(snapshot.records.map(r => r.patient_id)).size).toBe(512);
    expect(snapshot.records.every(r => Number.isInteger(r.patient_id) && Number.isInteger(r.ecg_id) && r.fold >= 1 && r.fold <= 8)).toBe(true);
    expect(snapshot.medianRecords).toHaveLength(64);
    expect(snapshot.medianRecords.every(r => snapshot.records.some(parent => parent.ecg_id === r.ecg_id && parent.patient_id === r.patient_id && parent.fold === r.fold))).toBe(true);
    expect([...snapshot.medianIds].sort((a, b) => a - b)).toEqual(originalScale.ptbxlOriginalScale.recordsEvidence.map(r => r.id).sort((a, b) => a - b));
    expect(snapshot.secondary.selectionSha256).toBe(snapshot.provenance.sourceFileSha256['selection.json']);
    expect(snapshot.provenance.protocolSha256).toBe(snapshot.provenance.sourceFileSha256['protocol.json']);
    expect(snapshot.secondary).toMatchObject({ coveredByExposedSelection: true, exactSubsetIdentityAvailable: false, groupCounts: { CLBBB: 13, CRBBB: 13, WPW: 1 } });
    const isolated = JSON.parse(readFileSync(new URL('../docs/evidence/isolated-phenotypes-selection.json', import.meta.url), 'utf8'));
    const rows = selection => selection.map(r => row(r.ecg_id, r.patient_id, r.fold));
    const audit = auditEvidenceLedger(inventory([source('recovered512', 'exposed', rows(snapshot.records)), source('existing94', 'exposed', rows(isolated.records)), source('median64', 'exposed', rows(snapshot.medianRecords))]));
    expect(audit.observedExposedPatientCount).toBe(605);
    expect(audit.holdoutReady).toBe(false);
  });
});
