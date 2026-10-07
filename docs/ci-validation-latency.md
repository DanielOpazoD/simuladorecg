# Parallel validation of one production build

The numerical/source gate and the three-engine UI gate remain separate required
results. Previously the UI job waited for the entire numerical job, even though
its only input was the completed production build. A small `build` job now
publishes that exact commit-qualified artifact; both gates depend on it and run
independently. A green build alone is never release acceptance.

Both environments still verify commit, clean source fingerprint and every served
asset byte. The numerical gate still runs every source/measurement check and its
browser/PNG metrology suite. The multi-engine gate still runs all its original
scripts, engines, viewports, retries (none added) and timeouts. The macOS unit and
build run remains independent. No dataset, protocol, tolerance, clinical claim or
application source changes in this scheduling revision.

## Measured baseline and prospective comparison

Baseline head `3ab747aeb71da76ad396de4dd47aa0599716ae4d`, workflow run
[37565858916](https://github.com/DanielOpazoD/simuladorecg/actions/runs/37565858916):

- `verify`: 2026-10-07 03:14:58–03:23:53 UTC, 8 min 55 s
- `accessibility`: 03:23:56–03:32:43 UTC, 8 min 47 s
- First start to final completion: 17 min 45 s

The expected critical path becomes build time plus the slower validation branch,
rather than the sum of both branches. That is a scheduling hypothesis, not a
measured saving yet; runner availability, downloads and test variability still
matter. Record the first completed candidate run and compare its start/end times
before claiming a speedup. Total test work is preserved; only the unnecessary
serial dependency is removed.

## Guardrails

`tests/ci-build-fanout.test.mjs` checks the single commit-qualified build handoff,
both served-source checks, all eighteen browser entrypoints, numerical gates and
macOS verification. Negative controls remove a browser gate, substitute an
unversioned artifact, restore serial waiting or remove one source identity check;
each must be rejected. No `continue-on-error` or skipped validation is admitted.
The workflow must also be parsed as YAML and executed on GitHub; text contracts
alone cannot prove orchestration or browser correctness.
