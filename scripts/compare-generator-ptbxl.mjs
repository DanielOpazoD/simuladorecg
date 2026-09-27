/** Development triage, not a fidelity score. No coefficient may be changed from this report alone. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GROUPS = ['NORM', 'MI', 'STTC'];
export const LEADS = ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
export const FIELDS = ['j60Mv', 'qrsPeakToPeakMv', 'tPeakMv', 'tFwhmMs', 'tToQrs'];
export const PRESETS = ['inferior', 'inferior_lcx', 'anterior', 'lateral', 'posterior', 'diffuse', 'subendo', 'wellens_a', 'wellens_b', 'de_winter'];
const finite = Number.isFinite;
export function quartiles(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  const q = p => {
    if (!sorted.length) return null;
    const x = (sorted.length - 1) * p, i = Math.floor(x);
    return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (x - i);
  };
  return { total: values.length, n: sorted.length, missing: values.length - sorted.length,
    q25: q(.25), median: q(.5), q75: q(.75) };
}

/** Same-provider amplitude cross-check; detects gross scale conflicts, never rescales samples.
 * 0.5..2 is an engineering discrepancy flag, NOT a clinical amplitude range or unit certification.
 */
export function amplitudeAudit(external, features) {
  assert.ok(features?.tables?.['12sl'], 'Missing independently harmonized 12SL features');
  const ratios = [];
  for (const record of external.records) for (const lead of LEADS) {
    const measured = record.leads?.[lead]?.qrsPeakToPeakMv;
    const tabular = features.tables['12sl'][record.ecg_id]?.[`QRS_AmpPP_${lead}`];
    if (finite(measured) && measured > 0 && finite(tabular) && tabular > 0) ratios.push(measured / tabular);
  }
  const stats = quartiles(ratios);
  // A pooled median can hide one differently scaled lead/record. Missing or zero
  // pairs cannot certify the rest: every requested pair must support this check.
  const requestedPairs = external.records.length * LEADS.length;
  const conflictingPairs = ratios.filter(ratio => ratio < .5 || ratio > 2).length;
  return { ...stats, requestedPairs, missingPairs: requestedPairs - stats.n, conflictingPairs,
    status: conflictingPairs ? 'scale-conflict' : stats.n > 0 && stats.n === requestedPairs
      ? 'consistent-with-tabular' : 'unverified', rescalingApplied: false };
}

export function compareGenerator(external, generated, features) {
  assert.ok(Array.isArray(external?.records) && external.records.length, 'Missing external records');
  assert.ok(Array.isArray(generated?.records), 'Missing generator records');
  assert.equal(new Set(external.records.map(r => r.ecg_id)).size, external.records.length, 'Duplicate external IDs');
  const audit = amplitudeAudit(external, features);
  const reference = Object.fromEntries(GROUPS.map(group => {
    const selected = external.records.filter(r => r.groups?.includes(group));
    assert.ok(selected.length, `Missing reference group ${group}`);
    return [group, Object.fromEntries(LEADS.map(lead => [lead, Object.fromEntries(FIELDS.map(field =>
      [field, quartiles(selected.map(r => r.leads?.[lead]?.[field]))]))]))];
  }));
  const rows = [];
  for (const preset of PRESETS) {
    const matches = generated.records.filter(r => r.preset === preset);
    assert.equal(matches.length, 1, `Missing or duplicate preset ${preset}`);
    for (const lead of LEADS) for (const field of FIELDS) {
      const value = finite(matches[0].leads?.[lead]?.[field]) ? matches[0].leads[lead][field] : null;
      const references = {};
      for (const group of GROUPS) {
        const s = reference[group][lead][field];
        const amplitude = field.endsWith('Mv');
        const status = amplitude && audit.status !== 'consistent-with-tabular' ? audit.status
          : value === null ? 'missing-generator' : !s.n ? 'missing-reference' : s.q75 === s.q25 ? 'zero-iqr' : 'available';
        const distance = status === 'available' ? Math.max(s.q25 - value, value - s.q75, 0) / (s.q75 - s.q25) : null;
        references[group] = { ...s, status, robustDistanceIqr: distance };
      }
      rows.push({ preset, lead, field, value, references });
    }
  }
  const coverage = Object.fromEntries(GROUPS.map(group => {
    const refs = rows.map(r => r.references[group]);
    const comparable = refs.filter(r => r.status === 'available').length;
    assert.ok(comparable > 0, `No comparable measurements for ${group}`);
    return [group, { requested: rows.length, comparable,
      unavailableByReason: Object.fromEntries([...new Set(refs.map(r => r.status))].filter(s => s !== 'available')
        .map(s => [s, refs.filter(r => r.status === s).length])),
      outsideOneIqr: refs.filter(r => r.robustDistanceIqr !== null && r.robustDistanceIqr > 1).length }];
  }));
  const summary = { schemaVersion: 2, role: 'Descriptive development triage, not clinical calibration',
    regionalPresets: PRESETS.length, rows: rows.length, coverage, amplitudeAudit: audit,
    largestMI: rows.filter(r => r.references.MI.robustDistanceIqr !== null)
      .sort((a, b) => b.references.MI.robustDistanceIqr - a.references.MI.robustDistanceIqr).slice(0, 30),
    limitations: ['Overlapping PTB-XL groups are not acute coronary occlusion or territory adjudication.',
      'External 12SL windows differ from synthetic timing. IQR distance is not a fidelity score.',
      'Amplitude conflicts are reported, never silently corrected by a factor of 1000.',
      'No coefficient may be changed from this report alone.'] };
  return { summary, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [root, out] = process.argv.slice(2);
  assert.ok(root && out, 'Usage: node scripts/compare-generator-ptbxl.mjs PTBXL_OUTPUT OUT');
  const names = ['median-morphology.json', 'generator-morphology.json', 'selected-features.json'];
  const bytes = await Promise.all(names.map(n => readFile(path.join(root, n))));
  const report = compareGenerator(...bytes.map(b => JSON.parse(b)));
  report.inputsSha256 = Object.fromEntries(names.map((n, i) => [n, createHash('sha256').update(bytes[i]).digest('hex')]));
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'generator-ptbxl-gap.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
}
