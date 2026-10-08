# Frontal repolarization comparison: coordinate contract

## Defect and scope

The secondary-repolarization audit used `Iq * It + IIq * IIt` as a
frontal dot product. Leads I and II are 60 degrees apart, not orthogonal.
For unit frontal directions 0 and 100 degrees that expression is positive,
although their actual planar dot product is negative. This can give the wrong
answer when checking future secondary-repolarization implementations.

This helper currently supports tests, not waveform generation or a displayed
clinical measurement. Correcting it does not add secondary ST, validate a
QRS–T angle, or improve the existing approximate T template by itself.

## Prospective contract

- Recover Cartesian frontal components as x = I and y = (2 II − I) / sqrt(3)
  for each projected vector, then use xq xt + yq yt
- Predict magnitude Aq At cos(thetaq − thetat); preserve common-rotation
  invariance, symmetry, bilinearity, and zero-vector behavior
- Test orthogonal and obtuse directions, especially a counterexample whose
  old expression has the wrong sign; use 1e-12 numerical tolerance, not a
  clinical threshold
- Refute the change if any generated sample, event, or measured interval changes
- Retain source/filter regression gates and all existing secondary-source tests

The coordinate convention is the existing lead registry and frontal projection,
consistent with I at 0° and II at 60° in the hexaxial system. See the
[AHA/ACCF/HRS standardization statement, part VI](https://www.ahajournals.org/doi/pdf/10.1161/circulationaha.108.191098).
The correction is a mathematical consequence of that convention, not a new
clinical recommendation. No diagnostic cutoff or patient inference is added.
