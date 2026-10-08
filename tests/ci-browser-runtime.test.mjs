import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/fidelity.yml','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const job=(text,name)=>text.match(new RegExp('(?:^|\\n)  '+name+':\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)'))?.[1]??'';
function check(text,version=pkg.devDependencies.playwright){
 expect(version).toMatch(/^\d+\.\d+\.\d+$/);
 for(const name of ['verify-core','browser-contracts']) {
  const body=job(text,name);
  expect(body).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble`);
  expect(body).toContain('options: --user 1001');
  expect(body).toContain('defaults:\n      run:\n        shell: bash');
  expect(body).toContain('run: npm ci');
  expect(body).toContain('run: node scripts/verify-browser-runtime.mjs');
  expect(body).not.toMatch(/npm install|playwright install|continue-on-error|--privileged|--ipc=host|--network=host/);
  expect(body).toContain(`timeout-minutes: ${name==='verify-core'?25:15}`);
 }
}
it('uses the exact lockfile browser version and preinstalled binaries on both browser jobs',()=>{
 check(workflow);
 expect(lock.packages[''].devDependencies.playwright).toBe(pkg.devDependencies.playwright);
 for(const key of ['node_modules/playwright','node_modules/playwright-core'])expect(lock.packages[key].version).toBe(pkg.devDependencies.playwright);
});
it('rejects version drift, dependency mutation and skipped runtime checks',()=>{
 const browser=job(workflow,'browser-contracts');
 const mutations=[
  workflow.replace('v1.63.0-noble','v1.62.0-noble'),
  workflow.replace(browser,browser.replace('run: npm ci','run: npm install')),
  workflow.replace('run: node scripts/verify-browser-runtime.mjs','run: true'),
  workflow.replace('options: --user 1001','options: --privileged'),
 ];
 for(const changed of mutations)expect(()=>check(changed)).toThrow();
 expect(()=>check(workflow,'^1.63.0')).toThrow();
});

it('uses the container-mapped temporary directory for shell report arguments',()=>{
 const core=job(workflow,'verify-core');
 expect(core).toContain('--outputFile="$RUNNER_TEMP/unit-results.json"');
 for(const line of core.split('\n').filter(l=>l.includes('run:')))
  expect(line).not.toContain('${{ runner.temp }}');
 // Environment/action inputs are translated by Actions; shell text is not.
 expect(core).toContain('ECG_EVIDENCE_DIR: ${{ runner.temp }}/ecg-evidence/browser');
});
