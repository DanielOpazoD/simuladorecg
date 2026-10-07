# LPFB source repair contract

Baseline: `8189c897cc824080b9eea8d27a8d80b3ae13fc55`.

## Defect and mechanism

Rotating the whole normal activation loop to a rightward mean axis rotates its
early deflection too: the isolated LPFB preset starts negative in I. This can
teach a QS pattern instead of the expected initial r and dominant S.

The final intervention redirects the early vector left-superior (-60 degrees),
retains its frontal magnitude and Z, and balances its integrated area against
the intermediate/main component. The original temporal supports, total kernel-weighted XYZ area,
mean axis and delayed RV component remain intact. This applies to isolated LPFB
and the combined BRD+LPFB source. It is an illustrative basis model, not an
anatomical propagation simulation or population calibration.

## Acceptance and refutation

- Original 0.5/1/2% probes become passing assertions: rS in I/aVL; qR in III/aVF
- Test isolated axes 100/120/140 degrees, gains 0.5/1/2, QRS 80/100/118 ms;
  separately test combined BRD+LPFB at its 120-degree example
- Preserve requested integrated axis, mean source area and the ventricular
  source override; no change to activation or QT/T clocks
- Compare all 60 unrelated default presets across four filters, exactly
- In an additional 96-case paired LPFB/BRD+LPFB stress set, require no newly
  falsely usable rates and no newly missed actual QRS. Report all false positive
  candidates, including worsening cases, rather than counting all candidates as
  true QRS or equating a review flag with corrected detection
- Maintain the existing detector, noise, external-record and production gates
- Inspect real production browser renders and export/repeated-selection flows

Numerical prominence thresholds are engineering checks, not clinical voltage
criteria. Noisy/filtered onsets are not validated by an isolated source probe.
The clinical directional reference is the 2018 ACC/AHA/HRS guideline, Table 3,
linked in fascicular-source-acceptance.md. Clinical exclusion of alternative
right-axis causes and independent patient validation remain outside this repair.

## Coupled measurement issue

The first whole-loop candidate caused major T double-counting and was rejected.
The retained area-balanced intervention markedly limits this, but revealed that
the existing confidence screen ignores a single uncertain candidate. One extra
candidate over 10 seconds can change HR by more than 5/min. The updated screen
compares nominal/challenged sample-derived rates, still requires elevated
background, and requests review when that difference exceeds 5/min. It does not
alter detection times or reported numbers, infer diagnosis, or read generator
truth. Five/min is the existing engineering evaluation tolerance, not a clinical
accuracy claim.

The 96-case exposed stress set has 0 missed QRS before/after, 302 versus 303
false-positive candidates, 0 newly falsely usable rates and 9 formerly false
usable rates now requiring review. This is not a claim of perfect detection:
raw overcounts remain, especially combined conduction/filtered/noisy traces.
These are exposed regression examples, not independent validation data.

## Evidence identity

The historical `lpfb` fingerprint is retained and a separate `lpfb-source-v2`
record describes the changed source. No other fingerprint is regenerated.
Frozen-source prediction checks all samples against the declared intervention;
independent landmark tests check morphology, not implementation equality.
Scripts generate current reports without rewriting historical reports.
Browser checks execute in the existing CI runtime because local Chromium cannot
create its required sockets in the cloud sandbox. Screenshots must be reviewed
from that exact build before declaring visual verification.
