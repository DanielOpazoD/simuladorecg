# Direction independent covariance in QRS T discrimination

## Confirmed numerical defect

The existing shape statistic is the covariance fraction outside its dominant
spatial direction: `1 - largestEigenvalue / trace`. Its power iteration always
started from `[0.5,0.5,0.5,0.5]`. For the valid rank-one covariance of
`[1,-1,1,-1]`, that seed is orthogonal to the only nonzero eigendirection. The old
routine returned residual 1 instead of 0. An exact binary-fraction fixture also
made it converge to a smaller eigenspace: 0.888889 instead of 0.111111.
Both analytic tests failed against the actual predecessor before correction.

This is not evidence that every clinical T is rank one. It is a defect in the
statistic already used by the existing conservative P/T screen: channel signs
must not make a proportional waveform appear multidirectional.

## Bounded correction

A symmetric Jacobi eigensolver now evaluates the four-channel covariance.
Normalization limits numerical scale; bounded rotations terminate at machine
precision, not a physiological threshold. Exact symmetric input is the contract
of the production outer-product sum. Invalid/nonfinite/non-PSD matrices fail
visibly. Zero-energy unknown behavior is retained; inputs are never mutated.

No change to slope energy, refractory competition, candidate thresholds, shape
thresholds, confidence policy, signal generator, acquisition filters or event
matching tolerance. No dependency or new algorithm-selection layer is added.
The unrelated directional-score, bandpass and waveform experiments are excluded.
The reviewed numerical hash identifies these exact bytes; historical acquisition
protocols, numerical predecessor bytes and clinical/reference thresholds remain
unchanged.

## Independent numerical and signal checks

- Known rank-one and full-rank spectra, channel permutation, polarity and scales
  from 1e-100 to 1e100; 80 rotated known spectra; no mutation or plausible output
  for invalid matrices.
- A separate local NumPy/LAPACK calculation on 400 deterministic PSD matrices
  differs by at most 1.12e-15. This is floating-point agreement, not clinical error.
- Twelve analytic sample fixtures span 250/500/1000 Hz, two T polarities and two
  constant offsets. Their signed T channels cancel the old seed while preserving
  limb identities. The predecessor counts 11–15 candidates instead of ten in
  seven of twelve variants; the corrected detector retains all ten QRS and no
  counted T in all twelve. These are adversarial fixtures, not patient ECGs.
- All 1,656 represented rows of the 1,712-case native regression matrix remain
  exactly equal to current main; 56 exclusions stay visible, all 12 previously
  exposed QRS/T cases remain correct, no newly missed QRS or falsely usable rate.
- All 80 previously exposed LUDB records retain identical numerical outputs and
  quality (75 usable HR). LUDB voltage quarantine remains intact.
- All 920 noise rows and 20 native comparisons remain exactly equal to the prior
  local result. The strict frozen noise comparison passes without any failure or
  threshold adjustment. Existing inaccuracies remain in its report.

The source hash and compact evidence are in
`docs/evidence/covariance-direction-revision.json`. Exact-head CI, including the
existing temporal-quality cohorts, must pass before merge. This mathematical fix
does not approve the blocked LBBB source, either rejected LPFB source hypothesis,
clinical QT accuracy or educational expansion.
