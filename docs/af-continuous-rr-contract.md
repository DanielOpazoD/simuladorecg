# Continuous AF RR candidate: bounded claim before evaluation

Defect: the existing sampler clips a random mixture at0.38 and2.15 times nominal
RR, producing artificial point masses. Its exposed synthetic CV was about0.36,
while corrected AFDB evidence was limited to one record with full60s windows.

The prespecified LTAFDB development selection uses16 records chosen by hash before
annotation inspection;15 contain eligible full AF windows. The median of their
record-level median CVs is0.22284 (range0.1524–0.2778). Windows are not independent
patients. No waveform, f-wave morphology or AV-node physiology is inferred from
these timing statistics. The eight reserved records remain unread.

Candidate fixed before reserved evaluation: a positive gamma renewal distribution
with mean60/HR and CV0.22 (shape1/CV², scale=mean/shape). The rounded development
median sets one representative profile, not a universal AF variability. Successive
intervals are independent; serial correlation, concealed conduction and autonomic
state are not modeled. No hard clipping, endpoint atoms, per-seed normalization or
lookahead into requested duration. This is an explicit statistical approximation,
not an electrophysiological AV-node solver.

Prediction: preserve nominal mean timing in long runs, eliminate clipping atoms,
and reduce record-level distribution mismatch relative to the old sampler in the
reserved evaluation. Report CV, normalized quantiles and lag correlation separately;
do not hide poor temporal dependence behind better marginal variability. Keep the
unmodified non-overlap model-scope checks. An extreme unsupported combination may
still fail explicitly; never silently move a beat or fabricate refractory periods.

Acceptance requires deterministic prefixes/seeds, finite positive intervals,
independent moment checks, unmodified timing/lead/measurement gates, actual browser
traces and one frozen reserved evaluation. Failure does not authorize fitting to
the reserved set or weakening existing clinical-uncertainty safeguards.

Source: https://physionet.org/content/ltafdb/1.0.0/ . Use the manually reviewed atr
annotations, not the automated qrs files. Cite Petrutiu, Sahakian and Swiryn (2007)
and acknowledge MEDICALgorithmics annotation contributors. Dataset does not itself
validate the gamma family or establish subject independence between records.

Sampling implementation reference: Marsaglia and Tsang, ACM Transactions on
Mathematical Software26(3),363–372 (2000), DOI10.1145/358407.358414.
This validates the sampling construction, not an AF disease mechanism.

The development reader found one auxiliary comment outside record30's declared
signal duration. It is counted explicitly as an outside ancillary annotation;
the recording duration is not extended and no beat/rhythm annotation is trimmed.
Out-of-range physiological annotations still fail. This reader correction was
made before any reserved annotations were acquired.

## Frozen reserved result (now exposed, not available for retuning)

Eight reserved records had eligible AF windows. Record-weighted CV error decreased
from0.16205 to0.05444; normalized5th/95th quantile mean errors also decreased.
However the95th-quantile error worsened by0.09813 in203 and0.13366 in62, both above
the prespecified0.02 reporting threshold. The single fixed-dispersion candidate
therefore does not represent every AF profile. These failures are retained and
the candidate has not replaced the production clock. Do not claim these eight
records remain an untouched evaluation set after this experiment, or refit to
them and call the resulting comparison independent.

## Promotion scope decision

The preregistered primary criterion (record-weighted CV error) improved, while the
secondary upper-tail regressions remain explicitly reported. Evaluate integration
as ONE representative AF clock, not a universal patient distribution. Keep CV0.22
and the frozen sampler unchanged; do not refit to the exposed evaluation records.
The product must display that this is an independent-interval statistical surrogate
without AV-node memory or individual calibration. High-variability tails in203/62
remain a known limitation. Production promotion still requires the complete
waveform/event/measurement chain and preserved non-AF samples; the primitive-only
comparison does not establish those properties.

Integration initially failed the three historical AF sample fingerprints, as
expected for an intentional clock change. Those stored fingerprints remain
unaltered. The three cases now require exact registered-sampler integration
(seed, one interval draw and warm-up placement), deterministic samples, and the
mandatory independent frozen-source full-waveform prediction. Other fingerprints
and numerical tolerances are unchanged. The independent prediction passed all244
scenarios/14.64M samples/54 combinations, including the intentional AF timing delta.

The paired synthetic worker sweep uses ONE analyzer for both old/new generators:
72 combinations (six rates, three seeds, four filters). Falsely usable HR errors
above the existing5bpm engineering threshold decrease from12 to0; usable-count
coverage stays36/36. Reference HR comes from synthetic events only in the evaluator,
never inside the analyzer. These exposed synthetic results are not patient accuracy.
The same comparison is a mandatory CI gate, alongside the unchanged numerical
prediction and the repeated, now-exposed LTAFDB comparisons with tail regressions.
