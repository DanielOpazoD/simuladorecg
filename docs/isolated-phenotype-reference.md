# Isolated metadata labels before morphology calibration

## Defect and scope

The existing 64-original-record audit establishes source voltage integrity in its
selected records, not calibration of normal, fascicular, LBBB, WPW or paced
morphology. The broad development cohort contains overlapping diagnoses. Its
LPFB-labelled examples include RBBB/AF or RVH/ischaemia; those are not clean
references for an isolated posterior fascicular teaching pattern.

The new protocol selects original PTB-XL 1.0.3 recordings from metadata before
acquiring waveforms. It keeps only the target label at dataset likelihood 100,
with SR as the sole additional allowed code. This is metadata isolation, **not
independent clinical adjudication or diagnostic certainty**. NORM means a dataset
ECG label, not a healthy patient. No generator coefficient is adjusted here.

## Frozen development selection

- Adults only, including the dataset's age-masked older adults; no demographics
  or free-text reports are exported.
- Development folds 1–8 only. Any fold 9/10 record excludes that entire patient,
  even if the held-out record itself is not an eligible phenotype.
- Exclude patients with multiple eligible phenotype groups; keep the lowest
  eligible ECG ID for the others. Stable patient-hash ordering, cap 20 per group.
- Pin metadata and release-manifest bytes. Preserve the frozen historical cohort,
  its protocol, reader, medians and all existing source-quarantine decisions.
- Sparse groups keep their actual denominator. Do not fill them with overlapping
  diagnoses, relax confidence thresholds or inspect test-fold waveforms.

Metadata-only selection gives 94 records: NORM 20, LAFB 20, LPFB **1**, CLBBB 20,
WPW **13**, PACE 20. Eligible patient pools are 4773, 205, 1, 159, 13 and 174,
respectively. These counts precede waveform acquisition. LPFB is far too sparse
here to establish population amplitude ranges; that deficit remains visible.

## Acquisition and acceptance

The explicit acquisition command requires an existing selection and recomputes it
from the pinned metadata/protocol before any waveform fetch. It also requires exact equality to the committed
metadata-only cohort, so a selector change cannot silently substitute records. It reuses the existing
release-checksum reader, the original-header validator and independent WFDB 4.3.1
cross-check. Original WFDB16 samples stay at 500 Hz, 5000 samples, 1000 counts/mV,
zero offset. No vendor median rescaling, per-trace normalization or guessed units.

Local contracts use tiny synthetic metadata and no network. They reject label
mixtures, uncertain labels, whole-patient holdout leakage, duplicate IDs, unsafe
paths, policy broadening and edited selections; check input-order independence,
one-record-per-patient, scarcity and minimal exported metadata. The existing
reference workflow performs actual acquisition and archives the exact source,
selection, checksums, calibrated samples and software versions. No new workflow,
framework or dependency is introduced; four bounded I/O transfers reduce latency.

Acceptance of this infrastructure requires source checksums, independent reader
agreement and exact selected-record coverage. Acquisition cannot close clinical
calibration: whole-record range is not QRS/T amplitude, and a label does not define
wave boundaries. Future delineation and morphology review must preserve uncertain
or missing boundaries and use a distinct evaluation set. Existing LUDB voltage and
12SL median conflicts remain quarantined.

Sources: [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/) and its original
record metadata/headers; [AHA/ACCF/HRS conduction recommendations](https://www.jacc.org/doi/10.1016/j.jacc.2008.12.013)
provide clinical morphology criteria, not coefficient calibration or validation of
this cohort. No original waveform from this new selection was inspected before
this protocol and selection were prepared; some records may overlap previously
exposed development material, so this is never called an untouched validation set.
