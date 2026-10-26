/** Offline characterization of final production samples. Never adjusts the model. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocolPath = resolve(root, 'benchmarks/fidelity/ventricular-timing-protocol.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const protocol = JSON.parse(readFileSync(protocolPath, 'utf8'));

/** A sample-only energy moment. No renderer, model T apex or T end is consulted. */
export function energyFeatures(channels, fs, start, end, baseline = channels.map(() => 0)) {
  if (!Number.isFinite(fs) || fs <= 0 || !channels.length || baseline.length !== channels.length ||
      !baseline.every(Number.isFinite) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw Error('Invalid measurement inputs');
  const lo = Math.ceil(start * fs), hi = Math.floor(end * fs);
  if (lo < 0 || hi <= lo || channels.some(c => hi > c.length)) throw Error('Incomplete measurement window');
  let energy = 0, moment = 0, peak = 0, peakIndex = lo;
  for (let i = lo; i < hi; i++) {
    let value = 0;
    for (let c = 0; c < channels.length; c++) {
      if (!Number.isFinite(channels[c][i])) throw Error('Nonfinite sample');
      value += (channels[c][i] - baseline[c]) ** 2;
    }
    energy += value; moment += value * i / fs;
    if (value > peak) { peak = value; peakIndex = i; }
  }
  if (![energy, moment, peak].every(Number.isFinite)) throw Error('Nonfinite measurement accumulation');
  if (energy / fs < protocol.sampleMeasurement.minimumEnergyMv2Seconds) return null;
  return { energyMv2Seconds: energy / fs, centroidSeconds: moment / energy,
    peakSeconds: peakIndex / fs, peakVectorMv: Math.sqrt(peak) };
}

export function measureFinalBeat(signal, beat, nextBeat) {
  if (![beat.time, beat.qrs].every(Number.isFinite) || beat.qrs <= 0 ||
      (nextBeat !== undefined && nextBeat !== null && !Number.isFinite(nextBeat.time)))
    throw Error('Invalid event reference');
  const p = protocol.sampleMeasurement, j = beat.time + beat.qrs;
  const start = j + p.windowAfterJMs[0] / 1000, end = j + p.windowAfterJMs[1] / 1000;
  const guard = p.boundaryAndNextQrsGuardMs / 1000;
  if (beat.time < .2 || end > signal.duration - guard) return { excluded: 'record boundary' };
  if (nextBeat && end + guard >= nextBeat.time) return { excluded: 'fixed window reaches next QRS' };
  const channels = p.leads.map(l => signal.leads[l]);
  const baseline = channels.map(c => {
    const lo = Math.ceil((beat.time - p.baselineBeforeQrsMs[0] / 1000) * signal.fs);
    const hi = Math.floor((beat.time - p.baselineBeforeQrsMs[1] / 1000) * signal.fs);
    let sum = 0; for (let i = lo; i < hi; i++) sum += c[i];
    return sum / (hi - lo);
  });
  const m = energyFeatures(channels, signal.fs, start, end, baseline);
  return m ? { ...m, centroidAfterJMs: (m.centroidSeconds - j) * 1000,
    peakAfterJMs: (m.peakSeconds - j) * 1000, baselineMv: baseline } : { excluded: 'zero or negligible post-J energy' };
}

export async function loadEngine() {
  const entry = `export { synthesize } from './src/engine/signal';
    export { fromPreset, patchCase, presetById } from './src/presets/catalog';
    export { realisticEctopicPatient } from './src/engine/realistic/engine';
    export { registerShapeModel } from './src/engine/realistic/shape-model';
    export { learnedEctopicModel } from './src/engine/realistic/scope';`;
  const result = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const engine = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  for (const code of ['PVC', 'VPACE']) engine.registerShapeModel(code,
    JSON.parse(readFileSync(resolve(root, `src/engine/realistic/models/${code}.json`), 'utf8')));
  return engine;
}

export function auditCase(engine, family, seed, hr, extra = {}) {
  const preset = engine.presetById(family.preset);
  if (!preset) throw Error(`Missing preset ${family.preset}`);
  const c = engine.patchCase(engine.fromPreset(preset), { seed, hr, acquisition: protocol.acquisition,
    filter: protocol.filter, pAmp: protocol.pAmplitudeMv, variability: protocol.variability,
    artifacts: { baseline: 0, muscle: 0, mains: 0, loose: 0, reversed: false }, ...extra });
  return c;
}

const range = xs => xs.length ? Math.max(...xs) - Math.min(...xs) : null;
const median = xs => xs.length ? [...xs].sort((a,b) => a-b)[Math.floor(xs.length / 2)] : null;

export function characterize(engine, family, seed, hr, extra = {}) {
  const cell = { family: family.preset, kind: family.kind, seed, requestedRateBpm: hr,
    actualRateBpm: null, extra, clinicalValidation: false };
  try {
    const c = auditCase(engine, family, seed, hr, extra);
    cell.actualRateBpm = c.hr;
    const model = engine.learnedEctopicModel(c, family.kind);
    if (!model) throw Error('Requested learned ectopic route unavailable; no silent fallback');
    const patient = engine.realisticEctopicPatient(c, family.kind);
    const signal = engine.synthesize(c, protocol.durationSeconds);
    const sampleHash = createHash('sha256');
    for (const lead of protocol.sampleMeasurement.leads) sampleHash.update(Buffer.from(signal.leads[lead].buffer,
      signal.leads[lead].byteOffset, signal.leads[lead].byteLength));
    const observations = signal.events.beats.flatMap((b, i, beats) => b.kind !== family.kind ? [] : [{
      generator: { timeSeconds: b.time, rrSeconds: b.rr, adaptedRrSeconds: b.adaptedRR,
        qrsMs: b.qrs * 1000, sttMs: (b.qt - b.qrs) * 1000, ownDurations: b.ownDurations,
        lowerSttClamp: Math.abs(b.qt - b.qrs - .12) < 1e-10,
        upperSttClamp: Math.abs(b.qt - b.qrs - .5) < 1e-10 },
      samples: measureFinalBeat(signal, b, beats[i + 1]),
    }]);
    return { ...cell, status: 'observed', model, samplesSha256: sampleHash.digest('hex'), fsHz: signal.fs,
      patient: { qrsMs: patient.qrsMs, sttMs: patient.sttMs, rawFieldNamedRrMs: patient.rrMs,
        rrUnitFromBuilder: 'seconds', rrIsLongitudinalHistory: false }, observations,
      summary: { events: observations.length, measured: observations.filter(o => !o.samples.excluded).length,
        sttRangeMs: range(observations.map(o => o.generator.sttMs)),
        adaptedRrRangeSeconds: range(observations.map(o => o.generator.adaptedRrSeconds)),
        medianCentroidAfterJMs: median(observations.filter(o => !o.samples.excluded).map(o => o.samples.centroidAfterJMs)) } };
  } catch (error) { return { ...cell, status: 'rejected', reason: error.message }; }
}

export function inactiveQtcControl(engine, family, seed) {
  try {
    const signals = protocol.negativeControls.inactiveQtcMs.map(qtc => engine.synthesize(auditCase(engine, family, seed, 60, { qtc }), protocol.durationSeconds));
    let maxDifferenceMv = 0;
    for (const lead of protocol.sampleMeasurement.leads) {
      const a = signals[0].leads[lead], b = signals[1].leads[lead];
      if (!a.length || a.length !== b.length) throw Error('Mismatched or empty control samples');
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw Error('Nonfinite control sample');
        maxDifferenceMv = Math.max(maxDifferenceMv, Math.abs(a[i] - b[i]));
      }
    }
    return { family: family.preset, seed, status: 'observed', maxDifferenceMv,
      pass: maxDifferenceMv <= protocol.negativeControls.isolatedVentricularAndPacedMaxSampleDifferenceMv };
  } catch (error) {
    return { family: family.preset, seed, status: 'rejected', reason: error.message,
      maxDifferenceMv: null, pass: false };
  }
}

