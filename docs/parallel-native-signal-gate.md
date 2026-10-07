# Native signal evaluation outside the serial CI path

Observed before this change, PR #130's verify job 112698352098 spent 263.715 seconds
in the unchanged 1,712-case native QRS/T evaluation (08:20:49.5527569 to
08:25:13.2681962 UTC on 2026-10-07). Browser and other numerical work waited behind
it; the complete job took approximately 11 minutes 25 seconds. This observation is
not a promise of future speedup.

The native command now runs independently after the same production build. The
remaining job is named `verify-core`. Both keep the exact source version, original
commands and full test populations. The native branch archives its source,
commit, runtime and full report separately as `qrs-discrimination-${github.sha}`.
The main `ecg-evidence-${github.sha}` archive retains the other reports and browser
artifacts. No test script, tolerance, browser engine or existing timeout changes.
The new native job has an 8-minute bound; the status join has a 2-minute bound.

## Preserved fail-closed merge context

The existing check name `verify` remains, as an explicit join of every job in this
fidelity workflow: build, core, native matrix, accessibility, macOS portability
and all amplitude-regression matrix scopes. `always()` makes the join evaluate
even after an unsuccessful prerequisite, and its actual shell accepts **only**
`success` for each result. Failed, skipped, cancelled or absent results fail.
Other repository workflows remain separate required evidence; this join is not a
substitute for reviewing all exact-head checks. No branch protection is changed.

[GitHub's documented dependency behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)
explains why an ordinary dependent job could be skipped after a failure. The
explicit join prevents a skipped job from accidentally looking like acceptance.
Unit tests execute its actual shell across all-success and 24 negative result
combinations; structural mutations also check prerequisites, artifact identity
and preservation of the existing numerical/browser commands.

One extra dependency/setup job and a minimal join consume some runner resources.
Wall time and runner usage are different metrics. Report savings only from the
completed candidate run, with its exact revision; do not infer clinical fidelity
from a green workflow. The known fascicular feature gaps remain explicitly reported.
