import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { auditEvidenceLedger } from './lib/fidelity-evidence-ledger.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: node scripts/audit-fidelity-evidence.mjs [--output report.json]');
const output = resolve(args[1] ?? join(root, '../ECG-QA/fidelity-round2/evidence-audit.json'));
try {
  await stat(output);
  throw new Error(`Output already exists; preserve prior results and choose a new --output path: ${output}`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const hashes = new Map();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function readEvidence(path) {
  const bytes = await readFile(resolve(root, path));
  hashes.set(path, digest(bytes));
  return bytes.toString('utf8');
}
async function optionalEvidence(path) {
  try { return await readEvidence(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function rowsAt(json, dottedPath) {
  const rows = dottedPath.split('.').reduce((value, part) => value?.[part], json);
  if (!Array.isArray(rows)) throw new TypeError(`Expected array at ${dottedPath}`);
  return rows;
}
async function cacheInventory(rawPath) {
  const path = resolve(rawPath.startsWith('~/') ? join(homedir(), rawPath.slice(2)) : rawPath);
  const result = { path, status: 'absent', search: 'file names only; at most three levels; no waveform acquisition', relevantFiles: [] };
  try {
    if (!(await stat(path)).isDirectory()) return { ...result, status: 'not-directory' };
    result.status = 'present';
    async function visit(directory, depth) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink()) continue;
        const file = join(directory, entry.name);
        if (entry.isDirectory() && depth < 3) await visit(file, depth + 1);
        if (entry.isFile() && /(?:ptbxl_database\.csv|holdout_norm600\.txt|selection.*\.json|.*manifest.*\.json|.*(?:ptbxl|staff|training|membership|secondary-stt).*\.json)$/i.test(entry.name)) result.relevantFiles.push(relative(path, file).replaceAll('\\', '/'));
      }
    }
    await visit(path, 0);
    return result;
  } catch (error) {
    if (error.code === 'ENOENT') return result;
    return { ...result, status: 'unreadable', errorCode: error.code ?? 'unknown' };
  }
}

const inventory = JSON.parse(await readEvidence('benchmarks/fidelity/evidence-inventory.json'));
const sourceSummaries = [];
const sourceRecords = [];
for (const source of inventory.sources) {
  const expanded = { ...source, records: [...source.records], units: inventory.unitProfiles[source.unitsProfile] };
  if (!expanded.units) throw new TypeError(`Unknown units profile: ${source.unitsProfile}`);
  const missingEvidence = [], modelMetadata = [];
  let membershipProvenance = null;
  for (const path of source.evidencePaths ?? []) if (await optionalEvidence(path) === null) missingEvidence.push(path);
  if (source.adapter) {
    const text = await optionalEvidence(source.adapter.path);
    if (text === null) missingEvidence.push(source.adapter.path);
    else {
      const json = JSON.parse(text), adapter = source.adapter;
      membershipProvenance = json.provenance ?? null;
      expanded.records = rowsAt(json, adapter.rows).map(row => ({
        recordId: adapter.recordKey ? row?.[adapter.recordKey] : row,
        patientId: adapter.patientKey ? row?.[adapter.patientKey] : null,
        ...(adapter.foldKey ? { fold: row?.[adapter.foldKey] } : {}),
      }));
    }
  }
  for (const path of source.modelPaths ?? []) {
    const text = await optionalEvidence(path);
    if (text === null) { missingEvidence.push(path); continue; }
    const model = JSON.parse(text);
    modelMetadata.push({ path, schema: model.schema ?? null, source: model.source ?? null,
      diagnosis: model.diagnosis ?? null, subjects: model.subjects ?? null, records: model.records ?? null,
      windows: model.windows ?? null, fs: model.fs ?? null,
      preMs: model.preMs ?? null, postMs: model.postMs ?? null,
      phases: model.phases ?? null, declaredDurationMediansMs: model.population?.durationsMsP50 ?? null,
      arteries: model.arteries ? Object.keys(model.arteries) : null,
      membershipPresent: false,
      membershipNote: 'Inspected published model schema contains counts/coefficients, no executed patient manifest.' });
  }
  if (missingEvidence.length) expanded.membershipComplete = false;
  sourceSummaries.push({ id: source.id, derivativeVersion: source.derivativeVersion ?? null,
    evidencePaths: source.evidencePaths, adapter: source.adapter ?? null,
    membershipProvenance, coveredByExposedSource: source.coveredByExposedSource ?? null,
    identityNote: source.identityNote ?? null, missingReason: source.missingReason ?? null, missingEvidence, modelMetadata });
  sourceRecords.push(expanded);
}
for (const path of ['docs/fidelity-evidence-audit.md', 'scripts/audit-fidelity-evidence.mjs', 'scripts/lib/fidelity-evidence-ledger.mjs']) await readEvidence(path);
const ledger = auditEvidenceLedger({ ...inventory, sources: sourceRecords });
const recordUnions = {};
for (const source of sourceRecords.filter(s => s.role === 'exposed' && s.identityEvidence === 'observed')) {
  const namespace = `${source.dataset}@${source.version}`;
  const set = new Set(recordUnions[namespace] ?? []);
  for (const row of source.records) set.add(String(row.recordId));
  recordUnions[namespace] = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
const report = {
  ...ledger, baseCommit: inventory.baseCommit,
  auditScope: 'Repository evidence plus bounded local cache file-name inventory; no new reserve downloaded or inspected.',
  identityPolicy: inventory.identityPolicy,
  observedExposedRecordUnions: Object.fromEntries(Object.entries(recordUnions).map(([key, ids]) => [key, { recordCount: ids.length, recordIds: ids, independentPatientCount: null }])),
  provenance: sourceSummaries,
  cacheInventory: await Promise.all(inventory.cacheCandidates.map(cacheInventory)),
  inputSha256: Object.fromEntries([...hashes].sort(([a], [b]) => a.localeCompare(b))),
  limitations: inventory.limitations,
  decision: 'Do not promote a physiological correction on this inventory. Missing membership, reference eligibility and independent human review remain separate requirements.',
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, inventoryStatus: report.inventoryStatus, overlapStatus: report.overlapStatus,
  observedOverlapCount: report.observedOverlapCount, overlapCount: report.overlapCount,
  holdoutReady: report.holdoutReady, sources: report.sources.length, issues: report.issues.length }));
