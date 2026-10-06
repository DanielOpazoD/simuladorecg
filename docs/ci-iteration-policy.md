# PR iteration cost without weaker fidelity gates

The workflow-level concurrency key includes workflow identity, event kind and PR
number. A newer commit to the same PR may cancel the superseded run of that same
workflow. Different PRs and different workflows cannot cancel one another.
Push and manual runs use their unique run ID and are never cancelled by this
policy. This also avoids the single-pending-run replacement behavior for main:
a shared main concurrency group with `cancel-in-progress: false` would still
allow GitHub to replace an older pending run.

Source: [GitHub workflow concurrency documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).

No trigger path, job, matrix, timeout, fixture, threshold, permission or reference
cohort is removed or broadened. Only latest-head green checks authorize merge;
a cancelled historical run is never treated as a successful verification.
Workflow-contract mutation tests reject unconditional cancellation, shared
non-PR refs, and loss of workflow isolation. They verify our configuration, not
GitHub's scheduler implementation. Operational savings are not yet measured.

## Exact sample failures

The catalog determinism and flutter-clock tests now use a finite, exact,
Object.is-based sample comparator. It checks storage type, length and every
sample; reports the first offending lead/index and both scalar values; and does
not construct a full typed-array diff. Tests deliberately corrupt first, middle
and last samples in 100,000-element arrays. Failure text must remain under 160
characters, including the label used in the test. Signed-zero differences and
matching nonfinite samples fail. There is no numerical tolerance.

This bounds diagnostic output and avoids expensive diff formatting on regressions.
It is not a claim of a measured CI-duration reduction. Other waveform-region
contracts retain their existing explicit tolerances and are not replaced.

## Immutable historical workflow excluded from this optimization

The first CI attempt also changed concurrency in `ludb-frozen-baseline.yml`.
That triggered its original PR-specific contract, which requires the entire
current product to equal commit 519267d3 and the candidate analyzer to retain
those historical bytes. Current main intentionally evolved since that audit,
so the workflow failed before acquiring or evaluating any record. This is not
a new waveform regression and is not evidence that the current analyzer equals
that old version.

The optimization of that historical workflow has been reverted byte-for-byte;
its gates and trigger paths are unchanged. It is explicitly excluded from the
new concurrency contract. A separate redesign is needed to distinguish frozen
baseline reproduction from evaluation of a changed current analyzer. This PR
does not remove its assertions, rewrite its baseline, or claim it now passes.
Ten other PR workflows receive the concurrency policy described above.
