# Alternating candidate ambiguity

Defect: stable repeated QRS/T detections can double the ventricular rate while
remaining insensitive to the existing threshold challenge. An exposed regional
LBBB prototype at72bpm/QRS240ms produced a falsely usable~144bpm estimate.

Initial policy (retained here as history): sample-only, review-only screen for at least six candidates with
repeated opposite waveform directions, highly similar two-apart shapes, and
short/long interval alternation. Normalize demeaned I/II/V1/V5 windows of±80ms;
require adjacent correlations<-.5, two-apart>.9, interval ratio<=.6, and>=80%
consecutive-triple agreement. These are exposed engineering thresholds, not a
clinical definition of T waves, bigeminy or electrical alternans.

Do not remove candidates, divide the rate by two, use programmed HR/diagnosis,
change the primitive detector or inject generator truth. Downgrade remaining
usable estimates to review; preserve unavailable/review evidence and raw values.
True bigeminy can also trigger review: the screen identifies ambiguity, not which
candidate is a ventricular depolarization. Sinus/AF/regular wide-QRS preservation,
independent reference/noise non-regression and actual worker UI are required.

Refutation: remaining falsely usable exposed double count, changed numeric
candidates, promotion of unavailable data, or failed independent non-regression.
No new physiological model is promoted until this chain is verified.

The first comparison-window hypothesis was refuted by an independent analytic
train: detector timestamps jumped between slopes of the same deflection, causing
low two-apart similarity. Align comparison windows to the strongest demeaned
multilead deflection within±30ms, without moving detected/exported timestamps.
The original analytic regression now passes at100/250/500/1000Hz. This alignment
is part of the exposed engineering method and must retain independent gates.

A broader filter sweep exposed residual raw-sample errors: at200ms/monitor an
occasional extra candidate gives~79 instead of72bpm; at240ms/monitor a same-direction
filter rebound can still double the raw rate. This opposite-direction screen does
NOT cover those patterns. An exploratory relaxation was discarded: it did not
solve same-direction rebound. The registered strong repeated-pattern policy is
retained. The existing known-acquisition layer already marks monitor measures for
review and aggressive-filter measures unavailable, without using diagnosis or
programmed rate. Unknown-filter external signals remain an explicit limitation;
do not describe this screen as a complete double-count detector.

## Regular opposed cycles: quality-only revision

A later exposed noisy boundary of the held regional LBBB model (120 bpm,
QRS 240 ms, QTc 520 ms, diagnostic filter, noise 0.05, seed 53) produced
221.21014964216005 bpm marked usable. Of 33 eligible triples, 29 had the
registered opposite-adjacent / similar-two-apart pattern. Near-regular spacing
alone prevented the initial screen from recognizing that ambiguity.

Version `opposed-cycle-v2` removes only the short/long interval-ratio condition.
The four leads, comparison/alignment windows, minimum count, correlations and
80% agreement threshold remain unchanged. These are development thresholds,
not diagnostic criteria. Regular spacing does not establish ventricular identity.
The held case now retains exactly 221.21014964216005 bpm and 35 candidates,
but requires review. This fixes unjustified confidence, not event detection.

Analytical tests at 100/250/500/1000 Hz fail with the preceding policy and pass
with this one; same-direction trains remain negative controls. All numerical
fields, support coordinates, samples and unavailable estimates must remain exact.
Existing review estimates cannot be promoted. Opposed true ventricular complexes
may need review as well; this conservative cost must be measured, not hidden.

### Paired evidence and limitations

- 1,712 fixed native scenarios: 1,656 representable, 56 predeclared exclusions;
  immediate-predecessor comparison retains all numerical fields and 1,375 usable
  rates. Both policies still have 86 rates beyond the engineering error screen.
- 80 already exposed annotated LUDB records: all numerical values and quality
  states unchanged, 75 usable HR estimates in each policy. Header-declared
  voltages remain quarantined as absolute calibration targets.
- Strict frozen noise gate: all 920 scenarios pass, including 73,440 morphology
  checks. No historical manifest, tolerance or clean source was regenerated.
- The existing 920-case development and 920-case temporal-replication evaluations
  remain intact. Their separate frozen legacy path restores exact predecessor
  confidence bytes; current quality is evaluated separately, never substituted
  into historical assertions.
- Correction: the held regional model's initial 256-case event-matching result
  had a seconds/milliseconds defect. Corrected midpoint matching exposes 15
  additional-missed-QRS scenarios; the earlier zero-missed claim is invalid.
  Zero new falsely usable *rates* and two preexisting template rate failures
  remain, but rate agreement cannot establish correct event identity. The model
  remains blocked in PR121 and is not shipped by the confidence PR. Agreement of an estimated rate with its reference alone
  does not prove that detected events are the correct QRS complexes.
- Actual browser acceptance imports independent analytical CSVs into the real
  external worker, verifies a visible `Revisar` state at 200 bpm, retains all 31
  candidates and exact source samples, and checks return to the original trace.
  Browser completion is a release gate; unit tests do not establish it.

Compact observed evidence: [opposed-cycle evidence](evidence/opposed-cycle-review.json).
These exposed engineering regressions are not independent clinical validation,
and this policy is not a complete QRS/T discriminator or an electrical-alternans
classifier. Same-direction rebounds and inaccurate existing delineations remain.
