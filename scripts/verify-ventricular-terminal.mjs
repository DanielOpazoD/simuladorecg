/** Independent paired endpoint audit; run from the repository root.
 * The counterfactual changes only the reviewed mode guard back to PR0's
 * `mode !== "atrial-conducted"`. It isolates the ventricular fix even if other
 * source changes have since landed. No historical fingerprints are rewritten. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const file = 'src/engine/realistic/beat.ts', source = readFileSync(file, 'utf8');
const guard = 'if (elapsed > phasesMs && mode === "atrial-blocked") {';
assert.equal(source.split(guard).length, 2, 'Expected one reviewed terminal mode guard');
const previous = source.replace(guard, 'if (elapsed > phasesMs && mode !== "atrial-conducted") {');
const out = '.sites-runtime/ventricular-terminal-handoff';
mkdirSync(out, { recursive: true });
const entry = `
export { addAtrial, addVentricular } from './src/engine/realistic/beat.ts';
export { realisticPatient } from './src/engine/realistic/engine.ts';
export { reconstruct, transform } from './src/engine/realistic/shape-model.ts';
export { fromPreset, presetById, PRESETS } from './src/presets/catalog.ts';
export { synthesize } from './src/engine/signal.ts';
export { secondaryRepolarization } from './src/engine/secondary-repolarization.ts';
export { qrsKernels } from './src/engine/morphology.ts';`;
const modules = [];
for (const before of [true, false]) {
  const outfile = path.join(out, before ? 'before.mjs' : 'after.mjs');
  await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    plugins: before ? [{ name: 'previous-terminal-guard', setup(b) {
      b.onLoad({ filter: /realistic[/\\]beat\.ts$/ }, args => ({ contents: previous, loader: 'ts', resolveDir: path.dirname(args.path) }));
    } }] : [],
  });
  modules.push(await import(pathToFileURL(path.resolve(outfile)).href));
}
const [before, after] = modules, fs = 1000;
const buffers = () => Array.from({ length: 8 }, () => new Float64Array(2000));
const widths = [[80, 250], [90, 250], [100, 250], [120, 200]];
const starts = [0.059, 0.05900001, 0.05925, 0.0595, 0.25];
const rows = [];
let trials = 0, changedTrials = 0, changedSamples = 0, maxDeltaMv = 0, blockedControls = 0;
for (const id of ['sinus', 'lbbb', 'rbbb', 'irbbb', 'lafb', 'lvh', 'old_inferior', 'old_anterior'])
  for (const seed of [1, 13, 157, 12066]) {
    const patient = after.realisticPatient({ ...after.fromPreset(after.presetById(id)), seed });
    const x = after.transform(patient.model, after.reconstruct(patient.model, patient.z), patient.ops);
    let patientChanges = 0, patientMaxMv = 0;
    for (const [qrsMs, sttMs] of widths) for (const start of starts) for (const taKeep of [0, 1, 2]) {
      const a = buffers(), b = buffers(), last = Math.floor(start * fs + (qrsMs + sttMs + patient.model.postMs) * fs / 1000);
      before.addVentricular(a, fs, start, qrsMs, sttMs, x, patient, taKeep);
      after.addVentricular(b, fs, start, qrsMs, sttMs, x, patient, taKeep);
      let changes = 0;
      for (let lead = 0; lead < 8; lead++) for (let i = 0; i < 2000; i++) {
        assert.ok(Number.isFinite(a[lead][i]) && Number.isFinite(b[lead][i]), `${id}/${seed}: nonfinite sample`);
        const delta = Math.abs(b[lead][i] - a[lead][i]);
        if (delta !== 0) {
          assert.equal(i, last, `${id}/${seed}: change outside the terminal index`);
          assert.ok(Math.abs(b[lead][i]) < 1e-12, `${id}/${seed}: terminal sample must be zero`);
          changes++; patientMaxMv = Math.max(patientMaxMv, delta);
        }
      }
      trials++; changedSamples += changes;
      if (changes) { changedTrials++; patientChanges++; }
    }
    // Same real template and numeric edge: a blocked P keeps exactly its tail.
    const a = buffers(), b = buffers();
    before.addAtrial(a, fs, 0.008, 100, 103, x, patient);
    after.addAtrial(b, fs, 0.008, 100, 103, x, patient);
    assert.deepEqual(b, a, `${id}/${seed}: blocked-P samples changed`);
    blockedControls++;
    maxDeltaMv = Math.max(maxDeltaMv, patientMaxMv);
    rows.push({ id, seed, postMs: patient.model.postMs, changedTrials: patientChanges, maxDeltaMicrovolts: patientMaxMv * 1000 });
  }
assert.ok(changedSamples > 0, 'The audit must exercise the bug, not merely unchanged traces');

// Actual catalogue output, with the acquisition operator left in place. Record
// proposed fingerprints only after comparing a pair whose sole change is the
// mode guard; never write or silently replace the repository's stored values.
function fingerprint(x) {
  let sum = 0, sumAbs = 0, sumSq = 0, moment = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]; sum += v; sumAbs += Math.abs(v); sumSq += v * v; moment += (i / x.length) * v;
    min = Math.min(min, v); max = Math.max(max, v);
  }
  return { n: x.length, sum, sumAbs, sumSq, moment, min, max,
    samples: Array.from({ length: Math.ceil(x.length / 100) }, (_, i) => x[i * 100]) };
}
const matches = (a, b) => a.n === b.n && a.samples.length === b.samples.length &&
  ['sum', 'sumAbs', 'sumSq', 'moment', 'min', 'max'].every(k => Math.abs(a[k] - b[k]) <= 1e-4 + 1e-6 * Math.abs(b[k])) &&
  a.samples.every((v, i) => Math.abs(v - b.samples[i]) <= 1e-5);
const stored = JSON.parse(readFileSync('tests/__snapshots__/catalog-fingerprints.json', 'utf8'));
const prQrs = 'tests/__snapshots__/catalog-pr-qrs-v2.json';
if (existsSync(prQrs)) Object.assign(stored, JSON.parse(readFileSync(prQrs, 'utf8')));
const catalogue = [], proposedFingerprints = {};
for (const preset of after.PRESETS.filter(p => p.strategy !== 'pending')) {
  const c = { ...after.fromPreset(preset), acquisition: 'ideal' };
  const a = before.synthesize(c, 10), b = after.synthesize(c, 10);
  assert.deepEqual(b.events, a.events, `${preset.id}: changed events`);
  assert.deepEqual(b.warnings, a.warnings, `${preset.id}: changed warnings`);
  const { axis: oldAxis, ...oldMetrics } = a.truth, { axis: newAxis, ...newMetrics } = b.truth;
  assert.deepEqual(newMetrics, oldMetrics, `${preset.id}: changed rate or interval metrics`);
  assert.equal(newAxis === null, oldAxis === null, `${preset.id}: changed axis availability`);
  const axisDeltaDeg = newAxis === null ? 0 : Math.abs(((newAxis - oldAxis + 540) % 360) - 180);
  assert.ok(Number.isFinite(axisDeltaDeg) && axisDeltaDeg < 0.5, `${preset.id}: excessive integrated axis change`);
  let samplesChanged = 0, maxMv = 0;
  for (const lead of Object.keys(a.leads)) for (let i = 0; i < a.leads[lead].length; i++) {
    const delta = Math.abs(b.leads[lead][i] - a.leads[lead][i]);
    if (delta !== 0) samplesChanged++;
    maxMv = Math.max(maxMv, delta);
  }
  const secondary = a.events.beats.some(beat => after.secondaryRepolarization(c, beat, after.qrsKernels(c, beat)).mode !== 'none');
  const checkedByCatalogue = c.rhythm !== 'af' && c.conduction !== 'wpw' && !secondary;
  const key = preset.id === 'lpfb' ? 'lpfb-source-v2' : preset.id;
  const previousFingerprint = fingerprint(a.leads.II), candidateFingerprint = fingerprint(b.leads.II);
  const storedMatchesBefore = checkedByCatalogue ? matches(previousFingerprint, stored[key]) : null;
  if (checkedByCatalogue && !matches(candidateFingerprint, previousFingerprint))
    proposedFingerprints[key] = { storedMatchesBefore, previous: previousFingerprint, candidate: candidateFingerprint };
  catalogue.push({ id: preset.id, samplesChanged, maxOutputMicrovolts: maxMv * 1000, axisDeltaDeg, checkedByCatalogue, storedMatchesBefore });
}
const hash = value => createHash('sha256').update(value).digest('hex');
const revised = 'tests/__snapshots__/catalog-post-t-v3.json';
if (existsSync(revised)) {
  const references = JSON.parse(readFileSync(revised, 'utf8'));
  assert.deepEqual(Object.keys(references).sort(), Object.keys(proposedFingerprints).sort(), 'Unexpected terminal reference inventory');
  for (const id of Object.keys(references)) {
    assert.ok(proposedFingerprints[id].storedMatchesBefore, `${id}: predecessor no longer matches the preserved reference`);
    assert.ok(matches(proposedFingerprints[id].candidate, references[id]), `${id}: terminal reference differs`);
  }
}
const report = { comparison: 'single-terminal-mode-guard', runtime: process.version, platform: process.platform,
  sourceSha256: hash(source), counterfactualSha256: hash(previous), fs, leads: ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
  n: 2000, widthsMs: widths, startsSeconds: starts, taKeep: [0, 1, 2],
  trials, changedTrials, changedSamples, maxDeltaMicrovolts: maxDeltaMv * 1000, blockedControls,
  equalOutsideTerminalIndices: true, clinicalValidation: false, rows,
  catalogue, proposedFingerprints };
writeFileSync(`${out}/paired.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined, catalogue: undefined, proposedFingerprints: undefined,
  changedCataloguePresets: catalogue.filter(p => p.samplesChanged).length,
  candidateFingerprintIds: Object.keys(proposedFingerprints) }, null, 2));
