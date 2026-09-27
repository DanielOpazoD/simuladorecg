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
  const rows = [];
  // Retain the historical posterior oracle and add the same contract for WPW delta.
  for (const preset of ['posterior', 'wpw']) for (const filter of filters) {
    const c = {...after.fromPreset(after.presetById(preset)), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
    const full = after.synthesize({...c, filter, qrsAmp: 1}, 10);
    for (const qrsGain of [.1, .5, 1, 2, 3]) {
      const a = before.synthesize({...c, filter, qrsAmp: qrsGain}, 10), b = after.synthesize({...c, filter, qrsAmp: qrsGain}, 10);
      let oldError = 0, newError = 0;
      for (const l of Object.keys(b.leads)) for (let i = 0; i < b.leads[l].length; i++) {
        oldError = Math.max(oldError, Math.abs(a.leads[l][i] - qrsGain * full.leads[l][i]));
        newError = Math.max(newError, Math.abs(b.leads[l][i] - qrsGain * full.leads[l][i]));
      }
      assert.ok(newError < 1e-10, `Unscaled ${preset} QRS: ${filter}/${qrsGain}`);
      assert.deepEqual(a.events, b.events);
      const beat = b.events.beats[3];
      const peak = (s, lead) => Math.max(...s.leads[lead].slice(Math.floor(beat.time * s.fs), Math.ceil((beat.time + beat.qrs) * s.fs)));
      rows.push({preset, filter, qrsGain, oldErrorMv: oldError, newErrorMv: newError,
        v1PositivePeakMv: {before: peak(a, 'V1'), after: peak(b, 'V1')}});
    }
  }
  // Isolate the low-voltage correction against the already gain-corrected PR35.
  const lowVoltageBaseline = 'e8bb934d9b5b78e15a99d447e2ed61b2279df16c';
  const gainDir = path.join(temp, 'gain-corrected'); await mkdir(gainDir);
  execFileSync('tar', ['-xf', '-', '-C', gainDir], {input: execFileSync('git', ['archive', lowVoltageBaseline], {maxBuffer: 100 * 1024 * 1024})});
  const gainCorrected = await load(gainDir, 'gain-corrected'), lowVoltageScenarios = [];
  const posterior = {...after.fromPreset(after.presetById('posterior')), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
  for (const filter of filters) for (const qrsGain of [.1, .5, 1, 2, 3]) {
    const config = {...posterior, filter, qrsAmp: qrsGain};
    const normal = after.synthesize(config, 10);
    const oldLow = gainCorrected.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    const newLow = after.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    assert.deepEqual(normal, gainCorrected.synthesize(config, 10), 'Non-low-voltage trace changed');
    let oldErrorMv = 0, newErrorMv = 0;
    for (const l of Object.keys(normal.leads)) for (let i = 0; i < normal.leads[l].length; i++) {
      oldErrorMv = Math.max(oldErrorMv, Math.abs(oldLow.leads[l][i] - .38 * normal.leads[l][i]));
      newErrorMv = Math.max(newErrorMv, Math.abs(newLow.leads[l][i] - .38 * normal.leads[l][i]));
      if (!['V1', 'V2', 'V3'].includes(l)) assert.equal(oldLow.leads[l][i], newLow.leads[l][i]);
    }
    assert.ok(newErrorMv < 1e-10); assert.deepEqual(oldLow.events, newLow.events);
    const beat = normal.events.beats[3];
    const peak = signal => Math.max(...signal.leads.V1.slice(Math.floor(beat.time * signal.fs), Math.ceil((beat.time + beat.qrs) * signal.fs)));
    lowVoltageScenarios.push({filter, qrsGain, oldErrorMv, newErrorMv,
      v1PositivePeakMv: {normal: peak(normal), before: peak(oldLow), after: peak(newLow)}});
  }
  assert.ok(Math.max(...lowVoltageScenarios.map(r => r.oldErrorMv)) > 1, 'Must reproduce the PR35 low-voltage defect');
  for (const [preset, minimumOldError] of [['posterior', 1], ['wpw', .5]])
    assert.ok(Math.max(...rows.filter(r => r.preset === preset).map(r => r.oldErrorMv)) > minimumOldError, `Regression must expose the old ${preset} error`);
  // Separate baseline for the residual WPW delta attenuation defect after PR38.
  const wpwLowVoltageBaseline = 'd86b193f3deb56649d325d07379206299748ab49';
  const wpwDir = path.join(temp, 'wpw-gain-corrected'); await mkdir(wpwDir);
  execFileSync('tar', ['-xf', '-', '-C', wpwDir], {input: execFileSync('git', ['archive', wpwLowVoltageBaseline], {maxBuffer: 100 * 1024 * 1024})});
  const wpwCorrected = await load(wpwDir, 'wpw-gain-corrected'), wpwLowVoltageScenarios = [];
  const wpw = {...after.fromPreset(after.presetById('wpw')), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
  for (const filter of filters) for (const qrsGain of [.1, .5, 1, 2, 3]) {
    const config = {...wpw, filter, qrsAmp: qrsGain};
    const normal = after.synthesize(config, 10);
    const oldLow = wpwCorrected.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    const newLow = after.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    assert.deepEqual(normal, wpwCorrected.synthesize(config, 10), 'WPW without low voltage changed');
    let oldErrorMv = 0, newErrorMv = 0;
    for (const l of Object.keys(normal.leads)) for (let i = 0; i < normal.leads[l].length; i++) {
      oldErrorMv = Math.max(oldErrorMv, Math.abs(oldLow.leads[l][i] - .38 * normal.leads[l][i]));
      newErrorMv = Math.max(newErrorMv, Math.abs(newLow.leads[l][i] - .38 * normal.leads[l][i]));
    }
    assert.ok(newErrorMv < 1e-10, `Unattenuated WPW delta: ${filter}/${qrsGain}`);
    assert.deepEqual(oldLow.events, newLow.events);
    const beat = normal.events.beats[3];
    const peak = signal => Math.max(...signal.leads.II.slice(Math.floor(beat.time * signal.fs), Math.ceil((beat.time + .045) * signal.fs)));
    wpwLowVoltageScenarios.push({filter, qrsGain, oldErrorMv, newErrorMv,
      initial45msLeadIIPeakMv: {normal: peak(normal), before: peak(oldLow), after: peak(newLow)}});
  }
  assert.ok(Math.max(...wpwLowVoltageScenarios.map(r => r.oldErrorMv)) > .5, 'Must expose the PR38 WPW low-voltage defect');
  const report = {baseline, commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    defaults, gainScenarios: rows, lowVoltageBaseline, lowVoltageScenarios, wpwLowVoltageBaseline, wpwLowVoltageScenarios, nativeTimingsUnchanged: true, clinicalValidation: false};
  const output = process.argv[2]; assert.ok(output, 'Provide result JSON path');
  await mkdir(path.dirname(path.resolve(output)), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({defaultScenarios: defaults.length, gainScenarios: rows.length,
    maxOldErrorMv: Math.max(...rows.map(r => r.oldErrorMv)), maxNewErrorMv: Math.max(...rows.map(r => r.newErrorMv)),
    lowVoltageScenarios: lowVoltageScenarios.length, maxLowVoltageErrorMv: Math.max(...lowVoltageScenarios.map(r => r.newErrorMv)),
    wpwLowVoltageScenarios: wpwLowVoltageScenarios.length, maxWpwLowVoltageErrorMv: Math.max(...wpwLowVoltageScenarios.map(r => r.newErrorMv))}));
} finally { await rm(temp, {recursive: true, force: true}); }
