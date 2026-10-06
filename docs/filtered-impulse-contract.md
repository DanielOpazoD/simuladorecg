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
