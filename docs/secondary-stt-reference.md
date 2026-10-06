# Secondary ST–T: evidence before promotion

This report extends the already exposed, patient-separated PTB-XL+ development
selection. It does not reacquire a new holdout or tune model coefficients. The
frozen reader still selects patients before downloading features. The report
verifies metadata identity, patient uniqueness, exclusion of every patient who
has any fold9/10 ECG, the feature cohort, the actual descriptor hash and units.

All selected records with a positive CLBBB, CRBBB or WPW likelihood are included.
Co-occurring labels remain visible as counts; they are not adjudicated diagnoses.
We do not quietly retain only apparently uncomplicated or good-looking tracings.
ST_Amp is STJ (not J60), T_Amp is signed, and QRS_AmpPP is peak-to-peak. Missing or
unverified values remain unavailable, never zero. No waveform rescaling is used.
Only aggregate numerical descriptions are published; no reports or demographics.

The current exposed selection has13 CLBBB,13 CRBBB and1 WPW patient. These are
small, mixed groups, not normal ranges. The single WPW record cannot establish a
population amplitude or accessory-pathway model. Generated features use synthetic
event windows; vendor measurements use another method. Juxtaposition is not a
paired clinical error, fidelity score, or proof that the generator is calibrated.

Sources:
- [PTB-XL+ published features](https://physionet.org/content/ptb-xl-plus/1.0.1/)
- [Primary study of depolarization and repolarization in118 maximally pre-excited patients](https://pubmed.ncbi.nlm.nih.gov/7942483/): direction depends on pathway; this is not a universal coefficient for our representative WPW template
- [Primary observations after accessory-pathway ablation](https://pubmed.ncbi.nlm.nih.gov/1960327/): repolarization changes can persist, so an instantaneous universal inverse-delta rule would omit cardiac memory

## Negative local ST experiment retained

Before this report, a new unpromoted isolated-LBBB candidate was tested against
current main using the same local Node24.19 runtime, unchanged920 exposed NSTDB
scenarios and sample-only analyzer. It added `-0.20 × integrated QRS reference`
with a12ms half-cosine onset ending at J and a half-cosine decay from T onset to
T end. It was limited to normal LBBB beats without overload, electrolyte changes
or primary ischemia. This was an engineering hypothesis, not fitted physiology.

Unlike the earlier post-J ramp, pooled detection improved in the exploratory
trial, but paired review still found deteriorations in detection and retained
measurement quality, including an additional false-usable HR in one noisy
stratum. Aggregate improvement does not erase subgroup harm. The candidate is
not promoted, and the production noise protocol, acceptance limits and frozen
baseline remain unchanged. ST-secondary synthesis is still an open fidelity debt.
A first cross-runtime comparison also changed the hyperkalemia sample hash;
comparison was therefore rerun with baseline and candidate on the same runtime,
not treated as an ST effect.

## Reproduction

The PTB-XL morphology workflow runs eight adversarial/CLI tests, then builds
`secondary-stt-reference.json` from the exact acquired sources and the current
synthetic morphology report. The report records every input hash and its own
script hash. CI preserves it with the existing licensed reference artifact.
The workflow removes raw metadata before upload. No claims are made from a CI
run until its artifact has actually been inspected.
