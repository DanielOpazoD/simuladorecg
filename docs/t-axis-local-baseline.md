# T peak direction and local baseline

## Defect

The sample-only delineator uses a linearly interpolated baseline for T magnitude,
return detection and QRS area, but formerly subtracted the constant pre-QRS
anchor when computing the T peak direction. Baseline drift was consequently
included in the T vector even though the same peak's magnitude excluded it.

## Mechanism and bounded acceptance

Subtract `baseAt(tp, lead)` at the already selected T peak. Do not change the
baseline estimator, peak, return, interval, detection, confidence status, P-axis
calculation, or generator. The result remains a peak-based frontal direction,
not a clinically validated integrated T axis or a new QRS–T diagnostic angle.

Independent piecewise-linear fixtures have I=.7 and II=1 scaling, giving
46.996088° analytically. At 250/500/1000 Hz, introduce linear I drift of
−.05, −.01, 0, .01 and .05 mV/s, with the dependent limb channels derived
consistently. Require angular error <.15° on this fixture, unchanged samples,
and preserved 60/min rate. Finite baseline-anchor windows prevent a claim of
perfect drift removal. This tolerance is an engineering fixture bound.

On the 500 Hz fixture, +.05 mV/s changed the old T direction to 44.246254°;
the corrected result is 46.923618°. Negative .05 mV/s previously gave 51.537911°;
the corrected result is 47.062894°. Ordinary no-drift direction remains
46.996088°. Flat-frontal and exact-zero-direction contracts remain mandatory.

P direction is unchanged: its peak can precede the clipped baseline-interpolation
interval, so applying this patch to P would not establish the same correction.
No claim is made about arbitrary nonlinear drift, uncertain fiducials, or a
clinically normal/pathological T direction.

## Regression evidence

The complete 1712-case native population was paired with main at
2b2fcdc96f13836f880d40245be08a505bc05795. All fields except T direction were
exactly equal in all 1656 represented cases; 56 cases remained outside model
scope. T direction changed in 438 cases. There were no changed detections,
intervals, confidence statuses or inputs. This is exposed synthetic regression,
not external clinical validation. The strict confidence-policy evaluator uses
the same current numerics on both sides and exempts no numerical field.
