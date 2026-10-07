# Explicit event units and retained failure evidence

Evaluator defects surfaced while reviewing an unpublished regional LBBB
candidate. They must not be hidden by a passing unit count or a near-correct HR.

## Synthetic event reference

A source event's `time` and `qrs` are seconds. Its reference midpoint is
`time + qrs / 2`; dividing duration by 2000 treats seconds as milliseconds and
moves the reference toward onset. The previously blocked regional evaluator had
that error. Corrected matching exposed 15 adverse scenarios; it remains blocked.
This work does not publish that model or reinterpret those failures as success.

The current native QRS/T, noise-stress and temporal-quality evaluators now share
an evaluator-only seconds helper. It rejects missing/nonfinite durations and
millisecond values masquerading as seconds. Cropped coordinates may be negative;
the original subtraction/addition order is preserved exactly. Its single-argument signature is safe as an Array.map callback; an array index
cannot accidentally become a crop origin. The duration sanity bound is specific
to this engine, not a clinical limit. The helper never
enters the product detector, uses a requested-case fallback or reads patient
annotations. External human-reference datasets keep their separate loaders.

Tests distinguish 1.12 s from the erroneous 1.00012 s for a 240 ms complex starting
at 1 s, test cropping and reject unit/missing-value mistakes. Existing native/noise
reference values must remain identical; no tolerance or denominator changes.

## Regression failure versus malformed evidence

The noise CLI previously threw after an ordinary strict comparison returned
`fail`, then replaced the entire result with a generic `error`. This erased the
failing strata, coverage and before/after figures. The comparator had already
computed them; no new simulation is needed to retain them.

The CLI now preserves the full failed result and provenance hashes. Its final
nonzero exit remains unchanged. Malformed evidence still reports `error` and
fails. The existing comparator, margins, baseline, sample sources and every
acceptance criterion are untouched; no failure is converted into a pass.

Four actual CLI tests use synthetic reports without a dataset download: unchanged
pass, a measured regression with retained diagnostic strata, malformed evidence
and a jointly reduced cohort carrying copied frozen hash labels. Actual protocol
parameters must match the hash-verified frozen protocol, not merely each other. The regression test failed
against the old CLI before correction. Rechecking the already-rejected global
suppression experiment preserves all 151 failing strata and exits 1 without
rerunning synthesis or relaxing its rejection.

This is evaluator integrity and debugging efficiency, not clinical validation.

Local paired checks retained all 1,712 native scenario rows (1,656 represented,
56 unchanged exclusions), all 920 noise rows and all 20 native noise comparisons
exactly. The strict gate still passes the unchanged product and still rejects the
previously rejected detector experiment with all 151 adverse strata visible.
