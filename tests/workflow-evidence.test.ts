import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const workflow=readFileSync(new URL('../.github/workflows/fidelity.yml',import.meta.url),'utf8');
const build=workflow.split('  build:')[1].split('  portability:')[0];
const verify=workflow.split('  verify-core:')[1].split('  verify:')[0];
const accessibility=workflow.split('  browser-contracts:')[1].split('  accessibility:')[0];
describe('CI evidence reuse without coverage removal',()=>{
  it.each([
    ['activation','ECG_ACTIVATION_ENGINES'],
    ['diagnosis-navigation','ECG_GROUP_ENGINES'],
    ['regional-activation','ECG_REGIONAL_ENGINES'],
  ])('runs %s exactly once, across all three engines', (script,env)=>{
    const command=`node tests/browser-${script}.mjs`;
    expect(workflow.split(command)).toHaveLength(2);
    expect(accessibility).toContain(`${env}=all ${command}`);
    expect(verify).not.toContain(command);
  });
  it('transfers only the exact dist while retaining the complete evidence archive',()=>{
    expect(verify).toContain('name: ecg-browser-build-${{ github.sha }}');
    expect(build).toContain('path: dist/');
    expect(build).toContain('name: ecg-browser-build-${{ github.sha }}');
    expect(verify).toContain('path: dist');
    expect(accessibility).toContain('name: ecg-browser-build-${{ github.sha }}');
    expect(accessibility).toContain('path: dist');
    expect(accessibility).not.toContain('npm run build');
    expect(accessibility).toContain('ECG_EXPECT_COMMIT: ${{ github.sha }}');
    expect(accessibility).toContain('node scripts/verify-production.mjs');
    expect(verify).toContain('name: ecg-evidence-${{ github.sha }}');
    expect(verify).toContain('git archive HEAD');
    expect(verify).toContain('cp -r dist');
  });
  it('retains each numerical gate and both independent consumers of the exact build',()=>{
    for(const command of ['npm test','validate-regional-activation.mjs','validate-repolarization-scope.mjs','validate-repolarization.mjs','validate-posterior-amplitude.mjs']) expect(verify).toContain(command);
    expect(accessibility).toContain('needs: build');
    expect(verify).toContain('needs: build');
    expect(accessibility).toContain('chromium webkit firefox');
    expect(accessibility).toContain('node tests/browser-accessibility.mjs');
    expect(accessibility).not.toContain('continue-on-error');
  });
});
