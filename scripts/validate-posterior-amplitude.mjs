/** Paired generator regression; independent of the sample analyzer and external ECG labels. */
import { build } from 'esbuild';
import { assertRvAmplitudeChange, assertFinalQrsAxisChange, assertExactSignal } from './lib/fidelity-contracts.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const scopeIndex = process.argv.indexOf('--scope');
const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : 'all';
assert.ok(['all', 'defaults', 'posterior', 'wpw', 'rv', 'rv_acute', 'rv_chronic'].includes(scope), 'Invalid --scope');
const baseline = '91519b2ea3b052f5cd22db6802f674bab6981b96';
const axisBaseline = '5bafc2031e73048ff2f5d5e99f0b039d4ef1acca';
const temp = await mkdtemp(path.join(tmpdir(), 'posterior-gain-'));
try {
  const baseDir = path.join(temp, 'baseline'); await mkdir(baseDir);
  execFileSync('tar', ['-xf', '-', '-C', baseDir], {input: execFileSync('git', ['archive', baseline], {maxBuffer: 100 * 1024 * 1024})});
  async function load(dir, name) {
    const outfile = path.join(temp, name + '.mjs');
    await build({stdin: {contents: "export {synthesize} from './src/engine/signal'; export {PRESETS,fromPreset,presetById} from './src/presets/catalog'; export {qrsKernels} from './src/engine/morphology'; export {DOWER} from './src/engine/leads';", resolveDir: dir}, bundle: true, platform: 'node', format: 'esm', outfile});
    return import(pathToFileURL(outfile));
  }
  const after = await load(process.cwd(), 'after');
  const before = scope.startsWith('rv') ? null : await load(baseDir, 'before');
  // Prior amplitude corrections and the new axis change have separate references.
  const axisDir = path.join(temp, 'before-axis'); await mkdir(axisDir);
  execFileSync('tar', ['-xf', '-', '-C', axisDir], {input: execFileSync('git', ['archive', axisBaseline], {maxBuffer: 100 * 1024 * 1024})});
  const axisBase = await load(axisDir, 'before-axis');
  const filters = ['off', 'diagnostic', 'monitor', 'aggressive'];
  const defaults = [];
  if (scope === 'all' || scope === 'defaults') for (const preset of after.PRESETS.filter(p => p.strategy !== 'pending')) for (const filter of filters) {
    const c = {...after.fromPreset(preset), filter};
    const a = before.synthesize(c, 10), reviewed = axisBase.synthesize(c, 10), b = after.synthesize(c, 10);
    const historical = preset.id === 'rv_chronic'
      ? assertRvAmplitudeChange(before.synthesize, a, reviewed, c)
      : (assertExactSignal(a, reviewed, `historical/default/${preset.id}/${filter}`), null);
    const finalAxis = ['rv_acute', 'rv_chronic'].includes(preset.id)
      ? assertFinalQrsAxisChange(axisBase, reviewed, b, c)
      : preset.id === 'torsades'
        ? (() => {
            for (const lead of Object.keys(reviewed.leads))
              assert.deepEqual(reviewed.leads[lead], b.leads[lead], `current/default/torsades/${filter}: ${lead} samples changed`);
            assert.deepEqual(reviewed.events, b.events, `current/default/torsades/${filter}: events changed`);
            assert.deepEqual(reviewed.warnings, b.warnings, `current/default/torsades/${filter}: warnings changed`);
            assert.deepEqual({...reviewed.truth, axis: null}, b.truth,
              `current/default/torsades/${filter}: only truth.axis may change`);
            assert.notEqual(reviewed.truth.axis, null, 'Reviewed torsades baseline must reproduce the former fixed axis');
            assert.equal(b.truth.axis, null, 'Current torsades must not publish a global axis');
            return {kind:'torsades-global-axis-withdrawal', from:reviewed.truth.axis, to:null};
          })()
        : (assertExactSignal(reviewed, b, `current/default/${preset.id}/${filter}`), null);
    defaults.push({preset: preset.id, filter, historicalExact: historical === null,
      exact: historical === null && finalAxis === null, reviewedMainExact: finalAxis === null,
      historical, finalAxis});
  }
  if (scope === 'all' || scope === 'defaults') {
    assert.equal(defaults.length, 244, 'Require all 61 presets and four filters');
    assert.equal(defaults.filter(r => r.historicalExact).length, 240);
    assert.equal(defaults.filter(r => r.reviewedMainExact).length, 235);
  }
  const rows = [];
  const historical = before;
  // Retain the historical posterior oracle and add the same contract for WPW delta.
  for (const preset of ['posterior', 'wpw'].filter(p => scope === 'all' || scope === p)) for (const filter of filters) {
    const c = {...after.fromPreset(after.presetById(preset)), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
    const full = after.synthesize({...c, filter, qrsAmp: 1}, 10);
    for (const qrsGain of [.1, .5, 1, 2, 3]) {
      const a = historical.synthesize({...c, filter, qrsAmp: qrsGain}, 10), b = after.synthesize({...c, filter, qrsAmp: qrsGain}, 10);
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
  const gainCorrected = (scope === 'all' || scope === 'posterior') ? await load(gainDir, 'gain-corrected') : null, lowVoltageScenarios = [];
  const posterior = {...after.fromPreset(after.presetById('posterior')), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
  if (scope === 'all' || scope === 'posterior') for (const filter of filters) for (const qrsGain of [.1, .5, 1, 2, 3]) {
    const config = {...posterior, filter, qrsAmp: qrsGain};
    const normal = after.synthesize(config, 10);
    const oldLow = gainCorrected.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    const newLow = after.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    assertExactSignal(normal, gainCorrected.synthesize(config, 10), 'Non-low-voltage trace changed');
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
  if (scope === 'all' || scope === 'posterior') assert.ok(Math.max(...lowVoltageScenarios.map(r => r.oldErrorMv)) > 1, 'Must reproduce the PR35 low-voltage defect');
  for (const [preset, minimumOldError] of [['posterior', 1], ['wpw', .5]])
    if (scope === 'all' || scope === preset) assert.ok(Math.max(...rows.filter(r => r.preset === preset).map(r => r.oldErrorMv)) > minimumOldError, `Regression must expose the old ${preset} error`);
  // Separate baseline for the residual WPW delta attenuation defect after PR38.
  const wpwLowVoltageBaseline = 'd86b193f3deb56649d325d07379206299748ab49';
  const wpwDir = path.join(temp, 'wpw-gain-corrected'); await mkdir(wpwDir);
  execFileSync('tar', ['-xf', '-', '-C', wpwDir], {input: execFileSync('git', ['archive', wpwLowVoltageBaseline], {maxBuffer: 100 * 1024 * 1024})});
  const wpwCorrected = (scope === 'all' || scope === 'wpw') ? await load(wpwDir, 'wpw-gain-corrected') : null, wpwLowVoltageScenarios = [];
  const wpw = {...after.fromPreset(after.presetById('wpw')), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0};
  if (scope === 'all' || scope === 'wpw') for (const filter of filters) for (const qrsGain of [.1, .5, 1, 2, 3]) {
    const config = {...wpw, filter, qrsAmp: qrsGain};
    const normal = after.synthesize(config, 10);
    const oldLow = wpwCorrected.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    const newLow = after.synthesize({...config, electrolyte: 'lowvoltage'}, 10);
    assertExactSignal(normal, wpwCorrected.synthesize(config, 10), 'WPW without low voltage changed');
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
  if (scope === 'all' || scope === 'wpw') assert.ok(Math.max(...wpwLowVoltageScenarios.map(r => r.oldErrorMv)) > .5, 'Must expose the PR38 WPW low-voltage defect');
  // Freeze the complete pre-RV-gain product rather than reusing clinical references.
  const rvBaseline = 'd2babc398a246787fbb8e3156668b90a31781f30';
  const rvDir = path.join(temp, 'before-rv-gain'); await mkdir(rvDir);
  execFileSync('tar', ['-xf', '-', '-C', rvDir], {input: execFileSync('git', ['archive', rvBaseline], {maxBuffer: 100 * 1024 * 1024})});
  const rvBefore = (scope === 'all' || scope.startsWith('rv')) ? await load(rvDir, 'before-rv-gain') : null, rvScenarios = [];
  if (scope === 'all' || scope.startsWith('rv')) for (const preset of ['rv_acute', 'rv_chronic'].filter(p => scope === 'all' || scope === 'rv' || scope === p)) for (const filter of filters) {
    const c = {...after.fromPreset(after.presetById(preset)), hr: 60, variability: 0, pAmp: 0, tAmp: 0, st: 0, filter, qrsAmp: 1};
    const unit = axisBase.synthesize(c, 10), currentUnit = after.synthesize(c, 10);
    assertExactSignal(unit, rvBefore.synthesize(c, 10), 'Historical RV unit-gain source changed');
    for (const gain of [.1, .5, 1, 2, 3]) for (const electrolyte of ['none', 'lowvoltage']) {
      const config = {...c, qrsAmp: gain, electrolyte};
      const a = rvBefore.synthesize(config, 10), b = axisBase.synthesize(config, 10), current = after.synthesize(config, 10);
      const factor = gain * (electrolyte === 'lowvoltage' ? .38 : 1);
      let oldErrorMv = 0, newErrorMv = 0, currentProportionalityErrorMv = 0;
      for (const l of Object.keys(unit.leads)) for (let i = 0; i < unit.leads[l].length; i++) {
        oldErrorMv = Math.max(oldErrorMv, Math.abs(a.leads[l][i] - factor * unit.leads[l][i]));
        newErrorMv = Math.max(newErrorMv, Math.abs(b.leads[l][i] - factor * unit.leads[l][i]));
        currentProportionalityErrorMv = Math.max(currentProportionalityErrorMv, Math.abs(current.leads[l][i] - factor * currentUnit.leads[l][i]));
      }
      assert.ok(newErrorMv < 1e-10, `Unscaled RV component: ${preset}/${filter}/${gain}/${electrolyte}`);
      assert.ok(currentProportionalityErrorMv < 1e-10, `Current RV gain/attenuation changed: ${preset}/${filter}/${gain}/${electrolyte}`);
      const oracle = assertRvAmplitudeChange(rvBefore.synthesize, a, b, config);
      const finalAxis = assertFinalQrsAxisChange(axisBase, b, current, config);
      const beat = unit.events.beats[3];
      const peak = signal => Math.max(...signal.leads.V1.slice(Math.floor(beat.time * signal.fs), Math.ceil((beat.time + beat.qrs) * signal.fs)));
      rvScenarios.push({preset, filter, gain, electrolyte, oldErrorMv, newErrorMv, currentProportionalityErrorMv, finalAxis,
        v1PositivePeakMv: {unit: peak(unit), before: peak(a), reviewedMain: peak(b), after: peak(current)}, ...oracle});
    }
  }
  if (scope === 'all' || scope.startsWith('rv')) for (const preset of ['rv_acute', 'rv_chronic'].filter(p => scope === 'all' || scope === 'rv' || scope === p))
    assert.ok(Math.max(...rvScenarios.filter(r => r.preset === preset).map(r => r.oldErrorMv)) > .5, `Must reproduce old ${preset} defect`);
  const expectedCounts = {
    all: [244, 40, 20, 20, 80], defaults: [244, 0, 0, 0, 0],
    posterior: [0, 20, 20, 0, 0], wpw: [0, 20, 0, 20, 0],
    rv: [0, 0, 0, 0, 80], rv_acute: [0, 0, 0, 0, 40], rv_chronic: [0, 0, 0, 0, 40],
  };
  assert.deepEqual([defaults.length, rows.length, lowVoltageScenarios.length, wpwLowVoltageScenarios.length, rvScenarios.length],
    expectedCounts[scope], 'Incomplete scope: do not silently omit validation');
  const report = {scope, baseline, axisBaseline, commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    defaults, gainScenarios: rows, lowVoltageBaseline, lowVoltageScenarios, wpwLowVoltageBaseline, wpwLowVoltageScenarios, rvBaseline, rvScenarios, nativeTimingsUnchanged: true, clinicalValidation: false};
  const output = process.argv[2]; assert.ok(output, 'Provide result JSON path');
  await mkdir(path.dirname(path.resolve(output)), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({defaultScenarios: defaults.length, exactDefaults: defaults.filter(r => r.exact).length, intendedDefaultChanges: defaults.filter(r => r.finalAxis).length, rvScenarios: rvScenarios.length, gainScenarios: rows.length,
    maxOldErrorMv: rows.length ? Math.max(...rows.map(r => r.oldErrorMv)) : null, maxNewErrorMv: rows.length ? Math.max(...rows.map(r => r.newErrorMv)) : null,
    lowVoltageScenarios: lowVoltageScenarios.length, maxLowVoltageErrorMv: lowVoltageScenarios.length ? Math.max(...lowVoltageScenarios.map(r => r.newErrorMv)) : null,
    wpwLowVoltageScenarios: wpwLowVoltageScenarios.length, maxWpwLowVoltageErrorMv: wpwLowVoltageScenarios.length ? Math.max(...wpwLowVoltageScenarios.map(r => r.newErrorMv)) : null}));
} finally { await rm(temp, {recursive: true, force: true}); }
