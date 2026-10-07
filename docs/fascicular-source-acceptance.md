# Fascicular source acceptance: morphology beyond axis

A rightward axis alone does not establish a posterior fascicular pattern. The
2018 ACC/AHA/HRS guideline, table 3, describes directional QRS features in addition
to adult axis and duration criteria. Its anterior fascicular definition also
includes delayed R peak in aVL. [Official guideline, STS-hosted copy](https://www.sts.org/sites/default/files/Endorsed%20Guidelines/2018%20ACC-AHA-HRS%20Bradycardia%20Full%20Text.pdf), PDF page 10.

This audit examines the two existing default synthetic sources with P/T/ST, noise
and acquisition filtering disabled. It uses their explicitly programmed QRS support
to isolate the generator. That support and the configured axis/duration are **not
independent clinical measurements**. The pre-existing anti-alias/downsampling chain
is still present. Reported peak times use sample timestamps relative to the actual
programmed onset, rather than silently rounding onset to the first retained sample.

The probe reports initial polarity, dominant polarity, voltage extrema and R-peak
time. Relative 0.5%, 1% and 2% amplitude levels test numerical sensitivity; they are
not diagnostic amplitude cutoffs. Matching these features does not establish the
complete qR/rS morphology, diagnostic specificity, mechanism or patient validation.

## Current result

- LAFB default: tested aVL and inferior directional features, including R peak in
  aVL at least 45 ms, are observed at all three probe levels
- LPFB default: the initial deflection in I is negative at all three levels;
  therefore the required initial-positive/dominant-negative feature is missing
- Inferior LPFB features can pass while this I-lead defect remains. A correct
  configured axis cannot substitute for the missing waveform feature

The LPFB assertions are explicitly marked **expected failures**, with all source
preparation and probing performed outside the failure block. Their callback tests
only a prepared boolean. An unrelated generation or probe exception therefore
cannot masquerade as the intended missing-feature result. If the feature improves,
the unexpected pass requires review and removal of the known-failure marker after
source, detector and noise gates pass. Do not alter the expected feature to keep CI
quiet. Other landmark checks remain ordinary required passing tests.

`node scripts/audit-fascicular-source.mjs OUTPUT` writes a fresh machine-readable
report. CI archives it as `fascicular-source-results.json` alongside exact source
identity. Successful script execution means the report was generated, **not that
fidelity passed**; its current status is `observed-source-feature-gaps` and clinical
validation remains false. This audit does not resolve LPFB, change model samples,
weaken existing tests or permit promotion to educational readiness.
