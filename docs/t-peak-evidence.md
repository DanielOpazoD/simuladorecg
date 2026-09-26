# T peak evidence without fabricated QT

## Scope

This is a deliberately smaller successor to one aspect of draft PR27. The original
PR27 also changes T onset and endpoint rules, fails three isolated-QT contracts and
other CI jobs, and is not integrated here. A local attempt to recover T endings from
terminal quiet slopes increased QT error; that experiment was discarded.

The reviewed product intervention is four lines in `measure.ts`: publish the already
computed envelope T-peak candidate when the existing amplitude/noise requirements
pass, even if terminal return is unresolved. Existing thresholds and peak positions
are unchanged. No new T end, tangent end, QT/QTc, P/QRS value, axis, status, support or
rejection is created or changed. The UI calls this **T candidata**, explains its
four-lead envelope origin and does not draw a QT interval without a measured end.
It is not a validated per-lead T peak, diagnosis, probability or safe clinical QT.

## Frozen comparison

The comparator uses actual product commit `519267d3b595a27ea8d35a5eae6296c780b58ec4`
with the unchanged evaluator integrated by PR28. Original PR17 40-record results and
the already observed PR26 40-record calibration results are reported separately.
The reserved holdout is neither downloaded nor evaluated. Source preparation retains
independent WFDB verification. The analyzer receives only `{fs, leads}`.

`assertPeakOnlyChange` permits only null-to-finite `tPeak` on the same QRS beat while
T-end, tangent-end and QT are null. Deep equality is required for everything else,
including quality/support/rejections. Adversarial tests reject unwanted numeric,
status, boundary, population and existing-peak changes. The same check covers all
61 presets in four filter modes (244 scenarios), on identical physical samples.

Historical protocol hashes are not rewritten. The four-line change is explicitly
pinned in `scripts/lib/t-peak-revision.mjs`; HR/repolarization historical comparisons
allow only that reviewed amendment and still check numerical preservation. The
historical QRS benchmark accepts an explicit source root so it can keep running its
actual frozen analyzer, rather than pretending the new file is byte-identical. The
PR28 one-off `ludb-frozen-baseline.yml` still describes the old unchanged-product
milestone; the new paired workflow is the active gate for this revision.

## Observed development results, not a new validation cohort

| Cohort | Baseline T TP/FP/FN | Candidate T TP/FP/FN | Newly exposed candidates, all windows |
|---|---:|---:|---:|
| Original 40 | 67 / 0 / 244 | 290 / 6 / 21 | 254 |
| Calibration 40 | 117 / 1 / 223 | 307 / 23 / 33 | 230 |

These use PR28's explicit annotation windows and incomplete-reference handling,
not the older PR26 event accounting. New candidates include observations outside
scorable windows, so the last column is not the change in TP+FP. Original-cohort
T-peak p95 increases from 31 to 42 ms; calibration p95 is 87 ms after the change.
More visible candidates also produce more false positives: this is not a claim of
uniformly better peak accuracy. Numeric QT and its availability/quality are unchanged.
The local 244-scenario check exposes 713 candidates without altering any other output.

The separate CI artifacts must reproduce these observations with esbuild/npm ci.
Native TypeScript execution is a local cross-check, not an installation/build claim.
CI additionally exercises the compiled Worker and UI at desktop and mobile viewport
sizes, including switching leads and leaving the candidate case. No physical-phone,
clinical, new-holdout or deployment claim is made.

## Next numerical T-end intervention

Keep it separate. Compare a frozen candidate with coverage and retained-error gates,
including false-positive peaks, U/biphasic T, overlapping waves and known noise tests.
Do not grant usable QT because a peak alone is visible. Do not broaden tolerances or
withdraw difficult records to make an apparent improvement. LUDB's four-lead aggregate
is an evaluation construction, not original global human annotation.
