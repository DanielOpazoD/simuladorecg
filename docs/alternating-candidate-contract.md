# Alternating candidate ambiguity

Defect: stable repeated QRS/T detections can double the ventricular rate while
remaining insensitive to the existing threshold challenge. An exposed regional
LBBB prototype at72bpm/QRS240ms produced a falsely usable~144bpm estimate.

Candidate: sample-only, review-only screen for at least six candidates with
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
