# Recover observed weak QRS without reusing displaced waves as ventricular support

## Causal defect

The refractory selector can retain a larger preceding slow wave while discarding a real, lower-amplitude QRS maximum. Removing downstream T detections alone cannot recover that missing activation. Reintroducing its marker is also insufficient if the displaced contour is then reused as QRS support or as a ventricular neighbor in the boundary repair.

This revision operates only on acquired samples and observed maxima. It does not read a configured rate, preset, generator event, reference boundary, diagnosis or model audit. Reference events exist only in the evaluators. It does not change generated or exported samples.

## One observation contract

A replacement requires a distinct faster observed contour 80–180 ms after the displaced candidate, contrast in normalized temporal bandwidth and four-channel covariance, and matching pairs from at least four separate observed occurrences. The existing contour similarities, 30 ms offset agreement and 180 ms refractory compatibility are retained. Proposed replacements are verified together before being applied. They do not create an interpolated activation or impose a rhythm clock.

This recovery is directional: a following fast contour replaces a preceding slow one. The existing recovery from a larger subsequent terminal wave remains separate. Earlier-slope variants were rejected because they lost real broad ventricular complexes at 185 bpm despite apparently favorable local shape features.

The accepted complex carries the optional sample-coordinate `displacedPredecessor`. Its original point remains geometric evidence. Slow support belonging to that displaced wave is excluded consistently from both classification support and later delineation support. A recovered complex's independently observed complete support is carried through to measurement. During its boundary repair, neighboring ventricular observations come from the accepted train, rather than the rejected preceding wave. Historical ambiguity evidence and confidence thresholds are preserved; recovering a number does not certify its clinical accuracy.

A leading terminal-shaped observation can be rejected only when it matches terminal waves already rejected after at least three distinct later complexes and differs from their preceding QRS contours. No preceding invisible QRS or delay is fabricated. Negative controls retain leading QRS-like contours, opposite polarity, insufficient support and ambiguous same-shaped contours.

These features and thresholds are exposed engineering heuristics, not clinical classification probabilities or population-validated decision boundaries.

## Paired acceptance

The release predecessor is PR154, `e588cddbe54479d8157246cb784a6415bccde46f`.

- Recompute all 2,476 existing scenarios with their original 80 explicit source exclusions. Preserve every previously covered event identity, as well as unchanged FP/FN, phase, false-usability and interval-error gates.
- Preserve every measurement field on the already exposed 152 LUDB records and both existing 150-window INCART cohorts. These are regression checks, not a new clinical holdout.
- Compare the same 920 noise scenarios strictly against PR154. Replay all earlier published transitions from their immutable sources; do not revise their criteria or conceal failed historical science.
- Test sample immutability, observed-marker provenance, whole-QRS boundaries and negative controls for broad rapid ventricular support and leading contours.
- Extend the actual importer/worker/comparison/export/rollback checks from 72 to 90 flows across three browser engines and desktop/mobile viewports. Confirm the exact tested code identity and inspect the rendered screenshots before release.

## Development observations and limits

In the low-voltage LBBB example at 60 bpm, the published predecessor reports approximately 120 bpm while selecting P/T rather than the true QRS, with a 129 ms summary over those wrong observations. An intermediate marker-only recovery measured the early QRS limb at 72 ms; that intermediate value is not the published baseline. The complete-support candidate measures 60 bpm and approximately 164 ms against the evaluator's 160 ms reference, while keeping boundary uncertainty visible.

A separate 72-configuration development transfer screen varies LBBB/WPW rate, ventricular amplitude, T amplitude and acquisition. It includes remaining failures and is not a fresh clinical validation cohort. Correct average rate with compensating FP/FN does not count as recovery; a wrong number moved to review does not count as correction.

Final acceptance and exact result counts must be recorded from the completed paired run and CI artifacts. This document does not declare all electrophysiological debt closed, waive the original failed QT comparison, or redefine the criteria for the functional/UX cycle.

### Completed local verification

The freshly recomputed 2,476-case pair passes every unchanged numerical and event-identity gate. Nine configurations regain complete ventricular identity (not merely a better average); four of these resolve previously falsely usable HR values, reducing that raw screen from 32 to 28. Six summaries newly require review, but none had a previously correct complete ventricular train. The additional 72-case development screen contains 44 genuine complete-identity corrections and retains its remaining errors. These populations are reported separately, not pooled into an accuracy claim.

All fields remain exact on 152 exposed LUDB records and 300 exposed INCART windows. The 920-scenario noise pair passes the unchanged strict comparator with zero failures. The complete 2,219-test suite, TypeScript and build pass. Five new regression assertions fail on the immutable PR154 baseline and pass on the candidate. Source identities, criteria and corrected configurations are recorded in `docs/closeout/observed-weak-qrs-development.json`. Actual CI and the 90 browser flows remain release prerequisites.
