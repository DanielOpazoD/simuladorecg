# One covariance statistic for candidate and impulse analysis

The impulse-confidence helper retained a separate 25-step power iteration after
QRS/T shape analysis adopted the verified symmetric solver. Its strongest-diagonal
seed avoids an anti-parallel cancellation but can still miss a larger eigendirection:

- Independent diagonal component: eigenvalue 5
- Three-channel all-3 block: eigenvalues 9, 0, 0
- Trace 14; correct residual 5/14; old helper selects 5 and reports 9/14

This is an exact numerical counterexample, **not evidence of a changed clinical
classification**: both residuals exceed the current impulse cutoffs. The revision
removes the duplicate solver and uses the existing `covarianceResidual` export.
Confidence cutoffs, impulse-energy windows, minimum candidate count and retirement
policy are unchanged. No new dependency, source waveform or educational feature.

Acceptance combines the analytic counterexample, existing impulse/shape fixtures,
call-site sharing and source immutability, plus paired exposed cohorts. Historical
analyzer builds restore the original impulse helper alongside the original detector;
they do not import a new export from an older detector. Exact old/new source hashes
remain separately recorded; historical manifests are untouched.

Local verification:
- 40 focused covariance/impulse contracts pass
- 1,783 unit tests, TypeScript and production build pass
- 1,712 native scenarios, including 56 explicit exclusions; all 1,656 represented
  paired outputs identical, no new missed activations or falsely usable rates
- 80 exposed annotated records retain exact numerical outputs and quality states
- 920 noise rows and 20 native comparisons exactly unchanged; strict gate passes

These are regression and mathematical checks, not clinical validation. Existing
native false-usability and model-fidelity debts remain visible and unresolved.
