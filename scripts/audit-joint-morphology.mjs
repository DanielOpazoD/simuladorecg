import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROTOCOL = path.join(ROOT, 'benchmarks/fidelity/joint-morphology-protocol.json');
const sha = x => createHash('sha256').update(x).digest('hex');
export const METRICS = ['qrsPeakToPeakMv', 'qrsDominantMv', 'qrsAreaMvSeconds', 'jMv', 'j60Mv', 'repolarizationPeakMv', 'repolarizationPeakAfterJMs', 'repolarizationHalfHeightWidthMs', 'repolarizationToQrsPeakToPeak', 'repolarizationToSignedQrs', 'j60ToQrsPeakToPeak'];
export function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null;
}
const empty = reason => ({ status: 'excluded', reasons: [reason], ...Object.fromEntries(METRICS.map(k => [k, null])) });

/** Event-anchored sample instrument, deliberately independent of production analysis/rendering. */
export function measureBeat(samples, fs, beat, nextOnset = Infinity, limits = {}) {
  const minQrs = limits.minimumQrsPeakToPeakMv ?? 0.01;
  const minT = limits.minimumRepolarizationPeakMv ?? 0.005;
  if (!(Number.isFinite(fs) && fs > 0) || ![beat.time, beat.qrs, beat.qt].every(Number.isFinite) || !(beat.qt > beat.qrs && beat.qrs > 0)) return empty('invalid-event-reference');
  const onset = beat.time, j = onset + beat.qrs, end = onset + beat.qt;
  const index = t => Math.round(t * fs);
  const range = (a, b) => [Math.ceil(a * fs - 1e-9), Math.floor(b * fs + 1e-9)];
  const [bl, bh] = range(onset - 0.04, onset - 0.01), [ql, qh] = range(onset, j), [tl, th] = range(j + 0.04, end);
  if (bl < 0 || th >= samples.length) return empty('truncated-support');
  if (end >= nextOnset - 0.04) return empty('overlapping-next-beat-support');
  if (qh - ql + 1 < (limits.minimumQrsSamples ?? 10) || th - tl + 1 < (limits.minimumRepolarizationSamples ?? 10) || bh < bl) return empty('insufficient-window-samples');
  for (let i = bl; i <= th; i++) if (!Number.isFinite(samples[i])) return empty('nonfinite-sample');
  const baselineMv = median(Array.from(samples.slice(bl, bh + 1)));
  const q = Array.from(samples.slice(ql, qh + 1), x => x - baselineMv);
  const qrsPeakToPeakMv = Math.max(...q) - Math.min(...q);
  const qrsDominantMv = q.reduce((best, x) => Math.abs(x) > Math.abs(best) ? x : best, 0);
  let qrsAreaMvSeconds = 0;
  for (let i = 1; i < q.length; i++) qrsAreaMvSeconds += (q[i - 1] + q[i]) / (2 * fs);
  const t = Array.from(samples.slice(tl, th + 1), x => x - baselineMv);
  let peak = 0;
  for (let i = 1; i < t.length; i++) if (Math.abs(t[i]) > Math.abs(t[peak])) peak = i;
  const repolarizationPeakMv = t[peak];
  const reasons = [];
  let repolarizationHalfHeightWidthMs = null;
  if (Math.abs(repolarizationPeakMv) < minT) reasons.push('repolarization-below-support-floor');
  else {
    const sign = Math.sign(repolarizationPeakMv), half = Math.abs(repolarizationPeakMv) / 2;
    let left = peak, right = peak;
    while (left > 0 && t[left - 1] * sign >= half) left--;
    while (right < t.length - 1 && t[right + 1] * sign >= half) right++;
    if (left === 0 || right === t.length - 1) reasons.push('half-height-crossing-outside-window');
    else {
      const crossingLeft = left - 1 + (half - t[left - 1] * sign) / ((t[left] - t[left - 1]) * sign);
      const crossingRight = right + (t[right] * sign - half) / ((t[right] - t[right + 1]) * sign);
      repolarizationHalfHeightWidthMs = (crossingRight - crossingLeft) * 1000 / fs;
    }
  }
  const qSupported = qrsPeakToPeakMv >= minQrs;
  if (!qSupported) reasons.push('qrs-below-ratio-support-floor');
  const repSupported = Math.abs(repolarizationPeakMv) >= minT;
  const j60Mv = j + 0.06 <= end ? samples[index(j + 0.06)] - baselineMv : null;
  if (j60Mv === null) reasons.push('j60-beyond-event-qt');
  const peakTime = (tl + peak) / fs;
  if (repSupported && peakTime <= j + 0.06) reasons.push('repolarization-window-extremum-at-or-before-j60');
  return {
    status: 'measured', reasons, baselineMv, eventOnsetSeconds: onset, eventJSeconds: j, eventQtEndSeconds: end,
    actualQrsSampleSpanSeconds: [ql / fs, qh / fs], jSampleSeconds: index(j) / fs,
    j60SampleSeconds: j60Mv === null ? null : index(j + 0.06) / fs,
    j60TOverlap: 'unknown-no-independent-T-onset', qrsPeakToPeakMv, qrsDominantMv, qrsAreaMvSeconds,
    jMv: samples[index(j)] - baselineMv, j60Mv, repolarizationPeakMv,
    repolarizationPeakAfterJMs: repSupported ? (peakTime - j) * 1000 : null, repolarizationHalfHeightWidthMs,
    repolarizationToQrsPeakToPeak: qSupported && repSupported ? repolarizationPeakMv / qrsPeakToPeakMv : null,
    repolarizationToSignedQrs: qSupported && repSupported && Math.abs(qrsDominantMv) >= minQrs / 2 ? repolarizationPeakMv / qrsDominantMv : null,
    j60ToQrsPeakToPeak: qSupported && j60Mv !== null ? j60Mv / qrsPeakToPeakMv : null,
  };
}

