# External worker measurements: coordinate integrity

The worker boundary accepted finite but internally inconsistent times and units.
Require ordered unique detections, ordered linked beats, bounded fiducials in the
reported ten-second window, positive QRS support and nonnegative noise. RR must
match its detected predecessor, and PR/QRS/QT their own landmarks. Keep absent
PR/QT and standalone T peaks valid. Reject rather than clamp or repair replies.

Tolerance 1e-7 ms for durations and 1e-9 s for RR covers arithmetic roundoff only;
these are not clinical accuracy claims or normal interval ranges. Preserve the
analyzer, input gate, missing axes and all confidence rules. Numerical consistency
does not prove a landmark is clinically correct.

Acceptance: adversarial malformed replies fail while intact analytic replies pass;
replay the known synthetic matrix and already exposed reference records, without
new acquisitions or holdout claims. In the built browser application, corrupt a
worker duration, require a visible rejection and unavailable export, then reload
valid data and recover the identical original export. All full CI gates remain.

## Verified regression

Fourteen malformed replies pass the preceding boundary and are rejected by the
new one; two intact/partial-wave controls remain accepted. Full check: 1,908
passes and three separately documented expected LPFB failures; types/build pass.
A fresh replay preserves all 1,712 known synthetic configurations: 56 unsupported,
1,652 eligible replies accepted, four unchanged manual-only input-gate results.
All 80 already exposed original/calibration LUDB replies are accepted. Physical
Float64 samples are decoded from original digital bytes and gain/baseline, as in
the external reader; this does not lift the cross-lead calibration quarantine.
No new patient cohort or clinical validation is claimed.
