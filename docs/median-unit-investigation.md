# Median waveform calibration investigation

Defect: literal WFDB decoding agrees between our parser and wfdb4.3.1, yet the
12SL median waveform amplitude is roughly1000 times the independently harmonized
12SL QRS feature table. Agreement between parsers does not establish correct
physical source metadata. The existing reader and quarantine must remain intact
until a separately documented interpretation is supported.

Investigate source gain/baseline/units, record identity, sample window definition,
release manifests, publisher documentation and an independent calibrated source.
Do not infer a conversion from one patient's expected-looking ECG or normalize
leads independently. Preserve raw bytes and every contradictory claim. Never
label a guessed scale verified or overwrite the original header silently.

Acceptance: explicit source/version provenance and unit contract, adversarial
wrong-gain/unit tests, amplitude checks across patients and leads without using
the ECG generator as truth, and clear scope of any corrective adapter. If the
unit conflict cannot be resolved, retain quarantine and explain what remains.

Initial evidence: verified12667 header has WFDB32, auto-scaled gains and explicit
mV units; copies retrieved from1.0.0 and1.0.1 are byte-identical. The publication
page describes16-bit medians at1microvolt/LSB, which does not by itself certify
these32-bit headers. No correction is implemented at this stage.

## Safe development reference route

Use the corresponding original PTB-XL1.0.3 recordings for the SAME64 preregistered
ECG IDs. Recompute the frozen metadata selection and verify the release manifest,
record identity, 500Hz/5000-sample dimensions, WFDB16 format and explicit1000counts/mV
zero-baseline calibration. Decode with the unchanged source reader and independently
cross-check every physical sample with WFDB4.3.1. Reject missing/invalid samples;
never normalize amplitude or silently apply a conversion.

Preserve the 12SL unit conflict and quarantine. Compare whole10s original ranges
with whole1.2s vendor-median ranges only as a unit-conflict diagnostic. These are
different measurements, so their ratio is NOT a correction factor, normal range,
QRS-amplitude validation or evidence of exact morphology agreement. Original data
remain exposed development references; this does not create an independent holdout.
No demographic or clinical report metadata is exported with the waveform artifacts.

Source: Wagner et al., PTB-XL1.0.3, https://physionet.org/content/ptb-xl/1.0.3/
and https://doi.org/10.1038/s41597-020-0495-6 . Retain source LICENSE supplied by
the frozen acquisition. No new data source account or patient contact is involved.

Observed run: all64 original records passed release hashes, declared unit domain
and exact WFDB cross-check (3,840,000 physical samples). The frozen acquisition
contains61 corresponding medians, so732 of768 lead comparisons are available.
Literal median/original whole-range ratio has median842.72 (5th–95th506.45–935.99),
consistent with a major scale conflict but NOT a justified842.72 or1000 correction:
whole10s waveforms and median complexes have different amplitude statistics.
The previously inspected12667 original data hash is now release-verified:
acc3015649b88af5a9e419ad74b2e7d552a96814ea26700a7ac92bef4f3b5b70.

An initial combined Python invocation incorrectly ran the frozen product-fingerprint
test against today's product. It correctly failed. The original36 acquisition tests
pass against their actual immutable b783fbae source; the five new current-reader
contracts run separately. No frozen assertion or baseline was changed.