export function summarize(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = p => { const i = (v.length - 1) * p, lo = Math.floor(i); return v.length ? v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo) : null; };
  return { supported: v.length, missing: values.length - v.length, min: v[0] ?? null, q25: quantile(0.25), median: median(v), q75: quantile(0.75), max: v.at(-1) ?? null };
}
export function correlation(rows, a, b, minimum = 6) {
  const pairs = rows.filter(r => Number.isFinite(r[a]) && Number.isFinite(r[b]));
  if (pairs.length < minimum) return { n: pairs.length, r: null, reason: 'insufficient-paired-recordings' };
  const ma = pairs.reduce((s, r) => s + r[a], 0) / pairs.length, mb = pairs.reduce((s, r) => s + r[b], 0) / pairs.length;
  let aa = 0, bb = 0, ab = 0;
  for (const r of pairs) { aa += (r[a] - ma) ** 2; bb += (r[b] - mb) ** 2; ab += (r[a] - ma) * (r[b] - mb); }
  return { n: pairs.length, r: aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : null, reason: aa > 0 && bb > 0 ? null : 'constant-variable' };
}

export function checkPerturbation(base, changed, kind, tolerance = 1e-8) {
  const signed = new Set(['qrsDominantMv', 'qrsAreaMvSeconds', 'jMv', 'j60Mv', 'repolarizationPeakMv']);
  const signRatios = new Set(['repolarizationToQrsPeakToPeak', 'j60ToQrsPeakToPeak']);
  const failures = [], unsupported = [];
  let checked = 0;
  for (const key of METRICS) {
    if (base[key] === null) { unsupported.push(key); if (changed[key] !== null) failures.push({ key, reason: 'support-changed' }); continue; }
    if (!Number.isFinite(base[key])) { failures.push({ key, reason: 'nonfinite-reference-metric' }); continue; }
    const factor = kind === 'scale' && (signed.has(key) || key === 'qrsPeakToPeakMv') ? 1.7 : kind === 'polarity' && (signed.has(key) || signRatios.has(key)) ? -1 : 1;
    const expected = base[key] * factor;
    checked++;
    if (!Number.isFinite(changed[key]) || Math.abs(changed[key] - expected) > tolerance) failures.push({ key, expected, actual: changed[key] });
  }
  return { kind, checked, unsupported, failures, passed: checked > 0 && failures.length === 0 };
}

