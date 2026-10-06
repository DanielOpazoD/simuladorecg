# Contextual conduction controls

The inspector now groups inactive conduction controls in a native disclosure. Values are retained, not reset or silently normalized. The rhythm selector and applicable fields stay visible. The disclosure describes implementation scope, not whether a physiological combination can exist in a patient.

Corrected applicability:
- Escape type only acts in sinus rhythm with complete AV block; a stale complete-block option must not enable it in AF, flutter or pacing.
- Source-driven ventricular complexes override requested frontal QRS axis and intraventricular conduction: VT, torsades, idioventricular rhythm, VVI/DDD, and complete sinus AV block with ventricular escape.
- AAI, junctional escape and mixed ectopy retain controls that can affect conducted beats.
- QRS duration remains available because it acts above the selected source's minimum duration.

Verification uses counterfactual sampled signals for every source-driven group, plus applicability and retained-value tests. Browser coverage checks native keyboard disclosure, focus retention, repeated flutter changes, VVI controls and layout at two viewport sizes in Chromium, WebKit and Firefox. Browser engines/emulated viewports do not constitute real-device or WCAG certification.

No engine equations, sample baselines, numerical thresholds, external reference data or dependencies change.
