/** Paired sample audit. Run from the repo root; needs Git history for BASELINE.
 * --write-fingerprints writes only reviewed, changed catalogue entries to a
 * separate file. The original catalogue fingerprints are never overwritten. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const BASELINE = '507751c509012af080139044d65cf6caa09d0053';
const allowedSources = new Set(['src/engine/realistic/beat.ts', 'src/engine/realistic/engine.ts']);
const changedSources = execFileSync('git', ['diff', BASELINE, '--name-only', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.ok(changedSources.every(file => allowedSources.has(file)), 'Source changes outside the reviewed handoff; reproduce them separately');
assert.equal(execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'], { encoding: 'utf8' }).trim(), '', 'Untracked product sources invalidate the baseline');
const destination = '.sites-runtime/learned-handoff';
mkdirSync(destination, { recursive: true });
const entry = `
export { synthesize } from './src/engine/signal.ts';
export { PRESETS, fromPreset } from './src/presets/catalog.ts';
export { RealisticTrack, usesRealisticBase } from './src/engine/realistic/engine.ts';
export { generateEvents } from './src/engine/rhythm.ts';
export { qrsKernels } from './src/engine/morphology.ts';
export { secondaryRepolarization } from './src/engine/secondary-repolarization.ts';`;
const original = Object.fromEntries(['beat', 'engine'].map(name => [name,
  execFileSync('git', ['show', `${BASELINE}:src/engine/realistic/${name}.ts`], { encoding: 'utf8' })]));
const modules = [];
for (const before of [true, false]) {
  const outfile = path.join(destination, before ? 'before.mjs' : 'after.mjs');
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    plugins: before ? [{ name: 'exact-baseline-handoff', setup(b) {
      b.onLoad({ filter: /realistic[/\\](beat|engine)\.ts$/ }, args => ({
        contents: original[path.basename(args.path, '.ts')], loader: 'ts', resolveDir: path.dirname(args.path),
      }));
    } }] : [],
  });
  modules.push(await import(pathToFileURL(path.resolve(outfile)).href));
}
const [before, after] = modules;
const historical = JSON.parse(readFileSync('tests/__snapshots__/catalog-fingerprints.json', 'utf8'));
const fingerprintFile = 'tests/__snapshots__/catalog-pr-qrs-v2.json';
const revisions = {}, rows = [];
function fingerprint(x) {
  let sum = 0, sumAbs = 0, sumSq = 0, moment = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    sum += v; sumAbs += Math.abs(v); sumSq += v * v; moment += (i / x.length) * v;
    min = Math.min(min, v); max = Math.max(max, v);
  }
  return { n: x.length, sum, sumAbs, sumSq, moment, min, max,
    samples: Array.from({ length: Math.ceil(x.length / 100) }, (_, i) => x[i * 100]) };
}
function matches(a, b) {
  return a.n === b.n && a.samples.length === b.samples.length &&
    ['sum', 'sumAbs', 'sumSq', 'moment', 'min', 'max'].every(k => Math.abs(a[k] - b[k]) <= 1e-4 + 1e-6 * Math.abs(b[k])) &&
    a.samples.every((v, i) => Math.abs(v - b.samples[i]) <= 1e-5);
}

for (const preset of after.PRESETS.filter(p => p.strategy !== 'pending')) {
  const c = { ...after.fromPreset(preset), acquisition: 'ideal' };
  const a = before.synthesize(c, 10), b = after.synthesize(c, 10);
  assert.deepEqual(b.events, a.events, `${preset.id}: changed calendar`);
  const { axis: oldAxis, ...oldMetrics } = a.truth, { axis: newAxis, ...newMetrics } = b.truth;
  assert.deepEqual(newMetrics, oldMetrics, `${preset.id}: changed interval or rate metrics`);
  assert.equal(newAxis === null, oldAxis === null, `${preset.id}: changed axis availability`);
  // The model's axis is integrated from the actual QRS samples, including its
  // first sample; removing the duplicate can legitimately change that area.
  const axisChangeDeg = oldAxis === null && newAxis === null ? 0 : Math.abs(((newAxis - oldAxis + 540) % 360) - 180);
  assert.ok(Number.isFinite(axisChangeDeg) && axisChangeDeg < 0.5, `${preset.id}: axis changed by >= half a display degree`);
  assert.deepEqual(b.warnings, a.warnings, `${preset.id}: changed warnings`);
  let maxOutputMv = 0, outputSamples = 0, rawSamples = 0, maxRawMv = 0;
  for (const lead of Object.keys(a.leads)) for (let i = 0; i < a.leads[lead].length; i++) {
    const d = Math.abs(b.leads[lead][i] - a.leads[lead][i]);
    if (d !== 0) outputSamples++;
    maxOutputMv = Math.max(maxOutputMv, d);
  }
  if (after.usesRealisticBase(c)) {
    const events = after.generateEvents(c, 14.1), permitted = new Set();
    for (const beat of events.beats.filter(x => x.kind === 'normal')) {
      // At most the two grid neighbours of a handoff may change. This includes
      // recovering a PR sample lost to cancellation of phase-duration rounding.
      permitted.add(Math.floor(beat.time * 1000)); permitted.add(Math.ceil(beat.time * 1000));
    }
    const tracks = [before, after].map(m => {
      const track = new m.RealisticTrack(c, 14100, 1000);
      track.prepare(events.beats);
      for (const atrium of events.atria) if (atrium.kind === 'sinus') track.addAtrial(atrium);
      return track.acc;
    });
    for (let l = 0; l < 8; l++) for (let i = 0; i < 14100; i++) {
      const d = Math.abs(tracks[1][l][i] - tracks[0][l][i]);
      if (d !== 0) {
        assert.ok(permitted.has(i), `${preset.id}: unexpected atrial change at ${i / 1000}s, lead ${l}`);
        rawSamples++; maxRawMv = Math.max(maxRawMv, d);
      }
    }
    if (rawSamples === 0) assert.equal(outputSamples, 0, `${preset.id}: unexplained output change`);
  } else assert.equal(outputSamples, 0, `${preset.id}: changed historical kernels`);

  const secondary = a.events.beats.some(beat => after.secondaryRepolarization(c, beat, after.qrsKernels(c, beat)).mode !== 'none');
  if (c.rhythm !== 'af' && c.conduction !== 'wpw' && !secondary) {
    const key = preset.id === 'lpfb' ? 'lpfb-source-v2' : preset.id;
    assert.ok(matches(fingerprint(a.leads.II), historical[key]), `${preset.id}: baseline does not reproduce original fingerprint`);
    if (!matches(fingerprint(b.leads.II), historical[key])) {
      assert.ok(rawSamples > 0, `${preset.id}: no handoff explains new fingerprint`);
      revisions[key] = fingerprint(b.leads.II);
    }
  }
  rows.push({ id: preset.id, rawSamples, maxRawMicrovolts: maxRawMv * 1000, outputSamples, maxOutputMicrovolts: maxOutputMv * 1000, axisChangeDeg });
}
const sorted = Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b)));
if (process.argv.includes('--write-fingerprints')) {
  // One compact line per reviewed preset keeps the intentional delta reviewable.
  writeFileSync(fingerprintFile, '{\n' + Object.entries(sorted).map(([id, value]) => ` ${JSON.stringify(id)}: ${JSON.stringify(value)}`).join(',\n') + '\n}\n');
} else {
  const stored = JSON.parse(readFileSync(fingerprintFile, 'utf8'));
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(sorted).sort(), 'Revised preset inventory differs');
  for (const id of Object.keys(sorted)) assert.ok(matches(sorted[id], stored[id]), `${id}: revised fingerprint differs`);
}
const report = { baseline: BASELINE, runtime: process.version, platform: process.platform,
  presets: rows.length, changedPresets: rows.filter(r => r.outputSamples > 0).length,
  revisedFingerprints: Object.keys(sorted), clinicalValidation: false, rows };
writeFileSync(`${destination}/paired.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
