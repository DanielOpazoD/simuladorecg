# QRS–T discrimination: development candidate, not clinical validation

Baseline: `ca2aa852d2fe5c6affdfdc31db2b9160211944f9`.

## Defect and mechanism

Twelve exposed WPW/low-voltage fixtures at 73 or 120 bpm, PR 90/100.3/101.7 ms,
noise 0.05 and seed 17 have T peaks counted as QRS. Their sample-only worker marks
roughly double the ventricular rate usable. Removing T in an evaluator-only
counterfactual restores the expected count; production must not remove T.

The historical shape discriminator uses derivatives of unconditioned samples.
High-frequency noise obscures the lower-dimensional, smoother T trajectory.
The candidate computes an analysis-only centered moving average with half-width
10 ms, leaving the actual ECG, acquisition filters and candidate times untouched.
Between 200 and 400 ms after an accepted candidate, it tests derivative covariance
residual and curvature relative to that preceding candidate. All constants are
engineering hypotheses chosen on exposed synthetic examples, not clinical cutoffs.

The familiar need to combine slope, amplitude and width rather than rely on slope
alone is discussed by Pan & Tompkins (1985), DOI 10.1109/TBME.1985.325532,
https://pubmed.ncbi.nlm.nih.gov/3997178/. That paper does not validate this new
multilead covariance rule or its thresholds.

## Refutation and required evidence

- Preserve input samples byte-for-byte and prohibit model/event/diagnosis imports
  in the analyzer. Generator events belong to evaluation only.
- Correct all twelve exposed cases, then evaluate other seeds, amplitudes, rates
  and acquisition modes. Report every case, including errors and unavailable rates.
- Keep genuine PVCs, bigeminy, trigeminy, couplets, pacing and broad QRS candidates.
  A new confidently incorrect rate or lost genuine ectopy blocks promotion.
- Require the existing 920-case noise paired non-regression gate without relaxing
  limits, plus externally annotated QRS evaluation on already exposed records.
- Preserve frozen baseline source hashes. A numerical revision must be explicit;
  it cannot be certified as an unchanged detector.
- Run unit, types/build and browser measurement flows before publishing completion.

This document records an experiment. No independent patient validation or completed
acceptance is claimed. Unseen reserved T-end evaluation data are not used here.

## Development findings and revisions

The first direct refinement corrected 12/12 examples but failed broader checks:
432 transfer configurations exposed two newly falsely usable BRD rates, and the
920-case noise gate rejected changed QRS delineation coverage/confidence. Extending
analysis to the final beat was also tested and rejected because it introduced
additional bad interval estimates. Neither rejected variant is the candidate.

The candidate keeps the original sample landmarks for morphology windows and
refines only the ventricular population. Delineations assigned to discarded
candidates are removed; retained boundaries are identical and their RR uses the
retained ventricular train. Boundary search heuristics remain the older restricted
windows: this revision does not claim improved QT or QRS-width accuracy.

Selection can reduce dispersion by dropping suspect waves. It must not thereby
promote QRS confidence if the original boundary population required review.
Remaining intervals shorter than 75% of median RR after refinement retain a rate
review warning; this is an ambiguity screen, not an ectopy diagnosis.

Current exposed development evidence:
- The regression test fails all 12 positive fixtures on the original detector;
  its ten preservation/control cases pass there. The revised detector passes all.
- Paired native matrix: 588 configurations, 572 representable and 16 explicitly
  unsupported. All 12 exposed rates corrected; zero new falsely usable rates and
  zero cases with additional missed ventricular activations.
- In that matrix, falsely usable rates fall from 105 to 55; usable cases from
  481 to 471. These are correlated synthetic configurations, not patients.
- The unchanged strict 920-case noise gate passes. No numeric tolerance, noise
  bytes, frozen baseline or source-model output was relaxed or changed.
- Transfer and noise cases have now been inspected and are development evidence,
  not a fresh holdout. The reserved T-end holdout remains untouched.
- Annotated LUDB calibration comparison and production-browser checks are pending.

## Numerical identity and historical checks

`qrs-t-revision.mjs` identifies exactly the two changed numerical files without
rewriting historical manifests. The historical T-peak-only output assertion still
runs against the exact pre-revision numerical files. Separately, a structural
check requires every refined candidate to belong to the original sample list,
retained morphology boundaries to stay exact, and HR/RR to follow retained times.
The paired native matrix and annotated records evaluate accuracy beyond this
structural contract. A source hash is never treated as physiological validation.
