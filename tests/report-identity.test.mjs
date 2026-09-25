import { it, expect } from 'vitest';
import { reportIdentity } from '../scripts/lib/report-identity.mjs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

it('identifies actual report version, source inputs and lack of clinical validation', () => {
 const identity=reportIdentity();
 expect(identity.packageVersion).toBe(JSON.parse(readFileSync('package.json','utf8')).version);
 expect(identity.evaluatedSourceSha256).toMatch(/^[a-f0-9]{64}$/);
 expect(identity.evaluatedFiles).toContain('src/engine/measure.ts');
 expect(identity.evaluatedFiles).toContain('src/engine/analysis/model-audit.ts');
 expect(identity.clinicalValidation).toBe(false);
 expect(identity.evaluatedSourceSha256).toBe(reportIdentity().evaluatedSourceSha256);
});
it('never invents archive Git provenance and fingerprints changed code', () => {
 const root=mkdtempSync(path.join(tmpdir(),'ecg-provenance-'));
 try {
  const source=reportIdentity();
  for(const file of source.evaluatedFiles) {
   mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
   writeFileSync(path.join(root,file),readFileSync(file));
  }
  const a=reportIdentity(root);
  expect(a.sourceCommit).toBeNull();expect(a.sourceTree).toBeNull();expect(a.worktreeDirty).toBeNull();
  expect(a.evaluatedSourceSha256).toBe(source.evaluatedSourceSha256);
  writeFileSync(path.join(root,'src/engine/measure.ts'),'// deliberate corruption for identity test');
  expect(reportIdentity(root).evaluatedSourceSha256).not.toBe(a.evaluatedSourceSha256);
 } finally {rmSync(root,{recursive:true,force:true});}
});
