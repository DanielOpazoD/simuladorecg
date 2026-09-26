/** Paired generator regression; independent of the sample analyzer and external ECG labels. */
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const baseline = '91519b2ea3b052f5cd22db6802f674bab6981b96';
const temp = await mkdtemp(path.join(tmpdir(), 'posterior-gain-'));
try {
  const baseDir = path.join(temp, 'baseline'); await mkdir(baseDir);
  execFileSync('tar', ['-xf', '-', '-C', baseDir], {input: execFileSync('git', ['archive', baseline], {maxBuffer: 100 * 1024 * 1024})});
  async function load(dir, name) {
    const outfile = path.join(temp, name + '.mjs');
    await build({stdin: {contents: "export {synthesize} from './src/engine/signal'; export {PRESETS,fromPreset,presetById} from './src/presets/catalog';", resolveDir: dir}, bundle: true, platform: 'node', format: 'esm', outfile});
    return import(pathToFileURL(outfile));
  }
  const [before, after] = await Promise.all([load(baseDir, 'before'), load(process.cwd(), 'after')]);
  const filters = ['off', 'diagnostic', 'monitor', 'aggressive'];
  const defaults = [];
  for (const preset of after.PRESETS.filter(p => p.strategy !== 'pending')) for (const filter of filters) {
    const c = {...after.fromPreset(preset), filter};
    assert.deepEqual(after.synthesize(c, 10), before.synthesize(c, 10), `Changed default ${preset.id}/${filter}`);
    defaults.push({preset: preset.id, filter, exact: true});
  }
  const c = {...after.fromPreset(after.presetById('posterior')), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
  const rows = [];
  for (const filter of filters) {
    const full = after.synthesize({...c, filter, qrsAmp: 1}, 10);
    for (const qrsGain of [.1, .5, 1, 2, 3]) {
      const a = before.synthesize({...c, filter, qrsAmp: qrsGain}, 10), b = after.synthesize({...c, filter, qrsAmp: qrsGain}, 10);
      let oldError = 0, newError = 0;
      for (const l of Object.keys(b.leads)) for (let i = 0; i < b.leads[l].length; i++) {
        oldError = Math.max(oldError, Math.abs(a.leads[l][i] - qrsGain * full.leads[l][i]));
        newError = Math.max(newError, Math.abs(b.leads[l][i] - qrsGain * full.leads[l][i]));
      }
      assert.ok(newError < 1e-10, `Unscaled posterior QRS: ${filter}/${qrsGain}`);
      assert.deepEqual(a.events, b.events);
      const beat = b.events.beats[3];
      const peak = (s, lead) => Math.max(...s.leads[lead].slice(Math.floor(beat.time * s.fs), Math.ceil((beat.time + beat.qrs) * s.fs)));
      rows.push({filter, qrsGain, oldErrorMv: oldError, newErrorMv: newError,
        v1PositivePeakMv: {before: peak(a, 'V1'), after: peak(b, 'V1')}});
    }
  }
  assert.ok(Math.max(...rows.map(r => r.oldErrorMv)) > 1, 'Regression must expose the old error');
  const report = {baseline, commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    defaults, gainScenarios: rows, nativeTimingsUnchanged: true, clinicalValidation: false};
  const output = process.argv[2]; assert.ok(output, 'Provide result JSON path');
  await mkdir(path.dirname(path.resolve(output)), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({defaultScenarios: defaults.length, gainScenarios: rows.length,
    maxOldErrorMv: Math.max(...rows.map(r => r.oldErrorMv)), maxNewErrorMv: Math.max(...rows.map(r => r.newErrorMv))}));
} finally { await rm(temp, {recursive: true, force: true}); }
