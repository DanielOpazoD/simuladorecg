# Recurrent wave identity without amplitude dominance

## Problem and intended learning

A large P or T wave can dominate the candidate score when ventricular voltage is small. Reporting twice the ventricular rate teaches a false activation count. The remedy must preserve actual ectopic and rapid ventricular activations, rather than merely produce the expected average rate.

The revision is sample-only. It receives sampling frequency and observed leads; no preset, configured rate, event calendar, source boundary or model audit enters the classifier. Reference events are confined to the evaluator.

## Mechanism and limits

The existing detector still forms and analyzes its observed candidates. An additional contrast uses normalized temporal bandwidth (third-difference power relative to first-difference power, at a 4 ms half-step in an 80 ms radius) alongside four-channel covariance shape. The bandwidth feature uses the existing detector analysis copy (including its median branch for impulsive signals); covariance shape retains its existing sample domain. Features are paired by the same observed component, not presented as identically preprocessed signals. These are empirical engineering descriptors, not diagnoses or calibrated probabilities. The exposed development parameters are a slow descriptor below 0.18, a rapid descriptor above 0.25, and the documented spatial/temporal contrast ratios in the implementation.

At least three other recurrent observations are required. Comparisons use the existing 0.9 contour similarity, an 80–400 ms association window, and features belonging to the same observed component. A similar contour cannot be relabelled as a different activation type merely because its local covariance changes. This protects rapid ventricular trains with superimposed atrial activity.

Classification decisions are collected without modifying the observation population. They are applied only after the existing template and complete-support stages have finished. Complete rapid support protects a complex against deletion. Thus excluding one P/T candidate cannot change another candidate's reference templates and cause a new false positive.

Geometric landmarks remain available for delineation and ambiguity assessment. They are distinct from the accepted ventricular train. Accepted observations expose one marker, its observed support and recovery provenance; rate and measurement consumers derive their ventricular membership from that contract. A support point is an observed slope, not a certified physiological onset or offset.

Visible/exported samples and retained candidate timestamps do not change. This does not implement a general clinical P-wave classifier, recover every QRS previously lost to amplitude/refractory selection, or certify automatic intervals in overlapping/noisy signals.

## Acceptance and causal controls

- Compare against released PR153, commit `8f31167d3f7d0314ca6b1851efdeaffe6d3a551f`.
- Keep all 2,476 existing scenarios, including 80 existing explicit source rejections. Do not relabel failures out of scope.
- Require no new FP, FN, phase omissions, falsely usable rate, or newly usable wrong QRS/QT under the existing tolerances.
- Preserve the identities of previously covered reference events, not only aggregate counts. Negative controls must reject substitution of one missed beat for another even when TP/FN and mean rate are unchanged.
- Demonstrate actual ventricular identity in the corrected low-voltage/high-P/T cases, including PVCs. Verify sample immutability and retention of discarded geometric observations.
- Protect same-contour rapid VT, the prior VT template-context failure, and overlapping WPW intervals that cannot legitimately become usable.
- Preserve all exposed real-record, source, strict noise, browser/import/export/rollback and build checks. Source hashes identify tested bytes; they are not clinical validation.

## Development results, not release acceptance

A freshly recomputed PR153-versus-candidate run passed all 2,476 cases (2,396 admitted, 80 existing source rejections), including zero newly lost reference identities and every unchanged numerical non-regression gate. The preliminary cached-baseline shortcut was not used for this final local pair. `benchmarks/closeout/recurrent-wave-development.json` records the exact analyzer hashes and distinguishes numerical corrections from remaining errors moved to review. Final CI must independently rerun on its identified commit.

Ten configurations had genuine numerical correction with all evaluated ventricular identities retained: five combinations across sinus rhythm, LBBB and PVCs, each in off/diagnostic acquisition. Eight additional previously wrong rates moved to review while remaining wrong; they are not corrections. The raw falsely usable HR count changed from 50 to 32. No previously correct complete ventricular count lost usability in that comparison. Some rates previously close to the expected mean already contained compensating FP/FN and are not examples of correct ventricular identity.

The local revision also preserved every measurement field on 152 exposed LUDB records and 300 exposed INCART windows (75 recordings, 32 patient groups). This is regression preservation, not zero clinical error or a fresh validation cohort. Final release acceptance additionally requires the complete CI suite and actual browser/import/export/rollback evidence; local function replay is not browser verification.

Earlier canonical-window and spectral variants failed broader controls and were discarded. In particular, a correct average obtained by losing genuine PVCs was rejected; a window revision that exposed wrong usable WPW QRS/QT values was rejected. The original failed terminal-QT comparison remains unchanged and must not be relabelled a success.

The remaining inventory is still open. This contract does not declare electrophysiological debt closed or authorize changing the agreed transition criteria for the functional/UX cycle.
