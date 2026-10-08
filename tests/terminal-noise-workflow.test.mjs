import{it,expect}from'vitest';import{readFileSync}from'node:fs';
it('preserves both frozen ST/QT migrations and separately evaluates the current product',()=>{
 const s=readFileSync('.github/workflows/noise-stress.yml','utf8');
 expect(s).toContain('git worktree add --detach "$RUNNER_TEMP/noise-st-release" 10e3f39764ca3bf83f2fc9b543d4960ee12c1080');
 const migration=s.split('\n').find(l=>l.includes('node scripts/check-secondary-st-transition.mjs'));
 expect(migration).toContain('"$RUNNER_TEMP/noise-stress/st-release/noise-results.json"');
 expect(migration).not.toContain('"$RUNNER_TEMP/noise-stress/after/noise-results.json"');
 const historical=s.split('\n').find(l=>l.includes('node scripts/check-noise-regression.mjs'));
 expect(historical).toContain('"$RUNNER_TEMP/noise-stress/qt-release/noise-results.json"');
 expect(historical).toContain('--terminal-consensus');
 const current=s.split('\n').find(l=>l.includes('node scripts/check-released-noise.mjs'));
 expect(current).toContain('"$RUNNER_TEMP/noise-stress/qt-release/noise-results.json"');
 expect(current).toContain('"$RUNNER_TEMP/noise-stress/after/noise-results.json"');
 expect(s).toContain('d208370f883b9f1d3a22c34db62d97daacb279c6');
});

it('replays frozen terminal science without changing its protocol and checks current exact regression',()=>{
 const s=readFileSync('.github/workflows/terminal-consensus.yml','utf8');
 for(const script of ['prepare-terminal-consensus.py','validate-terminal-consensus-v1a.mjs','accept-terminal-consensus-release.mjs']){
  const calls=s.split('\n').filter(l=>l.includes('scripts/'+script));
  expect(calls.length).toBeGreaterThan(0);for(const line of calls)expect(line).toContain('cd "$RUNNER_TEMP/qt-release" &&');
 }
 const current=s.split('\n').find(l=>l.includes('node scripts/validate-released-analyzer.mjs'));
 for(const cohort of ['--original','--calibration','--exposed-v1','--consensus'])expect(current).toContain(cohort);
});
