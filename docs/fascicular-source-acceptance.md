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

## Source repair

The original baseline 8189c89 lacked the initial positive I deflection at all
three relative thresholds. The LPFB source now restores early left-superior activation and balances
its area against the later component, preserving the original mean source. See [repair contract](lpfb-resolution.md).

The three previous expected failures are ordinary passing assertions. Lateral
rS and inferior qR are checked independently of the implementation, including
axis, amplitude and duration perturbations. LAFB remains unchanged. The synthetic
source probe is not a diagnostic classifier or clinical validation.

`node scripts/audit-fascicular-source.mjs OUTPUT` retains its original metric,
thresholds and report format. Its status now depends on the observed samples;
no success label is hard-coded. Paired source and detector regression is run
by `node scripts/validate-lpfb-resolution.mjs OUTPUT`, against immutable 8189c89.
Clinical validation remains false even when all selected features are observed.
