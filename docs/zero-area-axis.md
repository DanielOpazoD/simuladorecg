# A zero frontal vector is not a measured axis of zero degrees

## Reproduced defect

The language convention `atan2(0, 0) = 0` escaped into sample measurements.
Existing acquisition guards cover flat frontal channels, but a nonconstant
biphasic QRS can also have exactly cancelling signed I/II areas. Independent
250/500/1000 Hz fixtures reproduced a reported zero-degree direction. Additional
fixtures reproduced the same error for P or T visible in precordial channels but
absent in the frontal samples used by their direction estimate.

## Narrow correction

At the point of measurement, exactly zero I **and** II contributions now produce
`null`. There is no new voltage threshold, amplitude normalization, detector
criterion or clinical low-voltage claim. Arbitrarily small nonzero contributions
still use the existing arithmetic. The generator's vector projection is unchanged.

Per-beat QRS `axis` can now be null, just like other absent measurements. Circular
statistics and axis-support candidates use only observed directions. An all-null
population has no aggregate; a mixed population requires review. Missing QRS
axes do not remove complexes, alter boundaries or withdraw unrelated intervals.
Noisy acquisition cannot promote an unavailable axis back to review.

P/T directions retain the existing peak-based estimator, not a newly validated
integrated clinical axis. A zero frontal peak is retained as missing internally;
if any contributing peak lacks direction, that P/T summary is withheld rather
than silently manufacturing zero or claiming complete support.

Earlier flat-axis regression tests now require a null primitive result and no
rejected artificial zero: the incorrect angle is never calculated. Their
non-axis preservation, P/T separation, DC offsets, polarity and genuine 0-degree
controls remain. This is a defined numerical defect, not population validation.

## Acceptance

- Red-before/green-after independent cancelling-area and absent P/T fixtures
- Ordinary-amplitude biphasic lobes and tiny nonzero-area negative controls
- Missing/present QRS support accounting and conservative mixed status
- All existing native, annotated, noise and browser gates without weaker limits
- Paired source samples, events, detections, bounds and finite-direction outputs

LUDB absolute amplitude calibration remains quarantined. Existing fascicular,
LBBB and prospective T-end limitations are not resolved by this correction.

## Local paired evidence (2026-10-07)

On reviewed measure SHA-256
`c78e48df10d2c394e0b94e2772a84971edf292ef00793363e1c01a9ff94d7d0e`:
all 1,656 represented members of the unchanged 1,712-case native matrix have
byte-for-byte-equivalent serialized measurement values/support versus main132
(the remaining 56 are the same unsupported synthesis cases). All 80 already
exposed annotated records preserve numeric measurements; no new cohort was used.
The frozen 920-noise-case plus 20-native-comparison gate passes all 73,440
morphology comparisons and 320 quality strata. No acceptance budget was widened.
These known regressions demonstrate preservation, not independent validation of
clinical axis accuracy. The new zero-information fixtures exercise the intended
change that those ordinary cases do not contain.

The first PR CI correctly blocked the unregistered support-file change. The
revision registry now pins both exact predecessor and candidate bytes of
`measurement-support.ts`, and historical bundles restore its exact predecessor.
The same mutation test rejects any unreviewed byte change. No filename-only
exception, numerical tolerance or historical report was substituted to pass CI.
