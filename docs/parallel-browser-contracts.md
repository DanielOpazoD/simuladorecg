# Parallel browser contracts with preserved check names

PR #134's completed browser job 112744655764 ran seven independent scripts
serially. After production identity at 10:23:44.645 UTC (2026-10-07), completion
markers were: activation 10:25:55.804, accessibility 10:27:06.848, VVI
10:27:47.695, QRS/T 10:28:09.120, wide QRS 10:28:46.369, navigation
10:31:03.984 and regional activation 10:31:42.488. The job name `accessibility`
therefore covered much more than the accessibility script alone.

## Same tests, explicit partition

- `source`: activation and regional activation, about 169 s in that serial run
- `navigation`: diagnosis navigation, about 138 s
- `interaction`: accessibility, VVI noncapture, QRS/T and wide-QRS flows, about 171 s

These are observations excluding setup, not a speed guarantee. Every existing
script, viewport and browser engine remains unchanged. Each group downloads the
same SHA-specific production build and verifies its served identity. The matrix
has exactly three entries, `max-parallel: 3`, and `fail-fast: false` so one failure
does not hide evidence from other groups. No command is rerun for a green result.
Each evidence archive includes the group and exact build SHA in its name.

## Checks remain fail-closed

The existing `accessibility` name remains as a small join requiring successful
build and all browser-contracts matrix members. The existing `verify` join also
requires both that check and the matrix result, alongside all other fidelity
jobs. Both run with `always()` and accept only `success`, including after failed,
skipped or cancelled prerequisites. No branch protection is altered.

Tests execute the actual shell routing with harmless command stubs: every script
runs exactly once across the three groups, required engine selectors remain
`all`, every command failure propagates, and an unknown group fails. Tests also
execute both joins under success and each adverse dependency state. Mutations
reject missing groups, fast cancellation, unversioned artifacts and bypassed guards.

[GitHub's matrix documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
describes matrix execution and failure controls. Actual exact-head CI and the
three evidence inventories must still be inspected; parsing YAML is insufficient.
Extra runner setup may increase total runner use even if wall time falls. Report
only timings observed after the candidate run, not projected savings.
