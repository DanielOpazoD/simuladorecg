import { it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const run = (script, args, cwd) => execFileSync(process.execPath, [script, ...args], {
  cwd, env: { ...process.env, VITEST: '' }, encoding: 'utf8', timeout: 60_000,
});
function record(dir) {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
  expect(index).toHaveLength(1);
  const row = index[0], bytes = readFileSync(path.join(dir, row.file));
  expect(row.fs).toBe(500); expect(row.samples).toBe(5000);
  expect(row.leads).toEqual(['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
  expect(bytes.length).toBe(5000 * 12 * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let k = 0; k < bytes.length; k += 4) expect(Number.isFinite(view.getFloat32(k, true))).toBe(true);
  return { bytes, row };
}

it('exporta desde otro cwd: normal, clase e isquemia, con bytes repetibles', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'ecg-fidelity-cli-'));
  try {
    const cli = path.join(root, 'scripts/fidelity/export-synthetic.mjs');
    for (const preset of ['sinus', 'irbbb', 'anterior']) {
      const a = path.join(temp, `${preset}-a`), b = path.join(temp, `${preset}-b`);
      run(cli, [a, '1', preset, 'ideal'], temp);
      run(cli, [b, '1', preset, 'ideal'], temp);
      expect(record(a).bytes.equals(record(b).bytes), preset).toBe(true);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
}, 120_000);

it.each([
  ['0', 'sinus', 'ideal', '0'], ['-1', 'sinus', 'ideal', '0'],
  ['NaN', 'sinus', 'ideal', '0'], ['Infinity', 'sinus', 'ideal', '0'],
  ['1.5', 'sinus', 'ideal', '0'], ['1', 'sinus', 'ideal', '-1'],
  ['1', 'sinus', 'ideal', '2147483647'], ['1', 'sinus', 'desconocido', '0'],
])('rechaza lote inválido sin publicar un índice válido: %j', (...args) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'ecg-invalid-batch-'));
  try {
    const out = path.join(temp, 'output');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/fidelity/export-synthetic.mjs'), out, ...args], {
      cwd: temp, env: { ...process.env, VITEST: '' }, encoding: 'utf8', timeout: 5000,
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(existsSync(path.join(out, 'index.json'))).toBe(false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

it('los dos instrumentos funcionan con espacios y # en la ruta del proyecto', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'ecg fidelity # '));
  try {
    const fixture = path.join(temp, 'proyecto con espacios #'), cwd = path.join(temp, 'fuera');
    mkdirSync(fixture); mkdirSync(cwd);
    cpSync(path.join(root, 'scripts/fidelity'), path.join(fixture, 'scripts/fidelity'), { recursive: true });
    cpSync(path.join(root, 'src'), path.join(fixture, 'src'), { recursive: true });
    cpSync(path.join(root, 'package.json'), path.join(fixture, 'package.json'));
    symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const out = path.join(temp, 'salida con espacios #');
    run(path.join(fixture, 'scripts/fidelity/export-synthetic.mjs'), [out, '1', 'sinus', 'ideal'], cwd);
    record(out);
    const result = run(path.join(fixture, 'scripts/fidelity/choose-textbook-seed.mjs'), ['5'], cwd);
    expect(result).toMatch(/Cumplen \d+\/5/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}, 120_000);
