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
 const prior=s.split('\n').find(l=>l.includes('node scripts/check-released-noise.mjs')&&!l.includes('--strict-released'));
 expect(prior).toContain('"$RUNNER_TEMP/noise-stress/qt-release/noise-results.json"');
 expect(prior).toContain('"$RUNNER_TEMP/noise-stress/identity-before/noise-results.json"');
 expect(prior).not.toContain('"$RUNNER_TEMP/noise-stress/after/noise-results.json"');
 expect(s).toContain('git worktree add --detach "$RUNNER_TEMP/noise-identity-before" 179a128bf70509b0f1c85fa2a6a9ba7cfa4f478b');
 const strict=s.split('\n').filter(l=>l.includes('node scripts/check-released-noise.mjs')&&l.includes('--strict-released'));
 expect(strict).toHaveLength(4);
 expect(strict[0]).toContain('\"$RUNNER_TEMP/noise-stress/identity-before/noise-results.json\"');
 expect(strict[0]).toContain('\"$RUNNER_TEMP/noise-stress/identity-release/noise-results.json\"');
 expect(strict[0]).not.toContain('\"$RUNNER_TEMP/noise-stress/after/noise-results.json\"');
 expect(s).toContain('8f31167d3f7d0314ca6b1851efdeaffe6d3a551f');
 expect(strict[1]).toContain('"$RUNNER_TEMP/noise-stress/identity-release/noise-results.json"');
 expect(strict[1]).toContain('"$RUNNER_TEMP/noise-stress/wave-release/noise-results.json"');
 expect(s).toContain('git worktree add --detach "$RUNNER_TEMP/noise-wave-release" e588cddbe54479d8157246cb784a6415bccde46f');
 expect(strict[2]).toContain('"$RUNNER_TEMP/noise-stress/wave-release/noise-results.json"');
 expect(strict[2]).toContain('"$RUNNER_TEMP/noise-stress/support-release/noise-results.json"');
 expect(s).toContain('git worktree add --detach "$RUNNER_TEMP/noise-support-release" ddba83dcbc85cbc8679986380446fc6aebbe7e20');
 const current=strict[3];
 expect(current).toContain('"$RUNNER_TEMP/noise-stress/support-release/noise-results.json"');
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

it('pins the current strict noise comparator to the same published source as its workflow',()=>{
 const checker=readFileSync('scripts/check-released-noise.mjs','utf8');
 expect(checker).toContain("strictReleased?'ddba83dcbc85cbc8679986380446fc6aebbe7e20'");
 expect(checker).toContain("strict against immutable PR155; no migration waiver");
 expect(checker).toContain("assert.equal(strict.status,'pass'");
});