/** Software execution failures fail CI; valid but excluded windows only reduce coverage. */
export function softwareControlsPass(unchanged, cells, inactiveControls, ownDurationControls) {
  return unchanged && cells.length > 0 && cells.every(c => c.status === 'observed') &&
    inactiveControls.length > 0 && inactiveControls.every(c => c.pass === true) &&
    ownDurationControls.length > 0 && ownDurationControls.every(c => c.pass === true);
}

export async function runAudit(output) {
  if (!output) throw Error('Use --output with a fresh JSON path outside the repository');
  output = resolve(output);
  const rel = relative(root, output);
  if (!rel.startsWith('..') || existsSync(output)) throw Error('Output must be fresh and outside repository');
  const tracked = execFileSync('git', ['ls-files', 'src/engine', 'src/presets', 'scripts/fidelity/build_pvc_model.py',
    'scripts/fidelity/build_paced_model.py', 'scripts/fidelity/build_shape_model.py'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
  const sourceHashes = Object.fromEntries(tracked.map(p => [p, hash(readFileSync(resolve(root, p)))]));
  const engine = await loadEngine();
  const cells = [];
  for (const family of protocol.families) for (const seed of protocol.seeds) for (const hr of protocol.ratesBpm)
    cells.push(characterize(engine, family, seed, hr));
  const historyCells = [];
  const hp = protocol.historyProbe, family = protocol.families.find(f => f.preset === hp.family);
  for (const seed of protocol.seeds) for (const coupling of hp.couplings) for (const variability of hp.variabilities)
    historyCells.push(characterize(engine, family, seed, hp.rateBpm, { coupling, variability }));
  const inactiveControls = [];
  for (const f of protocol.families.filter(f => f.kind !== 'pvc')) for (const seed of protocol.seeds)
    inactiveControls.push(inactiveQtcControl(engine, f, seed));
  const ownDurationControls = protocol.families.filter(f => f.kind !== 'ventricular').flatMap(f => protocol.seeds.map(seed => {
    const rows = [...cells, ...historyCells].filter(c => c.family === f.preset && c.seed === seed && c.status === 'observed');
    const observedRangeMs = range(rows.flatMap(c => c.observations.map(o => o.generator.sttMs)));
    return { family: f.preset, seed, observedCells: rows.length, observedRangeMs,
      pass: observedRangeMs !== null && observedRangeMs <= protocol.negativeControls.pvcAndPacedOwnSttMaxRangeMs };
  }));
  const families = protocol.families.map(f => {
    const rows = cells.filter(c => c.family === f.preset), observed = rows.filter(c => c.status === 'observed');
    return { family: f.preset, cells: rows.length, rejected: rows.filter(c => c.status === 'rejected').length,
      measuredBeats: observed.reduce((n,c) => n+c.summary.measured,0),
      excludedBeats: observed.reduce((n,c) => n+c.summary.events-c.summary.measured,0),
      upperSttClampBeats: observed.flatMap(c => c.observations).filter(o => o.generator.upperSttClamp).length,
      byRate: protocol.ratesBpm.map(rate => ({rateBpm: rate,
        medianCentroidAfterJMs: median(observed.filter(c => c.actualRateBpm === rate && c.summary.medianCentroidAfterJMs !== null).map(c => c.summary.medianCentroidAfterJMs))})) };
  });
  const unchanged = tracked.every(p => hash(readFileSync(resolve(root,p))) === sourceHashes[p]);
  const report = { schemaVersion: 1, createdAt: new Date().toISOString(),
    baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim(),
    protocolSha256: hash(readFileSync(protocolPath)), scriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    sourceHashes, sourceUnchangedDuringAudit: unchanged, protocol, families, cells, historyCells,
    inactiveControls, ownDurationControls,
    softwareExecutionFailures: [...cells, ...historyCells].filter(c => c.status === 'rejected').length +
      inactiveControls.filter(c => c.status === 'rejected').length,
    softwareControlsPass: softwareControlsPass(unchanged, [...cells, ...historyCells], inactiveControls, ownDurationControls),
    correctionAccepted: false, clinicalValidation: false,
    limitations: [
      'Synthetic seeds are reproducibility cases, not independent patients or an untouched clinical holdout.',
      'Generator onset and J place fixed windows; energy centroid/peak are sample descriptors, not annotated clinical T apex/T end.',
      'Rate sweeps restart the record. Regular ventricular calendars initialize history at their steady RR; they do not identify dynamic adaptation kinetics.',
      'PVC coupling/variability probes expose different RR histories, but PVC duration intentionally ignores them; this is a negative route, not proof of ventricular adaptation.',
      'Overlapping or truncated fixed windows are explicitly excluded; high-rate coverage cannot be inferred from retained low-rate beats.',
      'The fixed 0.8 s reference and cube-root exponent are illustrative; the source builders did not normalize each shape to 0.8 s.',
      'PVC and VPACE builders supply RR in seconds to log_rr. The runtime rrMs field name is misleading for these classes; it is not used by current ventricular timing.',
      'No model change, external holdout result, imaging validation, or independent human clinical review is provided by this audit.'
    ] };
  mkdirSync(dirname(output), {recursive:true}); writeFileSync(output, JSON.stringify(report,null,2)+'\n', {flag:'wx'});
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--output');
  const report = await runAudit(i >= 0 ? process.argv[i+1] : null);
  console.log(JSON.stringify({ families: report.families, softwareControlsPass: report.softwareControlsPass,
    correctionAccepted: false, clinicalValidation: false }, null, 2));
  if (!report.softwareControlsPass) process.exitCode = 1;
}
