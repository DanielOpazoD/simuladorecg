# Whole observed complexes, not isolated terminal slopes

## Scope

This numerical revision closes the sample-analysis blocker for the opt-in regional
LBBB surrogate in PR121. The waveform model, its 130–240 ms domain, default
historical template, and public sample-only input contract are unchanged by the
analyzer repair. It is an engineering model, not a patient-specific activation
map, clinical validation, or a prediction of CRT response.

Two linked failures must be repaired together:

1. A late P/T-associated energy maximum could suppress the actual ventricular
   maximum inside the 180 ms competition interval. A plausible mean rate did not
   establish that the detector had found QRS complexes.
2. After recovering the correct activation, duration could still describe only
   its terminal component: observed examples included 54 ms for a 160 ms template
   complex and 80 ms for a 200 ms regional complex. This revision repairs the
   measured boundaries, rather than merely attaching a warning to those values.

## Sample-only mechanisms

- Keep the existing energy maxima and event-count protections. Replace a late
  maximum only with one-to-one, repeated multilead contour support from at least
  three distinct isolated complexes. Preserve selection strength and collision
  spacing. No case, diagnosis, event, requested duration, or model audit enters
  the analyzer.
- Strongly reversed 160 ms contours can be the two slopes of the same complex.
  If switching only some such fiducials would add RR dispersion beyond the
  existing 30 ms contour-agreement scale, retain the original fiducial. This
  prevents an internal QRS choice from manufacturing beat-to-beat variability.
- Carry observed opposing-slope support into delineation. Raw maxima suppressed
  by NMS can support a window without becoming additional beats. Event grouping
  retains its 180–280 ms limits; the metadata-only query uses the existing 80 ms
  contour radius and the same continuity and separate-complex safeguards.
- First evaluate the original window with its original neighbors. Reframe only
  if it truncates independently observed support. Search for baseline before the
  earliest supported slope; a broad internal voltage plateau is not baseline.
  Bridge internal shoulders, retain the original reported beat fiducial, and
  require complete neighboring complexes before publishing an interval.
- Preserve evidence of ambiguity from the original windows, including removed
  secondary landmarks. Better boundaries alone cannot erase earlier variability
  or unresolved short intervals. Review is retained data, not abstention.

## Acceptance and honest limitations

All source references stay in evaluators. Existing engineering screens remain
5 bpm for HR, 20 ms for QRS, and 30 ms for QT. The native and regional evaluations
also check actual QRS support with the existing −10/+30 ms bounds, not merely
±150 ms midpoint matching or a plausible mean rate.

Prepublication local evaluation of the candidate executable:

- Regional paired domain: all 256 cases; no additional missed actual activations,
  falsely usable HR, newly usable QRS/QT errors, or usable regional QRS summaries
  beyond the 20 ms screen. Usable HR coverage is 129 template versus 117 regional.
- Native matrix: 1,892 scheduled, 1,836 admitted and 56 explicitly unsupported;
  all 12 previously identified regressions corrected; no new missed QRS,
  phase-identity misses, falsely usable HR, or usable QRS/QT error counts per case.
- Native HR estimates labeled usable: 1,520 → 1,477. Falsely usable HR cases:
  91 → 75. Twenty-seven numerically correct mean rates move to review; none move
  the other way. The 75 residual cases are unresolved debt, not validated output.
- Native QRS summaries change in 164 scenarios. Usable QRS coverage is
  1,118 → 1,056; matched beat errors beyond 20 ms under that global status are
  7,366 → 5,785. QT usable coverage is 488 → 492; analogous errors beyond 30 ms
  are 480 → 373. These are correlated synthetic beat counts, not patient rates
  or beatwise confidence. They do not establish universal accuracy.
- All 920 noise scenarios pass the unchanged strict paired gate against PR151.
- All 152 already exposed LUDB measurements remain exactly unchanged.
- Independent analytic 160/200/240 ms shoulder/notch fixtures cover 250/500/1000 Hz
  and channel baseline offsets, including frontal area direction. The browser
  fixture now measures its whole 240 ms support rather than withholding it.

The full current-source CI reports and production-browser artifacts are required
before merge. Local source formatting is checked for identical minified analyzer
bytes. Historical QRS/T, T-peak, and QT protocols remain immutable: earlier
nonmoving-boundary claims are replayed on the exact PR151 predecessor, while the
current analyzer gets separate live numerical and annotated-data checks.

The earlier collision-only reference and its prospective INCART screen are not
validation of this later interval revision. The original 150 INCART windows and
all 200 LUDB records are already exposed. Any additional temporal INCART screen
must explicitly identify the same known recordings/patient groups and must not
be described as a new independent patient cohort.
