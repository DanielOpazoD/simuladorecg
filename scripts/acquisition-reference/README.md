# Exploratory acquisition texture comparison

This reproduces the descriptive comparison accompanying a **rejected** quiet-v1
experiment. It is not a clinical validation, a new independent patient holdout,
or an acceptance test. The frozen factor is 0.5 for the complete additive
acquisition floor. No parameter is fitted by these scripts. Production source
is not modified; `../lib/quiet-acquisition-experiment.mjs` injects the experiment
into an external bundle and refuses a changed acquisition source hash.

## Reproduce

Use the repository revision containing this experiment, Node with the project's
installed dependencies (`npm ci`), and Python 3.12 with a separate virtual
environment. Install the pinned dependencies with:

```sh
python -m pip install -r scripts/acquisition-reference/requirements.txt
```

Choose a **new folder outside the repository** for `OUT` (replace it in the
commands below with your path). All raw waveforms, generated samples, detailed
results and figures stay there. The scripts refuse to overwrite completed
reports; preserve failures and use another folder for a subsequent run.

```sh
python scripts/acquisition-reference/download.py --output OUT
node scripts/acquisition-reference/export.mjs --output OUT
python scripts/acquisition-reference/characterize.py --output OUT
```

The downloader retrieves only the frozen 40 files (about 2.4 MB) from the official
PhysioNet S3 mirror. Each file must match the size and SHA256 copied from the
official checksum list. It records failed attempts and preserves mismatched
bytes; it never substitutes another patient. Existing files are verified before
reuse. Dataset license: [CC BY 4.0, PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/).

The exporter generates the 12 preregistered reserve seeds in `protocol.json`
using sinus/NORM, plus seed 12066 explicitly labelled development. Each is
exported as historical resting-v1, experimental quiet-v1 and ideal acquisition
control. The 39 files contain 10 s at 500 Hz, 12 leads, interleaved little-endian
float32 in mV. Their hashes, cases and offline transformation provenance are
stored in `synthetic-reference-index.json`. The reserve is a seed reserve, not
independent patient evidence. A successful run does not accept quiet-v1.

For this external descriptive comparison, `withNaturalControls` is recalculated
for each seed. The engineering acceptance audit instead retains the preset's
natural controls and changes seed/filter. Only the predetermined seed list is
shared; the two synthetic cohorts must not be presented as identical cases.

After the verified numerical reproduction, provenance-only hardening added
complete bundled dependency hashes from the esbuild metafile, hashes for every
dynamically loaded model JSON, exporter/runtime provenance and a characterizer
self-hash. The preserved original numerical results were not changed. Future
runs include these additional fields, so report/index hashes will differ even
when all waveform bytes and measured values agree.

The characterizer verifies both real and synthetic hashes, WFDB sampling,
channels, gain units, duration and lead order. It uses the existing
`scripts/fidelity/{features,wfdb}.py` implementation; no external `wfdb` package
is needed. The output `reference-texture-report.json` includes every record and
lead, detected peaks, included and excluded windows and exclusion reasons.
`reference-legacy-quiet.png` is rendered with Matplotlib, independently of the
product renderer, at identical displayed gain and time scales.

## Frozen selection and exposure

`../../benchmarks/acquisition-cleanliness/reference-selection.json` is the
fixed metadata-only selection: 20 distinct adult patients, ten each in folds 9
and 10, NORM confidence 100 and SR, without listed quality flags. The manifest
records IDs, folds, original filenames, checksums, selection policy and hashes
of metadata and the historical exposure audit. Do not regenerate this selection
after examining signals or failures.

The historical inventory identified 611 exposed patients (605 PTB-XL and six
STAFF). The known 605 were excluded, but the membership of a repeatedly used
historical NORM600 cohort and executed shape/noise training remains incomplete.
These 20 patients may overlap unknown prior exposure. Their independence is
**not established**. Empty quality annotations do not prove artifact-free data.

## Measurement and limits

Original .hea/.dat files are retained unchanged. Both original real samples and
filter-off synthetic samples receive one declared 0.05 Hz causal high-pass
recurrence at 500 Hz. This is a common measurement operator, **not equivalence
of acquisition chains**: real recorder filtering is unknown and synthetic
internal antialias filtering remains. One second at each edge is excluded.

TP windows follow the existing heuristic: preceding detected energy peak plus
0.55 RR to the next peak minus max(0.25 RR, 220 ms), minimum 30 ms. They are not
independently annotated T/P boundaries. High-frequency metrics use a 25–249 Hz
Butterworth operator and samples inside these windows, rather than QRS windows.
Reported quantities include segment RMS, pooled RMS, absolute p99/max,
kurtosis, log-RMS dispersion, and STD/range of TP window medians. The latter can
retain physiological content and is not an isolated baseline-artifact measure.

The committed `reference-texture-summary.json` preserves the original measured
summary, including adverse findings. Historical I/II high-frequency texture is
already near this exploratory reference; reducing the floor makes those leads
substantially quieter. V2 high-frequency texture moves toward the reference,
while much of its TP level variation persists even under ideal acquisition.
These mixed results do not justify a blanket claim that all historical texture
was excessive, nor a clinical realism upgrade. The preregistered engineering
gates rejected the candidate; this descriptive exercise does not override them.

The figure is fixed to the first selected real record (673) and development
seed 12066, lead II, seconds 2–5. Records are not paired people. Only a constant
vertical median is subtracted for display. Quantitative summaries use all 20
real records and all 12 synthetic reserve seeds per profile; development is
excluded from the group summaries. No disease-family inference follows from
this NORM-only reference. Independent human clinical review remains absent.
