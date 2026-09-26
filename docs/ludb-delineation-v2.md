# LUDB P/QRS/T delineation v2 — calibration protocol

## Purpose

This PR creates the measurement layer required before changing the ECG Lab delineator.
The immutable product baseline is `519267d3b595a27ea8d35a5eae6296c780b58ec4`.
No file under `src/engine` is intentionally changed in this first stage.

The benchmark evaluates the real sample-only worker entry, `analyzeSamples({fs, leads})`,
against source annotations that are never passed to the analyzer. It measures P, QRS and
T event detection, waveform boundaries, interval summaries and the analyzer's own
`usable/review/unavailable` states.

## Prospective split before inspection

Two new sets of 40 LUDB 1.0.1 records were selected by SHA-256 ordering before their
signals or annotations were inspected. All 48 records previously used by ECG Lab
(8 historical fixtures plus the 40-record PR17 expansion) are excluded.

- **Calibration (40):** downloaded by this PR. After the first run it becomes observed
  engineering data and may be used to design delineator v2.
- **Reserved holdout (40):** IDs are fixed in the protocol, but this workflow refuses
  to download them. They remain untouched until a candidate algorithm and acceptance
  policy are frozen in a later PR.

Selection is deterministic and tested from the published seeds. There is no replacement
of difficult records.

## Reference construction

LUDB annotates each lead independently. ECG Lab's analyzer uses I, II, V1 and V5, so the
evaluation constructs a four-lead reference for each wave type separately:

1. lead II anchors a P, QRS or T peak;
2. nearest unused same-wave peaks in I, V1 and V5 must fall within 150 ms;
3. incomplete four-lead groups are counted and excluded from the aggregate event list;
4. aggregate peak = median of four peaks;
5. aggregate onset = earliest onset only if all four source onsets exist;
6. aggregate offset = latest offset only if all four source offsets exist.

This is an **evaluation construct**, not an original human global LUDB annotation.

Missing source boundaries remain null. They are never copied from a neighbouring wave,
inferred from another lead, or inferred from the ECG samples.

## Endpoints

For P, QRS and T separately the report includes:

- TP / FP / FN, sensitivity and PPV of peak events;
- onset, peak, offset and duration: n, bias, MAE, median absolute error, p95 and maximum;
- explicit reference denominator and coverage of eligible endpoints;
- incomplete four-lead reference groups.

The current baseline does not expose P offset or T onset. The benchmark therefore
expects their candidate coverage to be absent rather than manufacturing values. That
deficit becomes directly measurable before v2 is designed.

For PR, QRS and QT, the report also compares each record's analyzer summary with a
descriptive median derived from aggregate annotations. P is associated as the latest P
peak 20–450 ms before QRS; T as the earliest T peak 40–800 ms after QRS and before the
next QRS minus 20 ms. This rule is fixed prospectively and uses no diagnosis. It can be
ambiguous in AV dissociation or overlapping waves, so these interval results are
engineering evidence, not clinical adjudication.

## Paired architecture

The CI evaluates twice with the **same downloaded samples, reader, evaluator and
protocol**:

1. immutable baseline at `519267d3`;
2. the candidate commit.

A third artifact contains descriptive candidate-minus-baseline deltas. There is no
automatic winner or hidden threshold in this stage. Later delineator changes can use
the same calibration workflow without regenerating the baseline.

## Data integrity

The preparation step reuses the strict LUDB reader and checks every physical sample and
annotation event against `wfdb==4.3.1`. Source checksums remain enforced. Unassigned
boundary markers are preserved for audit. Raw header comments/demographics are not
archived.

The reserved holdout is blocked by `holdoutEnabled: false`; the preparation script
fails if that flag is changed in this calibration stage.

## Commands

```sh
python -m pip install wfdb==4.3.1
python scripts/prepare-ludb-delineation.py --output .sites-runtime/ludb-delineation --crosscheck

node scripts/validate-ludb-delineation.mjs \
  --fixtures .sites-runtime/ludb-delineation/fixtures \
  --source-root . \
  --commit "$(git rev-parse HEAD)" \
  --role candidate \
  --output .sites-runtime/ludb-delineation/candidate.json
```

## Interpretation

A green workflow means selection, acquisition, integrity, execution and reporting are
reproducible. It does **not** mean clinical validation. The calibration set is not a
representative population, waves within one ECG are correlated, and the four-lead
aggregate is specific to this analyzer.

The next implementation step is determined by the baseline report. Candidate changes
must preserve the existing ST/T/QRS/noise contracts while improving delineation on the
calibration data. Only after the candidate and acceptance thresholds are frozen should
the reserved holdout be enabled once.
