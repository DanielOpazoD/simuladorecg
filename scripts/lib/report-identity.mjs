import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** Identity of evaluated code; Git commit alone does not describe a dirty tree.
 * Archive executions remain usable but explicitly have unknown Git provenance.
 */
export function reportIdentity(root = process.cwd()) {
  const engineFiles = [];
  function walk(dir) {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (entry.name.endsWith('.ts')) engineFiles.push(name);
    }
  }
  walk('src/engine');
  const inputs = [...engineFiles, 'package.json', 'package-lock.json',
    'scripts/validate-analysis.mjs', 'scripts/lib/report-identity.mjs',
    'tests/reference/ludb/load-ludb.mjs'].sort();
  const digest = createHash('sha256');
  for (const file of inputs) digest.update(file + '\0').update(readFileSync(path.join(root, file))).update('\0');
  let sourceCommit = null, sourceTree = null, worktreeDirty = null;
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    sourceCommit = git('rev-parse', 'HEAD');
    sourceTree = git('rev-parse', 'HEAD^{tree}');
    worktreeDirty = Boolean(git('status', '--porcelain', '--', ...inputs));
  } catch { /* No Git history: do not invent a commit or clean status. */ }
  return { packageVersion: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    sourceCommit, sourceTree, worktreeDirty, evaluatedSourceSha256: digest.digest('hex'),
    evaluatedFiles: inputs, clinicalValidation: false };
}
