/** Paired engineering audit of final samples. This evaluator never tunes the
 * generator, supplies truth to the analyzer, or rewrites an acceptance limit. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { qrsMidpointSeconds } from './lib/qrs-event-reference.mjs';
import { matchQrsEvents } from '../tests/reference/ludb/load-ludb.mjs';
import { quietAcquisitionPlugin } from './lib/quiet-acquisition-experiment.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const output = path.resolve(arg('--output') ?? path.join(ROOT, '.sites-runtime/acquisition-cleanliness'));
const protocolFile = path.join(ROOT, 'benchmarks/acquisition-cleanliness/protocol.json');
const legacyFile = path.resolve(arg('--legacy-hashes') ?? path.join(ROOT, 'benchmarks/acquisition-cleanliness/legacy-samples.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const protocolBytes = await readFile(protocolFile), protocol = JSON.parse(protocolBytes);
const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const VOLTAGE = ['baselineMv', 'jMv', 'j60Mv', 'qrsPeakToPeakMv', 'tPeakMv'];
const AREA = ['tAbsoluteAreaMvS'];
const median = values => { const a = values.filter(Number.isFinite).sort((a, b) => a - b); return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : null; };
const hashSignal = (s, order = LEADS) => sha(Buffer.concat(order.map(l => Buffer.from(s.leads[l].buffer, s.leads[l].byteOffset, s.leads[l].byteLength))));
const equalJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
// Never overwrite a previous run, including an adverse result.
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const runtime = path.join(output, '_runtime');
await mkdir(runtime, { recursive: true });
const report = {
  schemaVersion: 1, protocol, protocolSha256: sha(protocolBytes), evaluatorSha256: sha(await readFile(fileURLToPath(import.meta.url))), createdAt: new Date().toISOString(),
  units: { samples: 'mV', time: 'seconds', intervals: 'milliseconds', area: 'mV.seconds' },
  interpretation: {
    clinicalValidation: false, holdout: 'Synthetic reserve seeds, not independent patients',
    analysis: 'analyzeSamples receives only fs and final lead arrays; model audit is not called',
    references: 'Evaluator-only event midpoint and assigned QRS/QT durations; not clinical R peaks or independently annotated durations',
    morphology: 'Event-anchored baseline onset−35 to−20 ms; QRS onset to J; repolarization J+40 ms to assigned QT end. T peak is the signed absolute extremum in that window, not clinical T delineation.',
    unsupported: 'Truncated/overlapping windows and absent event durations are retained as exclusions; missing measures are never zero errors',
    comparison: 'Every supported morphology window is checked; analysis regressions are paired within recording and aggregated within family/cohort/filter without offsetting gains elsewhere',
  },
  sourceHashes: {}, legacySamples: [], rows: [], strata: [], failures: [], softwareExecutionFailures: [],
};
function failure(domain, location, details) { report.failures.push({ domain, location, ...details }); }
function control(row, name, passed, details = {}) {
  row.negativeControls.push({ name, passed, ...details });
  if (!passed) failure('negative-control', row.key, { name, ...details });
}
function centeredTexture(actual, ideal) {
  const d = Array.from(actual, (v, i) => v - ideal[i]);
  assert.ok(d.length && d.every(Number.isFinite), 'Nonfinite or empty final residual');
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return { rmsMv: Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length), peakMv: Math.max(...d.map(Math.abs)), meanMv: mean };
}
function references(signal) {
  const supported = [], unsupported = [];
  signal.events.beats.forEach((b, index) => {
    if (!(Number.isFinite(b.time) && Number.isFinite(b.qrs) && b.qrs > 0 && b.qrs < 1)) { unsupported.push({ index, reason: 'absent or invalid event QRS duration' }); return; }
    const anchor = qrsMidpointSeconds(b);
    if (anchor < .2 || anchor >= signal.duration - .2) { unsupported.push({ index, reason: 'event anchor outside analysis interior' }); return; }
    supported.push({ ...b, index, anchor });
  });
  return { supported, unsupported };
}
function analyze(signal, refs, analyzeSamples) {
  const m = analyzeSamples({ fs: signal.fs, leads: signal.leads });
  const peaks = m.detectedPeaks.filter(t => t >= .2 && t < signal.duration - .2);
  const matching = matchQrsEvents(refs.supported.map(b => b.anchor), peaks, protocol.analysisGate.eventToleranceSeconds);
  const errors = matching.pairs.map(pair => {
    const b = refs.supported.find(b => b.anchor === pair.reference), d = m.beats.find(b => b.peak === pair.detected);
    return { referenceIndex: b.index, kind: b.kind, ...pair, qrsMs: d ? d.qrs - b.qrs * 1000 : null,
      qtMs: d?.qt != null && Number.isFinite(b.qt) ? d.qt - b.qt * 1000 : null,
      onsetMs: d ? (d.onset - b.time) * 1000 : null, offsetMs: d ? (d.offset - b.time - b.qrs) * 1000 : null,
      unsupported: !d ? 'matched peak has no delineated beat' : !Number.isFinite(b.qt) ? 'event has no QT duration' : d.qt === null ? 'analyzer QT unavailable' : null };
  });
  const rr = refs.supported;
  const nominal = { hr: rr.length >= 2 ? 60 * (rr.length - 1) / (rr.at(-1).anchor - rr[0].anchor) : null,
    qrs: median(rr.map(b => b.qrs * 1000)), qt: median(rr.flatMap(b => Number.isFinite(b.qt) ? [b.qt * 1000] : [])) };
  const limits = { hr: protocol.analysisGate.hrReviewBpm, qrs: protocol.analysisGate.qrsReviewMs, qt: protocol.analysisGate.qtReviewMs };
  const estimates = Object.fromEntries(['hr', 'qrs', 'qt'].map(key => {
    const value = m[key], status = m.evidence[key].status, reference = nominal[key];
    const error = value !== null && reference !== null ? value - reference : null;
    if (error !== null) assert.ok(Number.isFinite(error), 'Nonfinite analyzer estimate');
    return [key, { value, status, reference, error, usableCorrect: status === 'usable' && error !== null && Math.abs(error) <= limits[key],
      usableErroneous: status === 'usable' && error !== null && Math.abs(error) > limits[key],
      unsupported: reference === null ? 'insufficient event reference' : value === null ? 'analyzer unavailable' : null }];
  }));
  return { tp: matching.tp, fp: matching.fp, fn: matching.fn, outsideWindow: m.detectedPeaks.length - peaks.length,
    matching, beatErrors: errors, estimates, unsupportedReferences: refs.unsupported };
}
function morphology(row, signals, morphologyMetrics) {
  const [legacy, quiet, ideal] = signals, beats = ideal.events.beats;
  for (let index = 0; index < beats.length; index++) {
    const b = beats[index], next = beats[index + 1], previous = beats[index - 1];
    const end = b.time + b.qt, j = b.time + b.qrs;
    let reason = null;
    if (![b.time, b.qrs, b.qt].every(Number.isFinite) || !(b.qt > b.qrs + .04 && b.qrs > 0)) reason = 'invalid or absent event durations';
    else if (b.time - .035 < 0 || Math.max(end, j + .06) > (ideal.leads.I.length - 1) / ideal.fs) reason = 'truncated window';
    else if (next && Math.max(end, j + .06) >= next.time - .04) reason = 'repolarization overlaps next QRS guard';
    else if (previous && Number.isFinite(previous.qt) && previous.time + previous.qt >= b.time - .035) reason = 'baseline overlaps previous repolarization';
    if (reason) { row.morphology.push({ eventIndex: index, kind: b.kind, status: 'unsupported', reason }); continue; }
    const windows = { baseline: [b.time - .035, b.time - .020], qrs: [b.time, j], t: [j + .040, end] };
    const byLead = {};
    for (const lead of LEADS) {
      const values = signals.map(s => morphologyMetrics(s.leads[lead], s.fs, windows));
      const errors = {};
      for (const metric of [...VOLTAGE, ...AREA]) {
        assert.ok(values.every(v => Number.isFinite(v[metric])), `Nonfinite morphology metric ${metric}`);
        const oldError = values[0][metric] - values[2][metric], newError = values[1][metric] - values[2][metric];
        const worsening = Math.abs(newError) - Math.abs(oldError);
        const limit = AREA.includes(metric) ? protocol.morphologyGate.areaAbsoluteErrorWorseningMvS : protocol.morphologyGate.perWindowAbsoluteErrorWorseningMv;
        const passed = worsening <= limit;
        errors[metric] = { legacy: oldError, quiet: newError, worsening, limit, passed };
        if (!passed) failure('morphology', row.key, { eventIndex: index, kind: b.kind, lead, metric, ...errors[metric] });
      }
      // These unsupported width observations are retained, not zeroed or gated.
      byLead[lead] = { ideal: values[2], legacy: values[0], quiet: values[1], errors };
    }
    row.morphology.push({ eventIndex: index, kind: b.kind, status: 'measured', windows, byLead });
  }
}
try {
  const productBundle = path.join(runtime, 'product.mjs'), analyzerBundle = path.join(runtime, 'analyzer.mjs');
  const built = await build({ stdin: { contents: `export { synthesize } from './src/engine/signal.ts'; export { PRESETS, fromPreset, presetById } from './src/presets/catalog.ts'; export { normalizeCase } from './src/engine/types.ts'; export { registerShapeModel } from './src/engine/realistic/shape-model.ts'; export { registerIschemiaModel } from './src/engine/realistic/ischemia.ts'; export { morphologyMetrics } from './tests/support/morphology-metrics.ts';`, resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: productBundle, metafile: true, logLevel: 'error', plugins: [quietAcquisitionPlugin(ROOT, provenance => { report.experiment = provenance; })] });
  const analyzerBuild = await build({ entryPoints: [path.join(ROOT, 'src/engine/sample-analysis.ts')], bundle: true, platform: 'node', format: 'esm', outfile: analyzerBundle, metafile: true, logLevel: 'error' });
  assert.ok(!Object.keys(analyzerBuild.metafile.inputs).some(f => /\/(signal|rhythm|reference|model-audit)\.ts$/.test(f.replaceAll('\\', '/'))), 'Analyzer leaked source reference');
  for (const file of new Set([...Object.keys(built.metafile.inputs), ...Object.keys(analyzerBuild.metafile.inputs)]))
    if (file !== '<stdin>') report.sourceHashes[file] = sha(await readFile(path.resolve(ROOT, file)));
  for (const file of ['scripts/lib/qrs-event-reference.mjs', 'tests/reference/ludb/load-ludb.mjs', 'scripts/lib/quiet-acquisition-experiment.mjs'])
    report.sourceHashes[file] = sha(await readFile(path.join(ROOT, file)));
  const E = await import(pathToFileURL(productBundle).href), { analyzeSamples } = await import(pathToFileURL(analyzerBundle).href);
  const modelDir = path.join(ROOT, 'src/engine/realistic/models');
  for (const name of await readdir(modelDir)) if (name.endsWith('.json')) {
    const file = `src/engine/realistic/models/${name}`;
    const bytes = await readFile(path.join(ROOT, file));
    report.sourceHashes[file] = sha(bytes);
    E.registerShapeModel(name.slice(0, -5), JSON.parse(bytes));
  }
  const ischemiaFile = 'src/engine/realistic/ischemia/ischemia-model.json';
  const ischemiaBytes = await readFile(path.join(ROOT, ischemiaFile));
  report.sourceHashes[ischemiaFile] = sha(ischemiaBytes);
  E.registerIschemiaModel(JSON.parse(ischemiaBytes));
  report.evaluatedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  report.worktreeDirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  const frozen = await readJson(legacyFile);
  report.legacyFixtureSha256 = sha(await readFile(legacyFile));
  assert.equal(frozen.sourceCommit, protocol.baselineCommit, 'Historical sample fixture has wrong base');
  for (const fixture of frozen.fixtures) {
    const original = E.synthesize(fixture.case, protocol.durationSeconds);
    const imported = E.synthesize(E.normalizeCase(JSON.parse(JSON.stringify(fixture.case))), protocol.durationSeconds);
    const explicit = E.synthesize({ ...fixture.case, acquisitionProfile: protocol.legacyProfile }, protocol.durationSeconds);
    const hashes = { absent: hashSignal(original, fixture.leadOrder), imported: hashSignal(imported, fixture.leadOrder), explicit: hashSignal(explicit, fixture.leadOrder) };
    const passed = Object.values(hashes).every(h => h === fixture.samplesSha256);
    report.legacySamples.push({ name: fixture.case.name, seed: fixture.case.seed, filter: fixture.case.filter, expected: fixture.samplesSha256, hashes, passed });
    if (!passed) failure('historical-samples', `${fixture.case.name}/${fixture.case.filter}`, { hashes, expected: fixture.samplesSha256 });
  }
  const scenarios = E.PRESETS.filter(p => p.strategy !== 'pending').map(p => ({ cohort: 'catalog', family: p.id, case: E.fromPreset(p) }));
  for (const family of protocol.families) for (const seed of protocol.reserveSeeds) for (const filter of protocol.filters)
    scenarios.push({ cohort: 'synthetic-reserve', family, case: { ...E.fromPreset(E.presetById(family)), seed, filter } });
  report.expectedRecordings = scenarios.length;
  for (const scenario of scenarios) {
    const c = scenario.case, key = `${scenario.cohort}/${scenario.family}/${c.seed}/${c.filter}`;
    const row = { key, cohort: scenario.cohort, family: scenario.family, preset: c.presetId, seed: c.seed, filter: c.filter,
      negativeControls: [], texture: {}, morphology: [], analysis: null };
    report.rows.push(row);
    try {
      const legacyCase = { ...c, acquisition: 'realistic', acquisitionProfile: protocol.legacyProfile };
      const quietCase = { ...legacyCase, acquisitionProfile: protocol.candidate.profile };
      const idealCase = { ...legacyCase, acquisition: 'ideal' };
      const legacy = E.synthesize(legacyCase, protocol.durationSeconds), quiet = E.synthesize(quietCase, protocol.durationSeconds), ideal = E.synthesize(idealCase, protocol.durationSeconds);
      const idealQuiet = E.synthesize({ ...idealCase, acquisitionProfile: protocol.candidate.profile }, protocol.durationSeconds);
      const repeated = E.synthesize(quietCase, protocol.durationSeconds);
      row.hashes = { legacy: hashSignal(legacy), quiet: hashSignal(quiet), ideal: hashSignal(ideal) };
      control(row, 'ideal profile identity', hashSignal(idealQuiet) === row.hashes.ideal);
      control(row, 'same-seed repeatability', hashSignal(repeated) === row.hashes.quiet);
      control(row, 'event and truth identity', [quiet, ideal, idealQuiet].every(s => equalJson(s.events, legacy.events) && equalJson(s.truth, legacy.truth)));
      for (const lead of LEADS) {
        const before = centeredTexture(legacy.leads[lead], ideal.leads[lead]), after = centeredTexture(quiet.leads[lead], ideal.leads[lead]);
        const rmsRatio = before.rmsMv > 0 ? after.rmsMv / before.rmsMv : null, peakRatio = before.peakMv > 0 ? after.peakMv / before.peakMv : null;
        const slack = protocol.textureGate.quantizationSlackMv;
        const passed = before.rmsMv > 0 && after.rmsMv >= before.rmsMv * protocol.textureGate.rmsRatioMin - slack && after.rmsMv <= before.rmsMv * protocol.textureGate.rmsRatioMax + slack && after.peakMv <= before.peakMv * protocol.textureGate.peakRatioMax + slack;
        row.texture[lead] = { legacy: before, quiet: after, rmsRatio, peakRatio, passed };
        if (!passed) failure('texture', key, { lead, ...row.texture[lead] });
      }
      // A single simultaneous probe covers all four independent manual artifact
      // sources. It does not assert clinical plausibility of the combined probe.
      const manual = { ...c.artifacts, baseline: .2, muscle: .2, mains: .2, loose: .2 };
      const manualLegacy = E.synthesize({ ...legacyCase, artifacts: manual }, protocol.durationSeconds);
      const manualQuiet = E.synthesize({ ...quietCase, artifacts: manual }, protocol.durationSeconds);
      const manualByLead = {};
      for (const lead of LEADS) {
        let maximumDeltaDifferenceMv = 0;
        for (let i = 0; i < legacy.leads[lead].length; i++)
          maximumDeltaDifferenceMv = Math.max(maximumDeltaDifferenceMv, Math.abs((manualQuiet.leads[lead][i] - quiet.leads[lead][i]) - (manualLegacy.leads[lead][i] - legacy.leads[lead][i])));
        // Four independently rounded terms give 4 × 0.5 µV per independent
        // channel. Propagate absolute limb coefficients and the final rounding:
        // III = II−I (already integer µV); aVR = −(I+II)/2; aVL/aVF = A−B/2.
        // This is a numerical identity bound, not a changed texture tolerance.
        const allowedQuantizationMv = ['aVL', 'aVF'].includes(lead) ? .005 : ['III', 'aVR'].includes(lead) ? .004 : .002;
        manualByLead[lead] = { maximumDeltaDifferenceMv, allowedQuantizationMv, passed: maximumDeltaDifferenceMv <= allowedQuantizationMv + 1e-12 };
      }
      control(row, 'manual artifacts remain independent of the floor profile', Object.values(manualByLead).every(v => v.passed), { byLead: manualByLead });
      morphology(row, [legacy, quiet, ideal], E.morphologyMetrics);
      const refs = references(ideal), oldAnalysis = analyze(legacy, refs, analyzeSamples), newAnalysis = analyze(quiet, refs, analyzeSamples);
      const transitions = ['hr', 'qrs', 'qt'].map(metric => ({ metric,
        additionalUsableErroneous: Number(newAnalysis.estimates[metric].usableErroneous && !oldAnalysis.estimates[metric].usableErroneous),
        lostUsableCorrect: Number(oldAnalysis.estimates[metric].usableCorrect && !newAnalysis.estimates[metric].usableCorrect) }));
      row.analysis = { legacy: oldAnalysis, quiet: newAnalysis, transitions,
        additionalFalsePositives: Math.max(0, newAnalysis.fp - oldAnalysis.fp), additionalFalseNegatives: Math.max(0, newAnalysis.fn - oldAnalysis.fn) };
    } catch (error) { row.executionError = String(error.stack ?? error); report.softwareExecutionFailures.push({ key, error: row.executionError }); }
  }
  const strata = new Map();
  for (const row of report.rows) {
    const key = `${row.cohort}/${row.family}/${row.filter}`;
    if (!strata.has(key)) strata.set(key, { key, cohort: row.cohort, family: row.family, filter: row.filter, recordings: 0, measuredMorphologyWindows: 0, unsupportedMorphologyWindows: 0, additionalFalsePositives: 0, additionalFalseNegatives: 0, additionalUsableErroneousEstimates: 0, lostUsableCorrectEstimates: 0, executionFailures: 0 });
    const s = strata.get(key); s.recordings++; s.executionFailures += Number(!!row.executionError);
    s.measuredMorphologyWindows += row.morphology.filter(w => w.status === 'measured').length;
    s.unsupportedMorphologyWindows += row.morphology.filter(w => w.status === 'unsupported').length;
    if (row.analysis) {
      s.additionalFalsePositives += row.analysis.additionalFalsePositives; s.additionalFalseNegatives += row.analysis.additionalFalseNegatives;
      s.additionalUsableErroneousEstimates += row.analysis.transitions.reduce((sum, t) => sum + t.additionalUsableErroneous, 0);
      s.lostUsableCorrectEstimates += row.analysis.transitions.reduce((sum, t) => sum + t.lostUsableCorrect, 0);
    }
  }
  for (const s of strata.values()) {
    const limits = { additionalFalsePositives: protocol.analysisGate.maximumAdditionalFalsePositivesPerFamily,
      additionalFalseNegatives: protocol.analysisGate.maximumAdditionalFalseNegativesPerFamily,
      additionalUsableErroneousEstimates: protocol.analysisGate.maximumAdditionalUsableErroneousEstimatesPerFamily,
      lostUsableCorrectEstimates: protocol.analysisGate.maximumLostUsableCorrectEstimatesPerFamily };
    for (const [metric, limit] of Object.entries(limits)) if (s[metric] > limit) failure('analysis', s.key, { metric, value: s[metric], limit });
    report.strata.push(s);
  }
} catch (error) { report.softwareExecutionFailures.push({ key: 'audit', error: String(error.stack ?? error) }); }
report.summary = { recordings: report.rows.length, expectedRecordings: report.expectedRecordings ?? null,
  historicalFixtures: report.legacySamples.length, failedHistoricalFixtures: report.legacySamples.filter(r => !r.passed).length,
  negativeControls: report.rows.reduce((n, r) => n + r.negativeControls.length, 0),
  failedNegativeControls: report.rows.reduce((n, r) => n + r.negativeControls.filter(c => !c.passed).length, 0),
  failuresByDomain: Object.fromEntries([...new Set(report.failures.map(f => f.domain))].map(d => [d, report.failures.filter(f => f.domain === d).length])),
  softwareExecutionFailures: report.softwareExecutionFailures.length };
report.passed = report.rows.length === report.expectedRecordings && !report.failures.length && !report.softwareExecutionFailures.length;
report.defaultPromotionAccepted = report.passed;
report.clinicalValidation = false;
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(output, 'summary.json'), JSON.stringify({ protocolSha256: report.protocolSha256, ...report.summary, passed: report.passed, defaultPromotionAccepted: report.defaultPromotionAccepted, clinicalValidation: false, strata: report.strata, failures: report.failures, softwareExecutionFailures: report.softwareExecutionFailures }, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.summary, passed: report.passed, defaultPromotionAccepted: report.defaultPromotionAccepted, clinicalValidation: false }, null, 2));
if (!report.passed) process.exitCode = 1;
