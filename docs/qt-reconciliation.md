# QT: terminal-return reconciliation

## Actual numerical defect and correction

A visible T peak could remain without an endpoint when the vector envelope did
not return to its interpolated baseline. Conversely, slow recovery or an
intervening wave could close much too late. Merely exposing the peak or an area
marker left the automatic QT unchanged.

The delineator now compares its terminal return with the existing sample-only,
multilead area estimator. It fills a missing endpoint or shortens an endpoint
that disagrees by more than the return detector's 40 ms quiet span. It never
lengthens an existing endpoint toward a later area maximum, which can be U/P.
Missing endpoints cannot lengthen the established within-record QT center by
more than that span. No rhythm, diagnosis, model clock or configured QT enters
this decision. P/QRS locations, ventricular detection, axes and their confidence
are preserved.

Revised beat endpoints actually recompute QT, the record summary and all four
QTc formulas. The original endpoint, QT and tangent are retained in
`terminalRevision`, including exported external-analysis JSON. The old tangent
is cleared when its endpoint is replaced. The detail view shows the recalculated
number, its predecessor and the need for manual verification.

A changed numerical estimate does not establish accuracy. Reconciled summaries
require review, except a previously usable summary unchanged within one sample
may retain its existing state. This prevents an improved-looking median or
agreement between correlated leads from creating new clinical confidence.
Historical raw evidence remains available. This is an educational/exploratory
analyzer, not a validated clinical measuring device.

## Paired exposed development evidence

On the same 19 LUDB records with automatic QT before and after, mean absolute
error changed from 52.37 to 16.53 ms and maximum error from 207 to 59 ms.
There were 18 newly available record summaries (MAE 11.83 ms, maximum 32 ms).
Across all 80 exposed records, QT availability changed from 19 to 37; 43 still
have no automatic summary. Of the 37 outputs, 36 require review; one retains its
previous usable state within sampling resolution. These are correlated,
already-exposed software development results, not a prospective clinical claim.

Adverse cases are not omitted: calibration record 20 changed from −14 to −23 ms,
and record 49 from −16 to −18 ms. Some individual T-end errors remain much larger
than the record-median errors. Coverage and record summaries must not conceal
these beatwise tails or the remaining abstentions.

The existing strict 920-case noise comparison passes without changing its
reference or tolerances. A first conservative confidence variant unnecessarily
retired unchanged summaries; the final rule preserves their prior state only
within one sampling interval. Earlier direct trapezium, terminal-slope and
quadratic-tail prototypes worsened the exposed endpoint errors and were rejected.
An unrestricted late-end extension also lengthened hypokalemic QT into U and
was rejected. The final rule preserves that existing endpoint.

## Prospective check and reproducibility

`qt-reconciliation-prospective-protocol.json` freezes the algorithm/reader/evaluator
bytes and deterministic selection of 40 of the 72 remaining LUDB records before
acquisition. All 128 previously observed records, including the earlier exposed
holdout, are excluded. Targets and failures are retained; these new records must
not be used for retuning this candidate. Same-dataset prospective assessment is
still not independent clinical validation. Results will be recorded after the
frozen evaluation; this document does not presume they pass.

The new workflow checks sample integrity against PhysioNet checksums and WFDB,
keeps annotations outside the analyzer, compares identical inputs, verifies every
nonterminal invariant, and reports common-population error, new coverage and all
worsened records separately. Original protocols and historical reports are not
rewritten. Browser checks cover reviewed numeric output, the still-unclosed last
beat, changing leads, keyboard details and clearing the external view.

## References and limits

- LUDB 1.0.1: Kalyakulina et al. (2021), doi:10.13026/eegm-h675,
  https://physionet.org/content/ludb/1.0.1/ . Open Data Commons Attribution License
  v1.0. Original article: IEEE Access 2020, doi:10.1109/ACCESS.2020.3029211.
- Zhang et al. (2006), doi:10.1109/TBME.2006.884644: area-based T-end estimation
  motivates the existing indicator, not this fusion policy or its thresholds.
- Vázquez-Seisdedos et al. (2011), doi:10.1186/1475-925X-10-77,
  https://link.springer.com/article/10.1186/1475-925X-10-77 . A different trapezium
  method; its published performance cannot be transferred to this implementation.

The four-lead global reference is an explicit evaluator aggregation of separate
lead annotations, not a separately adjudicated global endpoint. Review status is
not a calibrated probability. Neither the source's configured QT nor the
absence of a software assertion establishes patient accuracy.

## Frozen v1 prospective outcome: failed

The first 40-record execution is retained in
[evidence/qt-reconciliation-v1-results.json](evidence/qt-reconciliation-v1-results.json)
and [workflow 37685303666](https://github.com/DanielOpazoD/simuladorecg/actions/runs/37685303666).
Same-population QT MAE improved from 74.3 to 36.6 ms on 10 records, but all available
outputs had MAE 27.8 ms, p95 144 ms and maximum 149 ms. These failed the frozen
25/60/100 ms targets. Availability increased from 10 to 20 of 39 reference-eligible
records; only the previously usable output retained that state. The v1 candidate
is not accepted for merge. Its algorithm, selection and targets remain frozen.
Any further candidate is a separate revision and cannot claim this cohort is unseen.
