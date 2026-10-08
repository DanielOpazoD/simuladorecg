# QRS–QT boundary coherence

Release predecessor: PR155, `ddba83dcbc85cbc8679986380446fc6aebbe7e20`. The original closeout inventory and all adverse historical terminal-QT results remain unchanged. This is engineering regression work, not clinical validation.

## Two reproduced causes

1. In short-PR, low-voltage/amplitude WPW examples, a brief observed return between P and QRS was shorter than the existing six-millisecond quiet bridge. The backward boundary search crossed the entire preceding wave. QT was prolonged by about 90 ms because its QRS onset was wrong; T end itself was within approximately 6–8 ms of the evaluator's reference.
2. In a wide regional RBBB example, the late ventricular component was below the global candidate-amplitude threshold. Delineation stopped after the first limb and searched for T inside the remaining ventricular activation. Recovering the observed complete QRS changes the 60 bpm example from QRS about 92 ms/QT about 236 ms to QRS about 236 ms/QT about 358 ms, against 240/360 ms references. At 120 bpm with overlapping later waves, QRS can be repaired while QT remains unresolved; abstention is not a numerical QT correction.

References in these statements are evaluator-owned synthetic event boundaries, never analyzer inputs. They do not establish accuracy on patients.

## Shared observed evidence

The detector keeps its existing accepted ventricular markers. A repeated, distinct, locally slow preceding observation is carried as optional sample-coordinate evidence. The boundary consumer may use a short observed return only when its original search actually entered that preceding contour. A baseline dip inside an already separated QRS is insufficient. No rhythm, configured PR/rate, diagnosis, generator event or hidden boundary enters this decision.

Late weak support is selected only from actually observed maxima above the existing absolute floor and below the existing global candidate threshold. It requires a rapid component that is localized relative to its preceding context, recurrence of that rapid component itself across distinct complexes, unique ownership by the nearest accepted ventricular marker, and an observed return of detection energy below its existing absolute floor within the following 40 ms. A large slow envelope surrounding noise cannot supply the rapid-component agreement. A continuous phase-locked carrier cannot supply localization. A component closer to the next ventricular marker cannot extend the previous QRS. A sharp summit inside an ongoing broad T wave cannot supply the required terminal return. This is a return of detection energy, not a claim that raw voltage has reached the isoelectric baseline.

The same complete support reaches QRS delineation, its T-search starting point and derived QT. Raw/exported samples and selected rate markers are unchanged by this boundary evidence. The terminal estimator, model generator and scientific acceptance tolerances are not replaced.

The four-channel, four-millisecond finite differences, 40/80 ms feature windows, 80–280 ms association window, four-observation recurrence, 0.98 contour agreement and fivefold local rapid-component contrast are exposed engineering heuristics. They are not diagnostic thresholds, physiological universals or calibrated probabilities.

## Acceptance beyond averages

- Preserve the complete existing 2,476-scenario bank, including the same 80 explicit source rejections, plus all existing event-identity and false-usability gates.
- Compare corresponding evaluator-owned beats, not just aggregate error counts. Preserve previously correct onset, offset and T-end observations; distinguish a genuinely correct interval from cancellation of two misplaced endpoints. Report withdrawal of a previously correct usable measurement separately and reject it.
- Preserve availability of previously correct complete ventricular counts. A correct average with compensating FP/FN or an out-of-QRS marker is not a correct count.
- Keep 152 exposed LUDB records and both existing 150-window INCART cohorts exact. They are regression data, not a new holdout. Keep the 920-scenario noise comparison strict against PR155 and replay prior transitions from their immutable sources.
- Include independent sampled transient/carrier controls, short-PR cases, both off/diagnostic acquisition, weak late activation, and rapid nearby-activation ownership controls. Detector input contains only samples and sampling frequency.
- Verify the exact release head, all CI checks and real desktop/mobile browser flows. Extend the existing 90 flows to 126, including corrected boundaries, unchanged reference A, exact roundtrip, and retention of unresolved QT when later waves overlap.

Per-event endpoint checks supplement the existing 20 ms QRS-width and 30 ms QT engineering screens. Their use does not imply clinical certainty for an individual beat; status remains the existing aggregate evidence status.

## Rejected development and explicit limits

Early weak-support variants incorrectly accepted recurrent high-frequency contamination and withdrew correct measurements on exposed LUDB record 41. They were rejected. Restricting a quiet gap alone did not resolve that failure and was discarded. Agreement must belong to a localized rapid component, rather than to a surrounding slow envelope or persistent carrier.

A subsequent full-bank run rejected two newly wrong raw QT results in aggressive-filter RBBB configurations. Those configurations were retained despite the filter's pre-existing display limitation. The fix restricts onset repair to a search that actually crossed its identified preceding contour; neither tolerance nor scope was relaxed. Additional rapid-train checks rejected support assigned to a nearer neighboring activation, leading to explicit unique ownership.

A full-bank-passing prototype still failed three independent triangular tall-T controls at 250/500/1,000 Hz: their sharp summit was admitted as weak terminal support despite an ongoing broad deflection. It was rejected and the observed terminal-return requirement added. Full-bank success alone did not override this independent failure.

Two prior WPW assertions required null intervals because an earlier global canonical-window prototype had exposed wrong QRS232/QT498–500 ms. The new causal preceding-contour separation actually resolves those examples. Their assertions now require non-null measurements, correct ventricular identity and per-beat QRS/QT accuracy against unchanged 20/30 ms reference screens; the historical wrong result remains documented. This changes the expected outcome only where measurement correctness is demonstrated, not the numerical acceptance tolerances.

All remaining inventory flags stay visible. No average-only improvement, newly reviewed wrong number or unresolved QT is counted as a numerical correction. This contract does not declare whole-engine debt closed or waive the original failed terminal-QT comparison.
