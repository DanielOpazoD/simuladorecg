# Continuous broad-complex candidates: scope and acceptance

This numerical iteration follows PR115 (`63f32b03921158337052e7068abcb6e72ec72f79`).
It changes candidate selection, not the generator, acquisition filters or existing
morphology landmarks. A retained boundary estimate is not thereby more accurate.

## Defects and mechanism

A broad continuous deflection can have strong rising and falling derivative peaks
more than the detector's 180 ms spacing apart. Counting both as separate QRS
complexes can approximately double the rate. A smooth T may also have more
short-window derivative energy than a broad QRS; an energy-ratio prerequisite
alone is not a sound way to identify every T candidate.

The additional clean-shape branch requires near-rank-one derivative covariance,
a higher-dimensional preceding shape, and lower normalized curvature. Its strict
numerical thresholds are exposed engineering choices, not clinical cutoffs.

The continuous-component screen acts only when close candidates exist (180–280 ms)
and at least three seconds of samples are available. In the detector's first ten
seconds it estimates a recurrent four-lead return level with bins 2% of the robust
2nd–98th-percentile range. The most frequent bin must contain at least 4% of samples.
This mode is a statistical return level, not proof of a physiological baseline.
Between close candidates, excluding 24 ms at either edge, the deflection must
remain above 12% of its pairwise maximum distance from that level. Finally, the
centered 80 ms shapes must be opposed (correlation below −0.5). Similar recurring
complexes must remain separate. No diagnosis, pacing mode or model event enters
these decisions; no rate is halved by consulting its programmed value.

All original landmarks remain available to the existing boundary estimator.
The refined ventricular train uses a subset of original candidate times and never
moves them. Waveform samples are unchanged. QRS/PR/QT boundary accuracy remains a
separate limitation; no new diagnostic interpretation is inferred from grouping.

## Refutation and adverse evidence

A continuity-only experiment passed 588 configurations but failed two additional
fast-VT scenarios at 240 bpm / QRS240 ms: it discarded true activations. It was
rejected. The opposed-shape condition addresses that counterexample; two explicit
negative tests fail when that condition is removed and pass when restored.

Analytical C1-deflection tests isolate grouping at 100/250/500/1000 Hz, preservation
of separate narrow complexes and genuine fast broad trains, input immutability,
DC/gain and polarity behavior. These are mathematical test signals, not patient
ECGs. Four positive tests fail on the numerical predecessor; negative controls
remain. Native fast-VT tests preserve the predecessor's detection floor while
allowing future improvement; they do not bless its existing missed detections.

## Evaluation contract

The native comparison advances explicitly to the already merged PR115 release,
so the first correction cannot be silently undone. Historical numerical-source
manifests and original noise/LUDB reference baselines remain unchanged.
The existing scenarios are retained, with explicit high-rate and currently
available regional-RBBB coverage added. These are observed development/regression
scenarios, not an untouched holdout. Every unsupported configuration remains
listed; no difficult case is dropped. Require zero new confidently wrong rates
and zero additional missed ventricular activations, plus the unchanged strict
920-case noise gate and exposed annotated-cohort evaluation.

Development observations: the 1228-case expansion has 1172 representable cases
and 56 explicit model exclusions, with zero new falsely usable rates or new missed
QRS after the opposed-shape safeguard. Both exposed LUDB cohorts (80 records) have
identical summaries. The previously held regional-LBBB development matrix moves
from 13 new falsely usable rates to zero; that does not publish, anatomically
validate or close the separate regional model. No reserved holdout is used.

The browser fixture is explicitly synthetic: one smooth broad deflection each
600 ms, with tiny continuous acquisition noise to avoid exact-extremum plateaus.
Its CSV is processed by the actual external-file worker without synthetic model
audit. Original samples must survive export, and the visible rate must be 100 bpm.
This verifies the application path, not clinical diagnostic validity.

Final local native coverage also includes 240 currently available regional-RBBB
configurations: 1468 total, 1412 representable, 56 explicit model exclusions.
No new falsely usable rates and no additional missed-activation cases were found;
falsely usable rates move from 87 to 83, with usable coverage 1155→1151. Remaining
errors are not hidden. Unexpected synthesis exceptions now fail the evaluator
rather than being silently counted as model exclusions, and all twelve PR115
regression examples must actually execute. Exact-head CI and real browser artifacts
are required for release; these numbers do not establish clinical validity.

The final catalog-inclusive evaluation contains 1712 configurations: 1656
representable and the same 56 explicit exclusions. It also exercises all 61
existing presets with their actual default variability/artifacts under four
filters. There are zero new falsely usable rates and zero additional missed-QRS
cases; falsely usable rates move 90→86 and usable coverage 1379→1375. These
remaining 86 errors are reported, not accepted as clinical validity. The report
records candidate-tree cleanliness and hashes of model sources used in synthesis.

The first published CI iteration exposed a temporal-noise LBBB counterexample:
refining an original train with median RR below 220 ms could bypass the historical
morphology rejection and create a newly delineated beat. The assertion correctly
blocked release. The product now preserves that morphology rejection while
allowing explicitly reviewed rate-only recovery. The assertion was not weakened.
The analytical browser fixture consequently requires rate status `review`, empty
beat delineations, and unavailable QRS/QT, rather than claiming usable morphology.
A regression fails on the first implementation and passes with the safeguard.
