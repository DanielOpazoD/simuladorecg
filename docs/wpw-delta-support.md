# WPW delta: causal support on the native sampling lattice

This repairs a documented numerical acquisition defect, not the outstanding WPW
repolarization/pathway model. The illustrative delta is defined on a45 ms interval
starting at ventricular onset. The common sampler starts at floor(start*1000),
which can evaluate its sine at a negative phase for fractional/rounded onsets.
Unlike the other compact envelopes, the delta helper did not enforce its support.

Contract fixed before implementation: delta is exactly zero at/outside phases0–1;
every value strictly inside stays arithmetically identical. Preserve direction,
gain/low-voltage factors,45 ms duration, event times, other wave components,
filters and sample analyzer. Do not round or shift the event to the sample grid.
The existing symmetric acquisition FIR can spread a correctly bounded native
pulse around its onset; zero displayed samples before onset is NOT the contract.

Acceptance: endpoint/fractional-phase tests that fail on the historical helper;
independent analytic native pulse followed by the existing acquisition transform;
exact non-WPW preservation and a separate frozen-source prediction for the WPW
change, without raising tolerances or replacing stored reference waveforms.
Keep the outstanding WPW ST–T/pathway limitations visible. No clinical validation.

Eight endpoint/out-of-support assertions fail under the old sine; all10 original
helper tests pass after bounding it. Four additional fractional-PR tests compare
an independently constructed native pulse after every acquisition filter. The
old WPW fingerprint correctly fails; its stored values remain unchanged. The
catalog test adds back only the independently computed historical leakage before
checking that fingerprint, while frozen-source CI predicts the repaired waveform.

Before inspecting its result, require a paired192-case native worker sweep:
HR40/73/120/180, PR90/100.3/101.7, four filters, artifact level0/.05 and normal/low
voltage. Same sample-only analyzer for historical and repaired generators. Retain
unsupported combinations, raw rates, statuses and any loss of usable coverage.
No newly falsely usable HR beyond5 bpm; these are exposed software tests, not
patient or clinical validation. The standard920-case noise gate also remains.

Paired native sweep result: all192 configurations represented; zero new falsely
usable HR and usable coverage unchanged at78/192. Twelve pre-existing falsely
usable rates remain both before and after the repair. They are retained in the
report, not treated as correctness or erased by this numerical improvement.
This PR repairs pulse support only; sample-only rate confidence remains a debt.