export async function runAudit(outputDirectory) {
  const out = path.resolve(outputDirectory);
  if (existsSync(path.join(out, 'report.json'))) throw new Error('Refusing to overwrite an existing report; choose a new output directory.');
  await mkdir(out, { recursive: true });
  const protocolText = await readFile(PROTOCOL, 'utf8'), protocol = JSON.parse(protocolText);
  // Freeze a byte-for-byte copy before synthesis; provenance remains inspectable.
  await writeFile(path.join(out, 'protocol.json'), protocolText, { flag: 'wx' });
  const { build } = await import('esbuild');
  const bundle = path.join(out, 'production-synthesis.mjs');
  await build({ stdin: { contents: `export {synthesize} from './src/engine/signal.ts'; export {PRESETS,fromPreset,patchCase} from './src/presets/catalog.ts'; export {LEADS} from './src/engine/lead-registry.ts'; export {registerShapeModel} from './src/engine/realistic/shape-model.ts'; export {registerIschemiaModel} from './src/engine/realistic/ischemia.ts'; export {withNaturalControls} from './src/engine/realistic/natural.ts';`, resolveDir: ROOT, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
  const api = await import(pathToFileURL(bundle).href);
  const modelHashes = {};
  for (const name of (await readdir(path.join(ROOT, 'src/engine/realistic/models'))).filter(n => n.endsWith('.json')).sort()) {
    const raw = await readFile(path.join(ROOT, 'src/engine/realistic/models', name)); modelHashes[name] = sha(raw); api.registerShapeModel(name.slice(0, -5), JSON.parse(raw));
  }
  api.registerIschemiaModel(JSON.parse(await readFile(path.join(ROOT, 'src/engine/realistic/ischemia/ischemia-model.json'), 'utf8')));
  const recordings = [], negativeControls = [], anomalies = [];
  for (const [family, presetId] of Object.entries(protocol.families)) for (const seed of protocol.seeds) {
    const configured = { ...api.fromPreset(api.PRESETS.find(p => p.id === presetId), undefined, { natural: false }), seed, hr: protocol.heartRateBpm, variability: protocol.variability, acquisition: protocol.acquisition, filter: protocol.filter };
    const natural = api.withNaturalControls(configured);
    const variants = {
      'configured-defaults': configured, natural,
      'natural-qrs-gain-1.2': api.patchCase(natural, { qrsAmp: natural.qrsAmp * protocol.interventions.qrsGainFactor }),
      'natural-axis-plus-20deg': api.patchCase(natural, { axis: ((natural.axis + protocol.interventions.axisDeltaDegrees + 540) % 360) - 180 }),
    };
    for (const [variant, c] of Object.entries(variants)) {
      const signal = api.synthesize(c, protocol.durationSeconds), recording = { family, seed, variant, fsHz: signal.fs, durationSeconds: signal.duration, controls: c, warnings: signal.warnings, samplesSha256: {}, leads: {} };
      for (const lead of api.LEADS) {
        const samples = signal.leads[lead], bytes = Buffer.alloc(samples.length * 8);
        for (let i = 0; i < samples.length; i++) bytes.writeDoubleLE(samples[i], i * 8);
        recording.samplesSha256[lead] = sha(bytes);
        const beats = signal.events.beats.map((b, i) => ({ eventIndex: i, ...measureBeat(samples, signal.fs, b, signal.events.beats[i + 1]?.time, protocol.instrumentThresholds) }));
        const summary = Object.fromEntries(METRICS.map(k => { const v = beats.map(b => b[k]).filter(Number.isFinite); return [k, v.length >= protocol.instrumentThresholds.minimumBeatsPerRecordingLead ? median(v) : null]; }));
        recording.leads[lead] = { totalBeats: beats.length, measuredBeats: beats.filter(b => b.status === 'measured').length, summary, beats };
        for (const b of beats) for (const reason of b.reasons) anomalies.push({ family, seed, variant, lead, eventIndex: b.eventIndex, reason });
        const chosen = beats.find(b => b.status === 'measured');
        if (chosen) {
          const i = chosen.eventIndex;
          for (const [kind, f] of [['dc', x => x + 0.3], ['scale', x => x * 1.7], ['polarity', x => -x]]) {
            const changed = measureBeat(samples.map(f), signal.fs, signal.events.beats[i], signal.events.beats[i + 1]?.time, protocol.instrumentThresholds);
            negativeControls.push({ family, seed, variant, lead, eventIndex: i, ...checkPerturbation(chosen, changed, kind, protocol.instrumentThresholds.negativeControlAbsoluteTolerance) });
          }
        }
      }
      recordings.push(recording);
    }
  }
  const distributions = [], pairedContrasts = [];
  for (const family of Object.keys(protocol.families)) for (const variant of protocol.variants) for (const lead of api.LEADS) {
    const rows = recordings.filter(r => r.family === family && r.variant === variant).map(r => r.leads[lead].summary);
    distributions.push({ family, variant, lead, syntheticRecordings: rows.length, metrics: Object.fromEntries(METRICS.map(k => [k, summarize(rows.map(r => r[k]))])), correlations: [ ['qrsPeakToPeakMv', 'repolarizationPeakMv'], ['qrsAreaMvSeconds', 'repolarizationPeakMv'], ['qrsDominantMv', 'j60Mv'] ].map(([x, y]) => ({ x, y, ...correlation(rows, x, y, protocol.instrumentThresholds.minimumRecordingsForCorrelation) })) });
    if (variant !== 'natural') {
      const deltas = protocol.seeds.map(seed => {
        const a = recordings.find(r => r.family === family && r.seed === seed && r.variant === 'natural').leads[lead].summary;
        const b = recordings.find(r => r.family === family && r.seed === seed && r.variant === variant).leads[lead].summary;
        return Object.fromEntries(METRICS.map(k => [k, a[k] === null || b[k] === null ? null : b[k] - a[k]]));
      });
      pairedContrasts.push({ family, variant, reference: 'natural', lead, direction: 'variant-minus-natural', metrics: Object.fromEntries(METRICS.map(k => [k, summarize(deltas.map(d => d[k]))])) });
    }
  }
  const sourceFiles = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  const sourceHashes = {};
  for (const filename of sourceFiles) sourceHashes[filename] = sha(await readFile(path.join(ROOT, filename)));
  const report = {
    schemaVersion: 1, protocolId: protocol.id, generatedAt: new Date().toISOString(),
    provenance: { gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), protocolSha256: sha(protocolText), instrumentSha256: sha(await readFile(fileURLToPath(import.meta.url))), productionBundleSha256: sha(await readFile(bundle)), modelHashes, sourceHashes },
    units: { samples: 'mV', eventTimesAndDurations: 'seconds', amplitude: 'mV', signedArea: 'mV*seconds', derivedTimes: 'ms', ratios: 'dimensionless' },
    interpretation: { clinicalValidation: false, externalReferenceAvailable: false, independentDelineation: false, rendererUsed: false, modelAdjusted: false, clinicalPromotion: 'not-eligible-no-independent-external-reserve-or-human-review', naturalBBBContrast: 'identity-by-design', configuredNaturalContrast: 'multiple-controls-confounded-not-isolated-normalization' },
    coverage: { families: Object.keys(protocol.families), syntheticSeedsPerFamily: protocol.seeds.length, syntheticRecordings: recordings.length, patientCount: null, leadRecordings: recordings.length * api.LEADS.length, negativeControls: negativeControls.length, negativeControlFailures: negativeControls.filter(n => !n.passed).length },
    distributions, pairedContrasts, anomalyCounts: Object.fromEntries([...new Set(anomalies.map(a => a.reason))].map(reason => [reason, anomalies.filter(a => a.reason === reason).length])), anomalies, negativeControls, recordings,
  };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return { output: path.join(out, 'report.json'), ...report.coverage, anomalyCounts: report.anomalyCounts };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.findIndex(x => x === '--out' || x === '--output');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/audit-joint-morphology.mjs --output <new-output-directory>');
  const result = await runAudit(process.argv[index + 1]);
  console.log(JSON.stringify(result, null, 2));
  // Preserve adverse evidence before signaling an instrument failure to CI.
  if (result.negativeControlFailures > 0 || result.negativeControls === 0) process.exitCode = 1;
}
