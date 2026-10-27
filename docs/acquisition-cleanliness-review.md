# Acquisition texture: a rejected quieter default

The fixed `quiet-v1` candidate is **rejected**. The simulator keeps the acquisition
behavior of commit `0b704cf00ca623c2062c5efb6dd7086922d7efa7`. No generator,
analyzer, renderer, model coefficients, exported-case schema or UI default changes
are included. The candidate survives only as an offline, source-hash-guarded
experiment. A cleaner-looking trace did not pass the predetermined engineering
acceptance gates, and the exploratory real recordings do not support a universal
claim that the existing noise is excessive.

## Question and fixed decision rule

The initial observation was excessive-looking trace irregularity. Acquisition
texture and residual learned morphology were separated before tuning: setting
manual artifact controls to zero does not disable the realistic acquisition floor;
ideal acquisition also leaves some irregularities. The shape builder excludes
noise-quality flags for NORM, but not all pathological families. Thus irregular
learned morphology must not automatically be treated as either physiological
detail or removable acquisition noise.

[`protocol.json`](../benchmarks/acquisition-cleanliness/protocol.json) was fixed
before evaluation (canonical LF SHA-256
`64217557e740329eb3b681a57b341999e51124eb9ede1a3dc0f70cc3cd46722f`). The sole
candidate halves the entire additive acquisition floor, with no parameter search.
It does not smooth the cardiac signal or change manual artifacts. Historical
exported cases were frozen beforehand as 18 complete cases with final sample hashes.

Acceptance required the specified texture reduction, no per-window morphology
error worsening beyond 5 µV or 0.001 mV·s relative to the paired ideal signal, and
no additional analyzer regressions within family/cohort/filter strata. Gains in
one case cannot compensate for losses elsewhere. These are engineering limits,
not externally established diagnostic tolerances. Clinical plausibility requires
additional independent patient evidence and independent human clinical review.

## Evaluation and adverse results

The evaluator uses final 12-lead samples after all transformations and quantization.
There are 207 recordings: 63 active catalog presets and 144 synthetic reserve
combinations (six families × 12 predeclared seeds × two filters). The reserve
changes seeds while retaining each preset's controls; it does not sample new
patients or independently vary the natural-control distribution. The five pending
catalog entries are excluded. The browser's preset count uses a different scope.

The analyzer receives only samples and sample rate. Its bundle is checked for
generator/reference imports. Event references are used only by the evaluator:
QRS matching uses the event midpoint, and interval errors use assigned model
durations. Morphology uses event-anchored windows (baseline −35 to −20 ms;
QRS onset to J; ST–T J+40 ms to assigned QT). Truncated/overlapping/unsupported
windows are retained as exclusions. These windows and interval references are
not independently adjudicated clinical boundaries.

| Gate | Result |
|---|---:|
| Historical final-sample hashes | 18/18 pass |
| Negative controls | 828/828 pass |
| Texture reduction | Pass |
| Morphology threshold exceedances | 123: 63 QRS peak-to-peak, 42 ST–T peak, 18 ST–T area |
| Analyzer gate violations | 14 metric/stratum violations |
| Additional usable estimates outside model-reference limits | 8 (7 QRS, 1 QT) |
| Previously usable/correct estimates lost | 12 |
| Software execution failures | 0 |
| Promote default / clinical validation | **No / no** |

The full per-family/filter/cohort results and every gate violation are retained in
[`result-summary.json`](../benchmarks/acquisition-cleanliness/result-summary.json).
The 14 violations are metric/stratum tests, not 14 distinct recordings or 14
distinct strata. The eight estimates are not demonstrated clinical diagnostic
errors: their reference is the model and the limits above. Nevertheless they
violate the acceptance rule. Identical cardiac components do not guarantee
monotonic extrema/area errors or stable analyzer decisions when additive noise
changes. The causal negative controls passed; the observation gates did not.

The first evaluator run incorrectly used a uniform 2 µV numerical bound for the
four-term manual-artifact subtraction. The corrected bound propagates quantization
through limb coefficients: 2 µV for independent leads, 4 µV for III/aVR and 5 µV
for aVL/aVF. This correction affects only a numerical identity control; the texture
and morphology/analysis criteria remain unchanged. Both initial and corrected
adverse reports are retained. Repeating the corrected experiment through the
offline injection produced a byte-identical summary to the temporary prototype.

