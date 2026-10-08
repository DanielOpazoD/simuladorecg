# Complete ventricular identity across competing waveform components

Status: investigation on released PR152, `179a128bf70509b0f1c85fa2a6a9ba7cfa4f478b`. No new runtime implementation is accepted.

## Defect and intended closure
The released 2,372-case screen retains 81 falsely usable rates: 57 in the original grid and 24 in the additional rapid-VT transfer grid. The latter include residual 190/210/250-min wide-complex cases, not only low-amplitude P/T ambiguity. Candidate detection, ventricular identity, interval boundaries and confidence remain distinct responsibilities. Improving a mean rate alone cannot establish identity.

One observed mechanism is incomplete morphology evidence: the detector judges a prior QRS from its selected slope while another qualified slope of the same continuous deflection is hidden by the 180 ms suppression window. In a low-voltage 95/min VT, the hidden terminal slope supports the existing strict T-wave discriminator, but the selected early slope does not. Another hypothesis is that opposite slopes of the same repeating rapid QRS prevent the initial signed-contour coherence screen from recognizing a coherent train.

## Candidate approach, not an acceptance claim
Reuse existing observed maxima, multilead morphology and continuity evidence. Make complete-complex evidence available consistently to detection and delineation. Any recovery after a terminal-wave rejection must identify an actual recorded maximum with independently repeated QRS support; no beat is inserted from an expected RR or the generator clock. Do not silently relabel a two-family ambiguous waveform as a known rhythm, and do not remove genuine ectopy merely because it alternates.

## Invariants, refutation and release conditions
No source-model, event-calendar, diagnosis-dependent detector, waveform-export or acquisition changes. No relaxed numerical acceptance limits. Preserve all adverse outcomes and unavailable estimates. A confidence-only downgrade does not close the numerical detection mechanism. Require complete targeted before/after beat identity, false-positive and false-negative accounting and honest interval uncertainty. Reject new ventricular omissions, false detections, falsely usable values and newly usable interval errors; additionally report per-case rate-error changes rather than hiding deterioration in an aggregate.

Run the existing complete 2,372-case matrix, 304 regional cases, strict noise comparison, exposed real-data parity and actual browser flows. Add independent analytical controls for opposite slopes and true distinct alternating beats. Any remaining ambiguity must be bounded explicitly against the educational module it could affect. No universal clinical accuracy or educational efficacy is claimed.

## Candidate implementation and causal checks

The candidate keeps the source generator, acquired/exported samples, clocks and terminal estimator unchanged. Only `ventricular-candidates.ts` changes at runtime; no new dependency, control or diagnosis-dependent branch is introduced.

- Rapid-train admission uses membership in one repeated signed contour, rather than counting adjacent agreements. One displaced marker previously counted as two disagreements. Existing complete-frame count, 80% support, 0.9 contour correlation, 180 ms separation and new-maximum support requirements remain.
- Continuous opposing slopes are removed from the competition pool before maximum-score selection. A fixed four-channel histogram bin could split one noisy return level: at an exposed 190/min trace it held 159/5,000 samples. Recentering the same-width window on its observed mean restores sufficient observed support without lowering the existing 4% density threshold. Each iteration must strictly increase membership. This refinement is confined to the repeated-contour recovery path and denoised boundary support, not enabled globally for all delineation.
- Qualified hidden slopes on either side of a selected marker contribute complete-complex morphology. They are not extra beats.
- If individual noisy descriptors remain inconclusive, at least four matching observed 160 ms contours can provide an averaged descriptor, with the existing 0.98 match and bounded 30 ms alignment. The same existing rank/roughness rules then distinguish a late wave. Original samples and candidate timestamps never change.
- Noise reduction used for that distinction must also support the preceding QRS boundaries. The same continuous-support check, including return-level recentering, is used on the analysis-only smoothed copy. Three matching disambiguated anchors can support another complex. This repairs a terminal-limb QRS of about 42 ms to approximately 164–165 ms, and prevents a newly regular rate from exposing a spuriously short QT. Existing stimulus-adjacent uncertainty remains.

Averaging establishes an engineering descriptor, not a probability or clinical wave classification. Current polarity tests require exact ventricular markers and complete-complex support; an exploratory full-pipeline test found a 1 ms variation in the unchanged per-lead terminal estimator, so this revision makes no exact QT-polarity-invariance claim.

## Registered transfer attempt and repair

`ventricular-identity-transfer-protocol.json` records 104 neighboring configurations and previously unused fixed seeds before inspection, at 2026-10-08 11:26:39 UTC. It pins candidate detector SHA-256 `60269e4274bddebd442ee8fbf85fb5cdb9629d929fffbecb42f98a600666c6a2` and the unchanged measurement primitive. Registration was local, not a public preregistration or clinical validation.

The first run failed: two 60/min noisy low-voltage VVI cases acquired newly usable but incorrect QTs after rate recovery. The complete first report is preserved in `ventricular-identity-transfer-first-evaluation.json`, including all 104 rows, source hashes and the dirty-tree flag. Its commit field names the checkout anchor, not the modified implementation; use its dependency hashes to identify the evaluated bytes. Do not relabel this first run as passed.

The repair consistently applies the same return-level recentering to the denoised boundary-support path. A focused replay changes the affected QRS from 42 to 165 ms and QT from about 300 to 421.5 ms, with the existing review status for stimulus-adjacent onset. The 104 cases are now exposed regression data. There is no fresh clinical validation reserve implied by the replay.

## Refuted alternatives retained in the investigation

- Broad voltage-apex recentering introduced missed activations and new falsely usable rates; discarded.
- A second detector pass after suppressing terminal-wave neighborhoods introduced additional false detections and interval errors; discarded.
- Blanket interval review after ensemble discrimination reduced correct noise-stratum coverage. The final candidate repairs the observed boundary support instead; no new confidence-policy module remains.
- Enabling return-level recentering globally removed previously available interval estimates. It remains bounded to repeated-contour recovery and independently supported noisy-complex delineation.

## Verification status before PR review

- 146 focused tests passed, including 39 new identity tests, existing independent analytical opposing-slope/true-complex controls, source-based one-to-one QRS identity and unchanged sample arrays. Six paced-noise cases exercise complete QRS/available QT; unresolved T-end coverage remains unavailable under the existing rule.
- The final 104-case exposed replay has no new false detections, missed QRS, phase misses, falsely usable HR or newly usable erroneous QRS/QT. Falsely usable HR changes 11 → 9; this does not imply the remaining nine are resolved.
- Strict 920-case calibrated-noise comparison passed against the released predecessor.
- The broad 2,476-case native comparison, complete unit/build checks and actual three-engine desktop/mobile browser evidence remain release gates. Their final identities and results must be recorded before merge.
- Exposed real-data parity and the 304-case regional screen are required unchanged gates. Neither synthetic model truth nor exact parity on previously exposed records establishes clinical accuracy.

The existing unresolved slow/low-amplitude P/QRS/T ambiguities remain open. This work must not be described as eliminating all electrophysiological debt or making every automatic interval reliable.
