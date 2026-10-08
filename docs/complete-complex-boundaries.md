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

- Regional paired domain: all 304 cases (the original 256 plus 48 actual-default
  control settings); no additional missed actual activations,
  falsely usable HR, newly usable QRS/QT errors, or usable regional QRS summaries
  beyond the 20 ms screen. Usable HR coverage is 153 template versus 137 regional.
  All 24 off/diagnostic default controls retain measured QRS and QT, with the
  original 20/30 ms screens.
- Native matrix: 1,892 scheduled, 1,836 admitted and 56 explicitly unsupported;
  all 12 previously identified regressions corrected; no new missed QRS,
  phase-identity misses, falsely usable HR, or usable QRS/QT error counts per case.
- Native HR estimates labeled usable: 1,520 → 1,477. Falsely usable HR cases:
  91 → 75. Twenty-seven numerically correct mean rates move to review; none move
  the other way. The 75 residual cases are unresolved debt, not validated output.
- Native QRS summaries change in 156 scenarios. Usable QRS coverage is
  1,118 → 1,054; matched beat errors beyond 20 ms under that global status are
  7,366 → 5,785. QT usable coverage is 488 → 497; analogous errors beyond 30 ms
  are 480 → 369. These are correlated synthetic beat counts, not patient rates
  or beatwise confidence. They do not establish universal accuracy.
- All 920 noise scenarios pass the unchanged strict paired gate against PR151.
- All 152 already exposed LUDB measurements and all 300 evaluated INCART
  windows remain exactly unchanged. The latter are two sets of temporal windows
  from the same 75 recordings / 32 patient groups, not 300 patients.
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

## Browser-discovered closure and preserved temporal experiment

The first candidate `4f9bce8ad1f0a3daa7562cf980ab2843e818393f` passed the initial
numerical sweeps but the personally reviewed browser image exposed a missing
measurement at the actual 190 ms / QTc 410 ms default. Its initial 194 ms window
was valid; treating a later T slope as more QRS support proposed an inadmissible
386 ms complex and discarded that first window. The repair now rechecks a valid
terminal-limb window against ventricular neighbors when the proposed merger is
refuted. It preserves the earlier rate-confidence limitation rather than deriving
new rate confidence solely from rescued intervals. No width bound is widened.

The expanded default sweep also exposed a systematic terminal baseline-return
bias at QRS 140 ms. Within the existing regular-RR QT domain, a baseline return
that differs from its tangent by more than the existing 24 ms consistency scale
now challenges the stricter tangent first. That option still requires four
wavelet leads within 20 ms and an unambiguous tail. Failure of those requirements
leaves the observed-return option intact. The case changes from about 414 ms to
380 ms; the 152-record real ECG measurements remain identical.

The first candidate's INCART temporal screen passed in CI on 2026-10-08 at
06:32:30 UTC: all 150 windows unchanged, TP 1,838 / FP 177 / FN 11 and 11 falsely
usable mean rates in both arms. These are preservation results, not accuracy
approval. That experiment stays frozen at `4f9bce8`; the protocol is not updated
to bless the later browser correction. CI replays the exact frozen source and
separately requires exact current-product parity on those now-exposed targets.
The earlier 150 windows also remain unchanged in the local current replay.

The additional WPW supplement has one raw adverse boundary in an aggressive
filter stratum: retained outliers increase 13 → 14 across three windows, all
already under review. The unchanged acquisition policy withholds aggressive-filter
intervals. This is disclosed separately from the passing frozen 920-case strict
gate; it is not mislabeled as universal raw-boundary improvement.

## Source-evaluator boundary correction

The first remote secondary-ST check reported one new missed activation because
it censored the 9.812 s fiducial of the QRS spanning 9.650–9.815 s, even though its
9.7325 s reference midpoint was inside the fixed scoring window. The activation
was present in the samples and detected; only its within-QRS fiducial changed.
The corrected evaluator keeps reference midpoints in [0.2, 9.8), preserves the
150 ms matching tolerance, and admits an outside-window fiducial only within an
included QRS's existing −10/+30 ms support. Unmatched exterior candidates remain
unscored; interior false positives still count. Raw truncated scores and every
boundary witness remain in the report. Both source arms use the same rule.
Independent negative tests reject neighboring outside waves, doubled matches and
matches beyond 150 ms. The complete 540-case source check then has zero new
falsely usable rates, diagnostic misses or diagnostic false detections.
