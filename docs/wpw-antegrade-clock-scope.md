# Delta is not an accessory-pathway event model

## Confirmed implementation gap

The existing delta template applies to `normal` beat kinds when WPW conduction
is selected. That includes the junctional rhythm and junctional escape in complete
AV block, and also the AF/flutter schedules, none of which supplies an explicit
antegrade atrial-to-ventricular event association in this engine. The resulting
added delta can look plausible while implying a mechanism that was never simulated.

The 2019 ESC SVT guideline describes pre-excitation via antegrade accessory-pathway
activation and treats pre-excited AF as a distinct clinical scenario. Those facts
do not validate our scheduler, delta template, pathway location or refractory
behavior. In particular, pre-excited AF/flutter are clinically possible; the
current program does not model their accessory-pathway conduction.

Source: [2019 ESC SVT guideline](https://academic.oup.com/eurheartj/article/41/5/655/5556821).
The implementation-scope conclusion below is our inference from the actual code.

## Fail before displaying a fabricated mechanism

Before synthesis, each otherwise delta-eligible normal beat must match an actual
conducted atrial event and its PR/time. A PR number without that event is not
sufficient. The existing model-scope error/recovery flow explains the missing
mechanism and asks for another conduction pattern; it explicitly says this is
a simulator limit, not clinical impossibility. Error fields without a preceding
beat or time-interval interpretation are null, rather than fabricated zeros.

Sinus/PAC and AAI atrial-paced examples retain their represented association.
Ventricular/paced beats and empty calendars that do not receive a delta retain
previous behavior. No event, activation time, source vector, amplitude or sample
is moved, removed, rescaled or silently replaced. No AF-AP circuit, AVRT,
secondary WPW ST/T or physiological refractory-period model is added.

## Acceptance

Five predecessor failures cover four unsupported clocks and an orphan PR number.
Controls cover actual association, wrong association, ordinary/PAC/PVC/AAI cases,
ventricular/VVI/empty calendars, unmodified inputs and exact recovery.
The browser flow checks the real worker error and absence of stale export at
1440 and 390 px, followed by restoration of the identical previous waveform.

All 244 default catalog/filter sources and the existing 1,712 native-case matrix
must retain their prior membership and outcomes. This guard must not be used to
hide a failed morphology experiment by shrinking those populations. The reviewed
source hash is pinned and mutated-source tests still fail. Remaining WPW
repolarization and patient-calibration debts are unchanged.

Local verification retained the exact 1,712 scenario identities and the same
56 unsupported entries as the previous native report; all 1,656 represented
outcome rows match. Independent source prediction passed 244 default/filter
cases (14,640,000 sample comparisons) plus 54 modifier cases. The newly rejected
combinations are tested explicitly under all four acquisition filters. Neither
this check nor clinical source citations validate the underlying WPW morphology.