## Original recordings: mixed evidence, not an independent reserve

Twenty distinct PTB-XL 1.0.3 patients were selected from metadata before waveform
inspection: adult NORM/SR, ten from fold 9 and ten from fold 10, with the specified
quality flags absent. The 605 previously identified exposed PTB-XL patients were
excluded. Original headers and samples were downloaded from the official public
mirror, and all 40 waveform/header files matched official SHA-256 checksums.
The headers establish 500 Hz, 12 channels and physical gains in mV.

The selection does **not** establish independence: historical NORM600 fold9/10
membership and executed training membership remain incomplete. These 20 patients
are now explicitly exposed in the evidence inventory; they are not a future
holdout. The manifest retains patient/record/fold identities and checksums.

The comparison uses the same external causal 0.05 Hz high-pass operator once on
both sources, with one second excluded at each end. Synthetic generation uses
filter `off`, but internal antialias remains; this does not equalize original
recorder filtering. TP windows come from the existing signal-derived heuristic,
not generator events or human annotations. 190 real windows were included and 34
excluded; each synthetic reserve profile included 120 and excluded 12. The
high-frequency measurement spans 25–249 Hz. These are descriptive texture
measurements, with possible residual physiological content in the windows.
The descriptive exporter recalculates natural controls for each seed; the
engineering acceptance audit holds preset controls fixed. They share declared
seeds, not identical cases or filter pipelines.

| Median across recordings | Real, n=20 | Existing, n=12 | Half floor, n=12 | Ideal, n=12 |
|---|---:|---:|---:|---:|
| Lead II high-frequency RMS, µV | 3.79 | 3.55 | 1.99 | 0.47 |
| V2 high-frequency RMS, µV | 1.50 | 2.26 | 1.29 | 0.30 |
| V2 STD of TP-window median levels, µV | 32.28 | 62.46 | 56.19 | 49.56 |

Halving the floor brings V2 high-frequency RMS closer to this reference but makes
lead II quieter than it. Much of the V2 window-level variation remains in ideal
acquisition. This supports investigating residual morphology/window composition
before globally suppressing acquisition texture. It does not establish that the
remaining irregularities are physiological, that the current generator is
clinically realistic, or that disease families match this NORM-only reference.

Source: [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/).
The sample plot is produced by Matplotlib from sample arrays, independently of
the application renderer. A single displayed record is illustrative; the table
uses the whole selected cohort. Product pixels/export paths are unchanged, and
the existing independent pixel oracle remains the screen/export regression gate.

## Reproduce and preserve

After `npm ci`, from the repository root:

```sh
node scripts/audit-acquisition-cleanliness.mjs --output /absolute/new-output-directory
```

The destination must not exist. The audit writes full per-window/per-lead reports,
source hashes and all failures; **exit code 1 is the expected candidate rejection**.
The experiment checks the original acquisition source hash and injects the single
factor into the temporary esbuild bundle in memory. It never writes product source.
See [`scripts/acquisition-reference/README.md`](../scripts/acquisition-reference/README.md)
for original-record download and descriptive comparison reproduction.

The local complete reports, including the failed first evaluator and independent
plot, are indexed with checksums in
[`run-provenance.json`](../benchmarks/acquisition-cleanliness/run-provenance.json).
Large raw data and full reports stay outside Git; compact adverse summaries and
the reproduction code are committed. The refusal is an experiment outcome,
not a passing clinical validation or an implemented quieter default. Any future
candidate needs newly fixed criteria and an eligible reserve; this experiment's
seeds and patients must be considered exposed.

Validation of this audit package: the existing 2,539 tests plus three experiment
guards passed (190 test files); an additional adverse-report overwrite test then
passed with the focused suite. Type checking and production build passed. The
unchanged independent pixel oracle passed eight cases and three negative controls.
The portable reference pipeline reproduced all 39 synthetic files byte for byte
and all 59 per-record measurements and group aggregates exactly. An independent
code/evidence review checked the rejection, source isolation and provenance; this
is not independent human clinical review.
