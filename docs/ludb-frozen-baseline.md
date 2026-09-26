# Original LUDB cohort: frozen baseline, before any algorithm change

## Scope and relation to PR #26

PR #26 (`be820726`) already evaluated a newly selected 40-record calibration set.
The clarified request is different: evaluate the **original PR17 cohort of 40**
against the immutable product `519267d3b595a27ea8d35a5eae6296c780b58ec4`.
This supplement does that. It does not modify the product, its presets, filters,
quality policy, historical benchmarks, or the PR26 calibration/holdout split.
No new physiological model or delineator is implemented here.

The original cohort is already observed engineering data, not a new holdout.
Its existing protocol is reused byte-for-byte and checked by SHA-256. No original
record is replaced. No calibration or reserved holdout ID is downloaded by this job.

## What is frozen

`benchmarks/ludb-baseline/protocol.json` identifies the baseline, historical cohort,
and hashes of all nine runtime analyzer source files. CI checks actual checkout
identity and the complete esbuild dependency set; an arbitrary `--commit` label or
an unexpected dependency cannot masquerade as the baseline. Source samples are
checksummed before and after analysis. The analyzer receives only `{fs, leads}`.

The baseline and unchanged candidate run with identical inputs and evaluator.
CI requires identical complete measurements, summaries and record-level reports.
It also requires zero changes to `src/`, `public/`, package/lock and core build
files, and preserves the historical LUDB/PTB-XL+/NSTDB protocols. The existing
ECG fidelity workflow still runs the full product suite, build and browser tests.
An unchanged source tree is preservation evidence, not a claim that every
historical external benchmark was newly rerun in this supplement.

## Evaluation distinctions that cannot be hidden

**QRS detection vs delineation.** All `detectedPeaks` are evaluated. A detected
complex without an accepted delineation still counts as a detection, but contributes
no invented onset/offset. P offset and T onset are not exposed by this baseline;
their reference-eligible coverage remains zero and their errors remain null.

**Scoring window.** For each wave, score from first complete aggregate peak minus
150 ms through last plus 150 ms, clipped to the analysis window. Count predictions
outside that window separately. Unmatched predictions near explicitly incomplete
reference groups are unscored and reported. No complete aggregate reference means
unscored, not proven absence. Sensitivity/PPV apply only to this evaluable population.
A match within 150 ms is an event association, not acceptable boundary accuracy.

**Reference intervals.** Only a unique P/T association in the fixed time window
is used. Multiple candidates, missing needed boundaries, or overlap remain explicit.
T **offset**, not just T peak, must precede the next QRS boundary minus 20 ms.
This temporal construction still does not establish AV conduction. Per-record
median errors are distinguished from intervals on matched beats; their populations
can differ. A global `usable/review/unavailable` flag is not per-beat confidence.

**Statistics.** Bias, MAE, ordinary median absolute error, nearest-rank p95, maximum,
numerator/denominator coverage, micro summaries and unweighted per-record macro MAE.
Status percentages use all 40 records; coverage also states reference-eligible
records. `review` retains a value and is not abstention. Empty errors are null.
These conventions are explicit and do not rewrite historical reports/statistics.

## Initial local result (not yet an npm-ci or CI verification claim)

Executed with Node 22.16.0 and native TypeScript type stripping. This local path
first reproduced the entire existing PR26 calibration summary exactly. The original
cohort source ZIP SHA-256 was checked against its GitHub Actions artifact digest.
The committed workflow must independently reproduce results with npm ci + esbuild.

| Endpoint | MAE ms | p95 ms | Maximum ms | Reference-eligible coverage |
|---|---:|---:|---:|---:|
| QRS peak (detection candidate) | 15.61 | 29 | 42 | 350/350 |
| QRS onset | 11.68 | 26 | 124 | 326/344 |
| QRS offset | 11.35 | 34 | 108 | 331/349 |
| P onset | 20.02 | 72 | 102 | 129/262 |
| P offset | null | null | null | 0/262 |
| T onset | null | null | null | 0/311 |
| T offset | 98.42 | 302 | 370 | 67/311 |

QRS event detection: 350 TP / 16 FP / 0 FN, sensitivity 100%, PPV 95.63%
in the specified evaluation windows. P: 129 TP / 0 FP / 133 FN. T: 67 TP /
0 FP / 244 FN. The latter PPVs do not imply complete or clinically accurate
recognition: P/T sensitivities are only 49.24% / 21.54%; outside/unscored events
remain separately reported.

| Record summary | MAE ms | p95 / maximum ms | Numeric / eligible | Usable / review / unavailable (all 40) |
|---|---:|---:|---:|---:|
| PR | 5.88 | 13 / 13 | 8/35 | 5% / 15% / 80% |
| QRS | 15.75 | 40 / 51 | 40/40 | 35% / 65% / 0% |
| QT | 67.67 | 207 / 207 | 6/40 | 0% / 15% / 85% |

The small PR MAE describes only eight returned record summaries, not reliable
PR measurement on all records. Likewise, absent QT values are not zero error.
Full output also includes bias, median, paired-beat interval errors, denominators,
per-record quality reasons and review queues.

## Failure analysis and next change

The numerical priority is T recovery and termination, not adding presets. QRS peak
detection can succeed while P/T delineation fails. Failure triage flags missed waves,
large T-end errors, wide annotated QRS, elevated reference rate and ambiguous interval
references. Low-amplitude T, hidden P, secondary repolarization, noise, polarity changes
and ST displacement remain **manual checks**, not diagnoses inferred from an error.
A clinician must adjudicate mechanism from the traces before a causal claim is made.

No delineator correction is bundled with these measurements. The next intervention
must isolate one demonstrated mechanism, preserve numerical/source provenance, test
matched before/after coverage and retained error, and retain all existing product
and external-reference safeguards. Reserved holdout stays closed during development.

## Reproduce

```sh
npm ci
node --test tests/ludb-frozen-baseline.node.mjs
python -m pip install wfdb==4.3.1
python scripts/prepare-ludb-expansion.py --output /tmp/ludb-original --crosscheck
git worktree add /tmp/ecg-baseline 519267d3b595a27ea8d35a5eae6296c780b58ec4
node scripts/validate-ludb-frozen-baseline.mjs \
  --fixtures /tmp/ludb-original/fixtures --source-root /tmp/ecg-baseline \
  --commit 519267d3b595a27ea8d35a5eae6296c780b58ec4 --role baseline \
  --output /tmp/ludb-original/baseline.json
```

LUDB 1.0.1: Kalyakulina et al., DOI 10.13026/eegm-h675;
https://physionet.org/content/ludb/1.0.1/ . Publication:
IEEE Access 2020, DOI 10.1109/ACCESS.2020.3029211.
Original annotations are independent per lead, not human global fiducials.
Data attribution/license are retained by the existing preparation pipeline.
A green workflow demonstrates reproducibility, not clinical validation or safety.
