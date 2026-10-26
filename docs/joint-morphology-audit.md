# Joint QRS–ST–T audit on final samples

The fixed protocol is `benchmarks/fidelity/joint-morphology-protocol.json`. It was written before the first run. This audit characterizes NORM, CLBBB and CRBBB without changing model parameters. Its unit is a synthetic seed recording, not a patient. Twelve preselected seeds per family are a deterministic engineering panel, not an untouched clinical reserve.

Run `node scripts/audit-joint-morphology.mjs --output <new-output-directory>` from the repository (`--out` is also supported). The command refuses an existing report and retains its production bundle, full per-beat measurements, recording summaries, model/source/protocol hashes and adversarial controls. Artifacts belong outside the repository, normally under `ECG-QA/fidelity-round2`. Run instrument tests with `node node_modules/vitest/vitest.mjs run tests/joint-morphology-audit.test.mjs`. A failed final-sample negative control sets exit status 1 **after** saving the report; clinical evidence gaps are reported separately and never turn into a claim of fidelity.

## Measurement contract fixed before inspection

Read the final 500 Hz Float64 samples from production `synthesize`; ideal acquisition and filter off still include production projection, phase gains, beat jitter, antialiasing and downsampling. Do not use latent distributions or renderer coordinates as measurements. Final samples are in mV; event times and durations are seconds. Convert derived durations to ms and integrals to mV·s explicitly. Hash exact little-endian Float64 values for every recording.

Production event onset, QRS duration and QT duration only place windows. They are not independent delineations. The reference voltage is the median from 40 to 10 ms before the event QRS onset; atrial/Ta signal can affect it. Report QRS peak-to-peak amplitude, dominant signed deflection and signed trapezoidal area; J and J+60 baseline-referred values; signed dominant repolarization deflection in J+40 through event QT end, its timing and contiguous half-height width; and ratios to QRS peak-to-peak and dominant signed deflection. The latter is a descriptive T-like/QRS relationship, not an independently delineated T amplitude. Width needs both crossings and sufficient amplitude. J60 beyond QT is unavailable; otherwise T-overlap status stays unknown because no T onset is independently available. An extremum before J60 is an additional warning, not a T-onset adjudication.

Exclude truncated, nonfinite or overlapping windows with explicit reasons. A QRS below 0.01 mV peak-to-peak or repolarization peak below 0.005 mV does not support its corresponding ratio/width. These thresholds are numerical guards, not clinical criteria. Preserve all exclusions, including insufficient beat support. Aggregate each seed recording first, then report distributions and Pearson associations by family, variant and lead; require six supported recordings for correlations. No p-values or patient confidence claims.

## Interventions and gates

Compare fixed configured defaults to the existing natural-control path with the same seed, then independently perturb natural QRS gain by ×1.2 and frontal axis by +20°. Use normal production `patchCase` to honor control semantics. Natural controls only populate NORM; the BBB identity comparison is deliberate. Defaults versus natural jointly changes intervals, axes and amplitudes and cannot isolate phase normalization. Conducted synthesis exposes no seam that disables phase normalization; do not add one or claim its causal contribution from this contrast. Learned covariance before these transforms is not evidence of preserved final covariance.

For each final recording's representative supported beat, rerun this independent sample instrument on DC-offset, scaled and inverted arrays. Compare against mathematical invariants rather than a renderer or production analyzer. Analytic fixtures also test exact units, signed area, unsupported denominators, missing crossings, missing intervals and corruption. Keep adverse results. A clean audit instrument allows descriptive reporting only. Any model correction needs a separately fixed external validation protocol, adequate independent calibrated/annotated reserve, family-specific effect and noninferiority margins, causal-contract tests and independent clinical review before a higher plausibility claim. This run cannot authorize that promotion.

## Initial characterization, 26 October 2026

Production source at `cdd55811bf260e0b74c564d454f658495f72d67e`: 144 synthetic recordings, 1,728 recording/lead combinations and 19,008 event-anchored beat/lead measurements. All 5,184 mathematical final-sample controls passed. Eighteen analytic instrument tests passed. These counts do not describe patients or external clinical comparisons.

| Family | Beat/lead windows without two half-height crossings | Recording/lead width summaries unavailable | Extremum at or before J60 |
| --- | ---: | ---: | ---: |
| NORM | 258 / 6,336 | 11 / 576 | 31 |
| CLBBB | 2,962 / 6,336 | 228 / 576 | 47 |
| CRBBB | 463 / 6,336 | 29 / 576 | 0 |

The large CLBBB width deficit is an adverse **measurement-support result**. It cannot establish a pathological width distribution or support an adjustment to it. The fixed window cannot distinguish broad T from baseline shift, fused ST–T or a clipped half-height crossing. J60 remains unclassified with respect to T onset for every family, including those with no early extremum.

All 12 BBB seeds in each family produce byte-identical configured/default and natural final-sample hashes, confirming the documented identity branch. None of the 12 NORM pairs are identical. Their differences jointly involve several controls and do not identify the causal contribution of phase normalization.

One adverse paired observation is CLBBB seed 3313, lead II: the signed dominant repolarization-window peak changes from +0.06726 mV to −0.07582 mV after QRS gain ×1.2. Both width summaries lack support. A maximum-absolute-deflection statistic can switch lobes in a biphasic waveform; this observation is not an independently established clinical T inversion. Preserve it for external, delineated review instead of smoothing it away or selecting another seed.

The full output contains per-family/per-lead distributions, associations and same-seed deltas. With 12 synthetic seeds per family, these are descriptive diagnostics of the current generator. No calibrated external reserve, independent T delineation or human reader was supplied by this audit, and no model correction or plausibility promotion was accepted.

### Instrument amendment after technical cross-review

Revision 2 fixes two independently reproduced instrument defects: a nonfinite reference metric could evade the negative-control difference comparison; a flat repolarization window received a peak time despite lacking amplitude support. The checker now rejects nonfinite references, and unsupported peak timing is explicitly null without an early-extremum warning. The original runs `joint-morphology-v1` and `joint-morphology-v1-final` retain their original protocol/instrument hashes and reports; fresh `joint-morphology-v2` and final `joint-morphology-v2-final` outputs record the amendment. Nineteen analytic tests now pass. Thresholds, seeds, production sources and model parameters are unchanged. This technical review is not independent human clinical review.
