# Proposed regional LBBB surrogate: decision before implementation

Defect: changing QRS duration in the existing LBBB template stretches all four
vector bases, including the early right-ventricular/septal contribution. Explore
an optional regional surrogate that preserves an early clock and delays/spreads
left-ventricular contributions, using the existing finite-support engine.

Evidence: Auricchio et al.2004, DOI10.1161/01.CIR.0000118502.91105.F6,
https://pubmed.ncbi.nlm.nih.gov/14993135/ studied 24 patients and describes
U-shaped propagation in 23, with heterogeneous LV activation. Fung et al.2004, DOI10.1136/heart.90.1.17,
https://pubmed.ncbi.nlm.nih.gov/14676231/ studied seven HF patients with EF<35% and
QRS>=130ms: four had a line of block and three homogeneous LV propagation.
These are selected HF populations and do not support one universal LBBB activation
map. Do not equate mechanical speckle-tracking times with electrical activation.

Scope hypothesis: four existing LBBB vector directions, explicit finite supports,
source-integral preservation as an engineering constraint. A fixed early basis
and stretched later LV bases would be a transparent surrogate, not anatomical
mapping, a tissue conduction velocity, a universal block pattern or CRT response.
Absolute support times require an explicit engineering reference, not attribution
to these papers. No new ST-secondary amplitude calibration follows from this.

Before promotion: select support domain and counterfactuals, preserve default
historical/RBBB samples, verify early versus late sampled changes and lead
identities, keep requested incompatible modes visibly inactive, test import,
activation comparison, exact rollback and three-engine UI. Derive T from the
actual selected QRS bases. If the surrogate cannot retain believable LBBB
morphology, stop rather than relaxing the sample contract.

Candidate fixed before sample inspection: reference QRS150ms; first support0–50ms
(mu21,sigma12), later supports20–100,55–150,90–150ms with historical LBBB centers
58.5,103.5,132ms and widths19.5,22.5,9ms. These preserve historical relative
centers/widths at150ms. The first support remains fixed; later supports stretch
about20ms by (QRS-20)/130. Domain130–240ms. Vector time-integrals are preserved
as an engineering constraint, not a biological conservation law. The common
acquisition filter can smear later activity earlier; only the isolated early
source is required to be exactly fixed. Whole sampled morphology must be checked
separately, including negative V1, positive broad lateral R and delayed peaks.


## Prior refutation preserved during recovery

The unpublished predecessor failed the expanded 240-case worker sweep in thirteen
new falsely usable rate scenarios. The model was held; neither its waveform nor
its 130–240 ms domain was tuned to satisfy the detector. Independent sample-only
QRS/T and broad-component corrections were subsequently integrated in PR115/116.
The recovery reevaluates the same full domain, retains preexisting failures and
adds missed-QRS and usable-coverage accounting. Source references remain in the
evaluator; only fs/leads enter analysis. These exposed tests are not a clinical
validation cohort and do not establish a universal LBBB activation map.

## Additional noisy transfer refutation — still unpublished

The same 240-case domain passes with zero new falsely usable rates and zero new
missed-QRS cases, but usable-rate coverage falls 112→94. Sixteen boundary cases
with baseline/muscle/mains0.05 and seed53 were then added before publication.
At HR120 / QRS240 / QTc520 / diagnostic filter, the regional trace reports
221.21 bpm as usable (35 candidates) versus the template's121.95 bpm. Therefore
the full256-case gate FAILS. No waveform, domain or threshold was changed to
hide this result. Keep the variant unpublished while the sample-only ambiguity
is investigated independently. The template's near-correct HR also matches mainly
non-QRS candidates in this case, demonstrating that a near-correct average rate
alone does not validate event identity or interval delineation.


## Recovery after independent confidence revision (PR120 pending)

The independent opposed-cycle screen removes the interval-ratio prerequisite,
without changing model samples, candidate times or numerical measurements. The
same complete 256-case domain now has zero new falsely usable rates and zero
additional missed QRS, with two preexisting template failures preserved. Usable
rates are 128/256 for the template and 107/256 for the regional source. The held
noisy case remains 221.21 bpm with 35 candidates and explicitly requires review;
its rate is not silently corrected. No model waveform, support domain or error
tolerance was changed to obtain this result. Earlier failures above remain part
of the development record, not a hidden exclusion list.

This variant must not be integrated until PR120 is integrated and its own source,
full worker domain, browser identity, actual traces and rollback gates pass.
The worker sweep is a mandatory CI step, alongside preservation of all 244
historical default/filter traces. Browser checks cover both regional models,
three engines and desktop/mobile viewports. These are emulations, not physical
mobile devices. Experimental opt-in is retained; the historical template stays
default. A passing engineering gate does not validate clinical amplitudes,
all LBBB morphologies, ST criteria or patient-specific activation.


## Corrected reference units: release blocked again

The earlier worker evaluator divided an event QRS duration by 2000 as though it
were milliseconds. Synthesized event durations are seconds: the correct midpoint
is `event.time + event.qrs / 2`. This was an evaluator defect, not a model change.
The earlier zero-additional-missed-QRS result is invalid and must not be used for
acceptance. In particular, the claim that the noisy template comparator mostly
matched non-QRS candidates was incorrect: its corrected count is 19 TP, 0 FN,
1 FP in that case. The regional counterpart still has 19 TP, 0 FN, 16 FP and
221.21 bpm marked review after PR120.

Using correct seconds with the unchanged 150 ms matching tolerance and all 256
cases exposes 15 scenarios with additional missed QRS, including six with usable
regional HR near the programmed value. No tolerance, waveform or domain has been
relaxed. This fails the release gate. The PR remains a draft until the detector
or model interaction is resolved and the full corrected gate passes. New unit
contracts reject 240 milliseconds supplied as 240 event seconds and require a
240 ms complex starting at 1 s to have its midpoint at 1.12 s, not 1.00012 s.
