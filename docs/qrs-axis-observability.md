# Wave-specific frontal QRS support

## Reproduced defect and intended learning

The global flat-channel guard already correctly withheld all frontal axes when I
and II were constant throughout the recording. It did not handle a different
case: P and T vary in I/II, while both channels remain exactly constant inside
every delineated QRS. The aggregate QRS axis was reported as **usable 0 degrees**.
P/T activity cannot supply the absent directional information of QRS.

The independent piecewise fixture retains the precordial QRS, atrial and
repolarization waves. It removes only frontal QRS variation over 0.30–0.50 s
within each one-second cycle. Against the exact predecessor, 12 variants fail
(250/500/1000 Hz, two polarities and zero/nonzero independent channel offsets).
This is an analytic absence-of-information test, not a patient phenotype.

## Mechanism, prediction and boundaries

After existing measurement/support processing, test exact constancy in both I
and II over every reported QRS interval, using its existing half-open sample
window. When all such windows lack variation, retire the aggregate QRS axis and
record its prior value as a rejected candidate. Keep P and T axes, other numerical
measurements, all candidate landmarks and the source samples unchanged.

There is no voltage cutoff, new detector, resampling, retiming, axis correction
or diagnostic input. Tiny nonzero variations and a legitimate zero-degree axis
remain observable. A mixed set of varying and constant windows is outside this
narrow retirement rule; the existing aggregation/dispersion policy remains.
Candidate-level axes remain available for inspection and are not independently
validated directions. Removing an unsupported aggregate is not calibration of
the remaining axes.

## Refutation and acceptance

The proposal is wrong if it alters other numeric measurements, removes independently
supported P/T directions, promotes confidence, changes source samples, or
reclassifies ordinary regression records. Predecessor failures, offset/polarity/
sampling counterfactuals and exact paired preservation are required before
registering the revised sample-entry hash. The historical numerical core and its
reference files remain untouched. Exact-head CI and post-merge checks are also
required; machine tests do not establish clinical axis accuracy.

## Local verification of the candidate

- 15 focused contracts pass; 12 failed on the unmodified predecessor
- 1,778 unit tests, TypeScript and production build pass
- 1,712 native scenarios: 1,656 represented paired rows exactly identical,
  including QRS/P/T axes and QRS-axis status; 56 exclusions retained
- 80 previously exposed annotated records: all numerical outputs identical,
  no changed quality statuses (75 usable HR before and after)
- 920 noise rows and 20 native comparisons exactly match the preceding revision;
  the existing strict noise gate passes with zero failed strata

Compact evidence and report hashes: [qrs-axis-observability.json](evidence/qrs-axis-observability.json).
The candidate changes only the explicitly constructed absent-QRS-information
case in these comparisons. CI must independently verify the final published tree.
