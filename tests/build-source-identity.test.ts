import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sourceIdentity } from '../scripts/lib/build-source-identity';

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ecg-source-identity-'));
  fixtures.push(root);
  mkdirSync(path.join(root, 'src', 'engine'), { recursive: true });
  mkdirSync(path.join(root, 'src', 'ui'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'engine', 'a.ts'), 'signal\r\n');
  writeFileSync(path.join(root, 'src', 'engine', 'b.ts'), 'measure\n');
  writeFileSync(path.join(root, 'src', 'ui', 'view.ts'), 'paper\n');
  return root;
}
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});
const files = ['src/engine/b.ts', 'src/ui/view.ts', 'src/engine/a.ts'];

describe('portable, byte-exact build provenance', () => {
  it('matches a fixed independently ordered byte stream for both path conventions', () => {
    const root = fixture();
    const expected = createHash('sha256')
      .update('src/engine/a.ts\0signal\r\n\0src/engine/b.ts\0measure\n\0').digest('hex');
    const posix = sourceIdentity(root, files);
    const windows = sourceIdentity(root, [...files].reverse().map(file => file.replaceAll('/', '\\')));
    expect(posix.analysisSourceSha256).toBe(expected);
    expect(windows).toEqual(posix);
    expect(posix.analysisSourceSha256).not.toBe(createHash('sha256').digest('hex'));
  });
  it('detects engine-byte changes but separates UI changes from analysis identity', () => {
    const root = fixture();
    const original = sourceIdentity(root, files);
    writeFileSync(path.join(root, 'src', 'ui', 'view.ts'), 'paper v2\n');
    const visual = sourceIdentity(root, files);
    expect(visual.sourceSha256).not.toBe(original.sourceSha256);
    expect(visual.analysisSourceSha256).toBe(original.analysisSourceSha256);
    writeFileSync(path.join(root, 'src', 'engine', 'a.ts'), 'Signal\r\n');
    const engine = sourceIdentity(root, files);
    expect(engine.sourceSha256).not.toBe(visual.sourceSha256);
    expect(engine.analysisSourceSha256).not.toBe(visual.analysisSourceSha256);
  });
  it('rejects missing engine input and unreadable declared sources', () => {
    const root = fixture();
    expect(() => sourceIdentity(root, ['src/ui/view.ts'])).toThrow('no engine files');
    expect(() => sourceIdentity(root, ['src/engine/missing.ts'])).toThrow();
  });
});
