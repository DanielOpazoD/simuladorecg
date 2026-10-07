import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
for(const name of ['hr-quality','noise-stress'])it(`${name} reuses raw authenticated sources without skipping evaluation`,()=>{
 const workflow=readFileSync(`.github/workflows/${name}.yml`,'utf8');
 expect(workflow).toContain('actions/cache/restore@v6.1.0');
 expect(workflow).toContain('actions/cache/save@v6.1.0');
 expect(workflow).not.toContain('restore-keys:');
 expect(workflow.match(/cache-hit/g)).toHaveLength(1); // only save may depend on a hit
 expect(workflow.indexOf('nstdb-source-cache.py restore --')).toBeLessThan(workflow.indexOf('- name: Acquire '));
 expect(workflow.indexOf('nstdb-source-cache.py save --')).toBeLessThan(workflow.indexOf('rm -rf'));
 expect(workflow).toContain('784173f94bc103686efb321fc13f1b8f40913f76');
 expect(workflow).toContain('continue-on-error: true'); // cache service availability cannot suppress mandatory checks
 if(name==='noise-stress'){
  expect(workflow).toContain('9246093052b3171cca81fb77951fd8eb24523a7c');
  expect(workflow).toContain('3c10eacd5fa4382d232c368777bd9d5f3b7f3475');
  expect(workflow).toContain('node scripts/check-secondary-st-transition.mjs');
  expect(workflow).toContain('node scripts/check-noise-regression.mjs');
  expect(workflow).toContain('timeout-minutes: 15');
 }else{
  expect(workflow).toContain('replication-results.json');
  expect(workflow).toContain('known-results.json');
  expect(workflow).toContain('timeout-minutes: 20');
 }
});
