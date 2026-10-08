# Ventricular candidate selection: observed-wave identity

Status: investigation against released PR121 (`89baa207e2676cedb25bf108c6dac4d00208a16d`). No new runtime implementation accepted.

## Defect and educational risk
The exposed 1,892-case screen still contains 75 incorrectly usable mean rates: VT 39, LBBB 12, VVI 8, PVC 8, sinus 4, WPW 2, torsades 1 and AAI 1. Counts are correlated synthetic scenarios, not clinical prevalence. They include missed rapid broad complexes and double counting of actual P/T waves. Suppressing confidence alone does not close detection debt.

## Mechanism under investigation
An 18 ms slope-energy maximum is chosen inside a moving 180 ms suppression window. Replacing the last maximum also moves the suppression window. Two nearby slopes can therefore remove a real adjacent complex, especially when superposed atrial activity changes which slope is strongest. Separately, weaker ventricular candidates can disappear behind larger P/T candidates. These mechanisms must be distinguished before changing thresholds.

## Prediction and domain
Use only the recorded samples and sampling rate. A repair must preserve one independently observed candidate for each resolvable rapid ventricular complex, retain genuine ectopy and distinct ventricular morphologies, and avoid inventing beats from expected RR. The existing 180 ms separation, shape comparisons and review limits are engineering screens, not physiological laws or clinical accuracy claims. Any proposed replacement requires explicit evidence beyond periodicity alone.

## Invariants and confounders
Do not change source signals, source event calendar, diagnosis, requested durations or acquisition behavior. Do not feed model truth to the analyzer. Preserve default traces, independent analytic signals, real recordings, pacing, varying amplitudes, P/T overlap, noise, irregular rhythms and genuine bigeminy. Do not halve a rate merely because alternating waves repeat.

## Refutation and acceptance
Compare against PR121, not an older easier baseline. Reject a repair that creates new missed actual QRS support, new falsely usable rates, new usable interval errors, or new false-positive candidates in the affected complete mechanism domain. Retain adverse outcomes and confidence-coverage costs. The original 1,892 scenarios, 304 regional combinations, strict noise screen, all exposed LUDB/INCART measurements and actual browser flows remain required. Add independent analytic counterexamples for transitive suppression and genuine alternating ventricular beats. A narrow known example passing is not completion. Clinical validation remains absent.

## Initial observations
A naive globally energy-ranked NMS recovers some suppressed activations but introduces extra candidates; it is not accepted. In a clean low-amplitude sinus example, the atrial candidate can have greater energy and covariance residual than the true QRS, so neither largest amplitude nor largest covariance rank identifies a ventricle. In a low-amplitude LBBB example, all original retained candidates fall on P/T while real QRS maxima still exist in the raw sample-derived candidate set. These observations rule out a confidence-only patch and an amplitude-only classifier.

## Candidate mechanism under evaluation
The bounded repair applies only when at least six complete observed candidates have predominantly short spacing (75th percentile at most two existing 180 ms suppression windows) and a repeated four-lead contour: adjacent demeaned 160 ms windows correlate above 0.9 in at least 80% of comparisons. These reuse existing engineering comparison scales; they are not a diagnostic definition of tachycardia.

An additional raw energy maximum must match at least three separate original candidates at correlation above 0.9, outside the 180 ms neighborhood. A one-dimensional maximum-score subset then chooses among the original and independently supported observed maxima with the unchanged minimum separation. It replaces the greedy train only if it recovers additional candidates and preserves contour recurrence. The operation never synthesizes a timestamp or uses expected RR to place a beat. It remains disabled when shape rejection is explicitly disabled.

Recovery of candidate identity is separate from confidence in its onset and offset. Newly reconstructed trains retain automatic HR when the independent existing rate screen supports it, but derived QRS/PR/QT/axis summaries remain reviewable rather than becoming precise just because the recovered complexes repeat. In the exposed 220/min case, the old 43 ms QRS was already inaccurate; recovering a missing activation does not validate that width.

