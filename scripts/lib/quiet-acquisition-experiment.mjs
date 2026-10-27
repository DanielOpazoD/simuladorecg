/** Offline rejected candidate. Nothing under src imports this module. The product
 * source is checked before injecting the one preregistered change into memory. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const BASELINE_ACQUISITION_SHA256 = 'd049659fb0117a7efc3ccc5cce2de2a69042db0350032ce1edc19316e1860d57';
const hash = s => createHash('sha256').update(s).digest('hex');
const insertion = `  // Offline quiet-v1 candidate: never written into product source.
  if ((c as ECGCase & { acquisitionProfile?: string }).acquisitionProfile === "quiet-v1")
    for (const channel of out) for (let i = 0; i < channel.length; i++) channel[i] *= 0.5;
  return out;`;

export function experimentalAcquisition(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  assert.equal(hash(normalized), BASELINE_ACQUISITION_SHA256, 'Acquisition source changed; review the experiment rather than silently rebase it');
  assert.equal(normalized.split('  return out;').length, 2, 'Expected one acquisition-floor return');
  const contents = normalized.replace('  return out;', insertion);
  return { contents, provenance: { baselineSourceSha256: hash(normalized), evaluatedSourceSha256: hash(contents),
    intervention: 'Final acquisition floor ×0.5 only when the offline case has acquisitionProfile quiet-v1',
    changesProductionFiles: false, clinicalValidation: false } };
}

export function quietAcquisitionPlugin(root, record) {
  const target = path.resolve(root, 'src/engine/realistic/acquisition.ts');
  return { name: 'offline-rejected-quiet-acquisition', setup(build) {
    build.onLoad({ filter: /acquisition\.ts$/ }, async args => {
      if (path.resolve(args.path) !== target) return undefined;
      const transformed = experimentalAcquisition(await readFile(target, 'utf8'));
      record(transformed.provenance);
      return { contents: transformed.contents, loader: 'ts', resolveDir: path.dirname(target) };
    });
  } };
}
