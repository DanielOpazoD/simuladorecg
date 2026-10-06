# Proposed total VVI noncapture without an escape source

Scope fixed before implementation: one optional ECG-only state, total absence of
ventricular capture AND intrinsic rate0. Preserve scheduled pacing stimuli; remove
ventricular activations because the stimulus does not depolarize the myocardium.
Mixed capture/escape, intermittent failure, thresholds in mA/V, refractory device
algorithms, fusion and mechanical capture/perfusion remain outside scope.

Use a distinct requested VVI behavior. Never silently zero an intrinsic rhythm or
accept an unsupported mixed combination. Existing fixed/demand capture stays exact.
A pacing stimulus is not proof of ventricular capture; example source: Medtronic
5392 reference guide, https://www.medtronic.com/content/dam/medtronic-wide/public/canada/products/cardiac-vascular/cardiac-rhythm/pacing-systems/epg-5392-reference-guide.pdf . The simulator does not reproduce that device or provide programming instructions.

Acceptance before UI promotion: actual sampled production chain across pacing
rates and acquisition filters, no confident ventricular rate from stimulus-only
traces, correct live/frozen/exported display, exact recovery after restoring capture,
and unchanged legacy samples. The analyzer must use samples only; no diagnosis or
synthetic zero rate may replace its retained raw candidates. If the bounded chain
fails, keep the state unpublished. Do not extend it to mixed escape merely because
one stimulus-only example passes.

Observed pre-UI gates: all28 clean rate/filter cases withdraw HR/QRS availability.
An exposed288-case rate/seed/artifact/filter sweep produces0 falsely usable worker
rates (noise can require review rather than full withdrawal). This does not establish
clinical device-detection sensitivity/specificity. Browser acceptance must observe
actual worker packets without modifying them, show unavailable estimates, reject a
mixed escape request visibly, and restore the exact captured trace on recovery.

Integration review: the existing About assertion still listed demand pacing as
unimplemented. It failed after correcting that obsolete text; the replacement
asserts the implemented idealized scope and retained limitations. No physiological
gate or sample baseline was relaxed. Browser coverage also freezes the monitor,
checks the unavailable rate, downloads real JSON/PNG, and checks that exports do
not mutate the observed samples. PNG appearance requires artifact inspection.

Final UI audit caught an unrelated secondary ST/QRS warning in the no-ventricular-activation state. A new regression reproduces it before the scoped fix; the warning remains for captured VVI and is omitted only when there is no ventricular activation.