## Rejected experiments retained
- Global energy-ranked NMS: additional false candidates despite some recovered activations.
- Unconstrained maximum-score selection: failed independent width, opposing-wave and existing WPW tests.
- Short-spacing-only selection (V4): 11 new usable QRS-error cases, 25 new missed-QRS cases and one new falsely usable HR in the 1,892-case comparison; changed two LUDB and two additional INCART windows. Rejected.
- Recurrent-train guard alone (V5): preserves all 152 LUDB and 300 INCART windows and passes strict 920-case noise, but permits edge candidates with different contours. Eight new missed-QRS and eight additional usable interval-error cases remained. Rejected.
- Explicit repeated support for every newly eligible maximum removes the observed edge substitutions. The separate interval-confidence rule avoids certifying newly recovered widths. Complete current-source evaluation is still required; these observations are not final acceptance.

## Independent algorithm context
Pan and Tompkins, *A Real-Time QRS Detection Algorithm*, IEEE TBME 1985, DOI [10.1109/TBME.1985.325532](https://doi.org/10.1109/TBME.1985.325532), describes combining slope, amplitude and width, adaptive thresholds, and missed-beat search; it also discusses the difficulty of irregular rhythms and low-slope broad complexes. [Primary paper](https://courses.csail.mit.edu/18.337/2017/projects/subramanian_sandya/Papers/Pan%2BTompkins.pdf). This motivates checking multiple sample features and preserving irregular-rhythm controls. The current repair is not an implementation of that algorithm and does not inherit its reported database performance or physiological assumptions. Its guards and score optimization are explicit engineering choices evaluated separately here.

V6/V7 required correlation 0.98 for each additional maximum, but failed all sixteen wide rapid positive controls by excluding genuine overlapping complexes. Rejected as insufficient despite improvements on negative controls. V8 uses the same >0.9 contour definition for train recurrence and individual repeated support; all twenty-three new tests and the eighty preexisting targeted tests pass. Complete current-source evaluation remains pending.

## Verified V8 candidate and additional transfer screen
Before the additional grid below was run, the current candidate passed all 1,892 original scenarios, all 304 regional scenarios, all 920 strict noise scenarios and exact measurement parity on 152 LUDB and 300 INCART windows. Eighteen previously incorrect but usable rates become numerically correct and remain usable (75 to 57 incorrect; usable coverage remains 1,477). There are no newly missed QRS, phase misses, false QRS, falsely usable rates or usable interval-error cases. Fifty scenarios change some measurements. Usable QRS coverage changes from 1,054 to 1,052; these are the two recovered 220/min cases with preexisting wrong widths, now explicitly reviewed. QT usable coverage stays 497. All 2,119 unit tests and the production build pass after including the new browser route in its fail-closed routing test; an earlier loaded run had one unchanged timeout, retained in the local evidence.

At 2026-10-08 09:15 UTC, before evaluating this additional grid, the runtime is fixed at detector SHA256 `a3d8412937bd3bbb770736feccec6407fbdc8b26f73e87f6b3a59b1e26b12a6e` and measurement SHA256 `3cecac4689a10987120934ba8e8812a0d8d385f77248033b7c6fea2d7fbf943f`. The additional 480 combinations are LBBB/RBBB/VT; HR 190/210/230/250/270; QRS controls 150/180/210/230 ms; QTc 350 ms; noise 0/0.03; seeds 19/71; off/diagnostic acquisition. Every target, including explicit source-domain rejection, remains recorded. The same numerical and actual-QRS-support gates apply against released PR121, including zero new false QRS. This is additional synthetic transfer, not an independent patient cohort. Outcome and actual browser evidence remain pending.


## Additional transfer outcome and actual application domain
The frozen additional 480 combinations passed without runtime retuning: 456 source-admitted and 24 explicitly unsupported. Incorrect usable rates improve from 30 to 24 in this additional cohort. Together, all 2,372 cases yield 2,292 admitted / 80 unsupported, incorrect usable HR 105 to 81 and unchanged usable coverage 1,752. No new false QRS, missed QRS, phase misses, falsely usable HR or usable interval-error cases occur. The remaining errors stay disclosed; the original 1,892-cohort result remains 75 to 57, not 105 to 57.

Actual browser testing confirmed the 240/min repair and exact roundtrip. Its initial 260/min import expectation was invalid: the existing application import/control domain clamps HR to 250/min, and the worker correctly reported 250/min. The test now explicitly requires that unchanged normalization, separately exercises accepted 240 and 250/min cases, and retains 260/min in the direct native-engine stress tests. No application range is expanded to satisfy a test. This first browser failure remains recorded; the corrected full three-engine desktop/mobile run remains pending.
