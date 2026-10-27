import { it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { experimentalAcquisition } from '../scripts/lib/quiet-acquisition-experiment.mjs';
const sourcePath = new URL('../src/engine/realistic/acquisition.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
it('refuses to apply the experiment to a changed generator', () => {
  expect(() => experimentalAcquisition(source.replace('const MOTION_UV = 6.5', 'const MOTION_UV = 8'))).toThrow(/source changed/);
});
it('keeps the real acquisition file unchanged and reports both source identities', () => {
  const experiment = experimentalAcquisition(source);
  expect(experiment.provenance.baselineSourceSha256).not.toBe(experiment.provenance.evaluatedSourceSha256);
  expect(experiment.provenance.changesProductionFiles).toBe(false);
  expect(readFileSync(sourcePath, 'utf8')).toBe(source);
  expect(experimentalAcquisition(source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')).provenance).toEqual(experiment.provenance);
});
it('retains the preregistered criteria after seeing rejection', () => {
  const bytes = readFileSync(new URL('../benchmarks/acquisition-cleanliness/protocol.json', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('64217557e740329eb3b681a57b341999e51124eb9ede1a3dc0f70cc3cd46722f');
});
it('refuses to overwrite an existing adverse audit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ecg-acquisition-adverse-'));
  const report = join(directory, 'report.json');
  try {
    writeFileSync(report, '{"passed":false}\n');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/audit-acquisition-cleanliness.mjs', import.meta.url)), '--output', directory], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EEXIST');
    expect(readFileSync(report, 'utf8')).toBe('{"passed":false}\n');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
