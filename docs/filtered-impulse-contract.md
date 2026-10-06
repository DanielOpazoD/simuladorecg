# Filtered impulse discrimination: proposed correction

Defect: brief pacing-like impulses broaden under acquisition filters and can be
accepted as ventricular complexes. A known-filter confidence warning does not
repair the sample-only detector, especially for external signals.

Domain: sampled 12-lead signals,100–1000Hz, with impulse-only counterexamples and
actual narrow/wide QRS controls. No case labels, pacing events, generator truth
or filter identity may determine ventricular detection. Filtered stimulation can
be ambiguous; abstention is preferable to inventing a rate. This does not infer
capture failure as a clinical diagnosis or reconstruct a hidden QRS.

Prediction: reject or explicitly withhold confident ventricular measurements for
repeated isolated impulses after filtering, while retaining true conducted and
paced complexes. No visible/exported sample, time coordinate or physiological
state changes. Confidence and candidate preservation must remain traceable.

Refutation: newly lost true QRS, false usable rates, unjustified widening of
quality labels or deterioration in independent exposed reference/noise strata.
Keep existing acceptance limits. Begin with red sample-domain counterexamples;
then run current-analyzer/noise/reference tests and inspect difficult traces.
No-capture VVI remains unavailable until its complete observed chain is safe.

Development note: an initial12ms slope-lobe screen did not cover a4ms pulse sampled
at250Hz and broadened by the monitor filter. The candidate now screens a24ms
sampled lower bound together with residual spatial rank<0.001 and>=80% agreement.
These are exposed engineering choices, not clinical QRS-duration cutoffs. The
unchanged independent reference/noise acceptance gates determine promotion;
passing development pulse examples alone is insufficient.

The half-height slope-lobe hypothesis was then refuted by an existing independent
90ms piecewise-linear QRS fixture: its steep main limb is brief despite a valid
complex. Replaced that feature with the central95% derivative-energy span of the
whole candidate window. Development impulse spans were14–20ms versus40ms for that
analytic QRS. Spatial rank and24ms energy-span limits are tested together; the
preservation assertion was not changed.

The external reader previously printed retained raw global numbers beside a
No estimable label. It now withholds those displayed estimates and QTc when the
support is unavailable, while keeping raw beat candidates and JSON values for
review. A browser regression imports an independent smooth impulse train without
case labels, verifies the retained raw positive-rate candidate, and requires a
dash plus No estimable in the actual table. This is confidence withdrawal, not
proof of pacing origin or recovery of true hidden ventricular events.

An additional independent0.3mV smooth impulse train plus5microvolt multichannel
sinusoidal noise revealed a remaining false usable rate. The candidate now has
a separate review-only tier (residual<0.005) for possible impulsive activity;
stronger near-rank-one evidence (<0.001) still withdraws availability. Both require
the same brief95% energy span and candidate agreement. Existing unavailable or
review evidence is never promoted. The new noisy counterexample first failed,
then passed; all independent non-regression checks must be repeated before merge.
This does not establish sensitivity/specificity for clinical pacemakers.

The first browser fixture was rejected before analysis, correctly: exact Gaussian
underflow created long zero plateaus and I/V5 were identical. Replaced the fixture
with distinct lead weights and a tiny smooth baseline, then added a unit assertion
that the unchanged external integrity gate accepts it before checking confidence.
The browser now asserts exploratory admission before waiting for measurement rows,
so an unrelated input rejection cannot masquerade as this confidence regression.
