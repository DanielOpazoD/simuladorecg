import{it,expect}from'vitest';import{readFileSync}from'node:fs';
it('reproduces the frozen ST source migration separately from the current QT estimator',()=>{
 const s=readFileSync('.github/workflows/noise-stress.yml','utf8');
 expect(s).toContain('git worktree add --detach "$RUNNER_TEMP/noise-st-release" 10e3f39764ca3bf83f2fc9b543d4960ee12c1080');
 const migration=s.split('\n').find(l=>l.includes('node scripts/check-secondary-st-transition.mjs'));
 expect(migration).toContain('"$RUNNER_TEMP/noise-stress/st-release/noise-results.json"');
 expect(migration).not.toContain('"$RUNNER_TEMP/noise-stress/after/noise-results.json"');
 const current=s.split('\n').find(l=>l.includes('node scripts/check-noise-regression.mjs'));
 expect(current).toContain('"$RUNNER_TEMP/noise-stress/after/noise-results.json"');
 expect(current).toContain('--terminal-consensus');
});
