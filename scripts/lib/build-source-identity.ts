import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Canonical names, original bytes: portable paths do not normalize source data. */
export function sourceIdentity(root: string, inputFiles: readonly string[]) {
  const files = inputFiles.map(file => file.replaceAll('\\', '/')).sort();
  const engineFiles = files.filter(file => file.startsWith('src/engine/'));
  if (!engineFiles.length) throw new Error('Cannot identify analysis sources: no engine files.');
  const digest = (selected: readonly string[]) => {
    const hash = createHash('sha256');
    for (const file of selected)
      hash.update(file + '\0').update(readFileSync(path.join(root, file))).update('\0');
    return hash.digest('hex');
  };
  return { files, sourceSha256: digest(files), analysisSourceSha256: digest(engineFiles) };
}
