# Secondary ST: complete source intervention

## Defect and domain

The secondary T followed abnormal ventricular activation, but its ST component
was absent. The new source represents secondary ST in LBBB, RBBB/IRBBB and the
regular ventricular/pacing examples, independently of primary injury and T gain.
WPW remains outside the secondary-repolarization model. Torsades retains its
previous polymorphic repolarization without adding a separate ST segment; it is
not used to teach ST measurement.

Direction follows the same mean-QRS or delayed-terminal-QRS reference as secondary
T. Gain is −0.20 times that weighted reference. A compact cubic smoothstep rises
through the last 40 ms before J, stays continuous at J, and returns during the
ascending half of T. Thus ST is nonzero at J and remains when T gain is zero;
QRS gain scales it. It does not extend the existing QT endpoint or move events.
These coefficients and supports are illustrative engineering choices, not a
patient-calibrated AP model, a diagnostic ST/QRS ratio or Sgarbossa validation.

Primary directional/mechanistic rationale: AHA/ACCF/HRS 2009 Part IV,
https://www.jacc.org/doi/10.1016/j.jacc.2008.12.014 . It does not validate these
coefficients. Primary injury remains a separate additive component.

## Whole-path checks

- Independent direction, gain, T-gain independence, C1/support and clock tests
- Real production browser export/control checks, including ST with T gain zero
- Full historical-source mathematical prediction, not a new universal snapshot
- A fixed 540-case paired source test: nine sources, five rates, three noise
  levels and four filters. It applies the real acquisition availability policy;
  off/diagnostic detection must not deteriorate. All other raw results remain
- The existing 1,712-case QRS matrix, 920-case noise protocol and 80-record
  external regression remain required; no clinical validation is claimed

Late ST intentionally overlaps the final activation window. Historical QRS-gain
checks therefore use a clearly labelled no-new-ST counterfactual. Full-ST samples
are independently predicted and checked separately. Regional depolarization-area
checks subtract the separately observed ST plateau/rise contribution rather than
loosening the 0.1-degree bound or pretending the added ST is QRS.

## Measurement defects exposed and repaired together

Derivative candidates can lie on the end of one PVC and the start of the next.
A continuous ST/T bridge made their raw slope windows look opposite, so the old
continuous-wave grouping could discard a true second PVC. Grouping now protects
well-separated, strongly matching local-apex waveforms. It retains the original
candidate positions and does not infer the rhythm or use generator events.

Threshold-sensitive rates also require review for sparse ambiguous candidates on
quiet recordings, and for near-halved trains of rank-one deflections. The screen
reuses the detector's existing directional feature, changes confidence only, and
preserves clean alternating-QRS examples. It never halves or replaces a rate.

## Explicit source-reference amendment and retained adverse evidence

The pre-ST product is `3c10eacd5fa4382d232c368777bd9d5f3b7f3475`.
The independent prediction is frozen at
`9246093052b3171cca81fb77951fd8eb24523a7c`, retaining that parent's analyzer.
The reference branch is not a product release. Future strict comparisons use
this declared source, with the original numerical tolerances, acquisition bytes,
scenario count and per-stratum checks unchanged.

The original pre-ST versus new-ST comparison is also mandatory and retained in
full. Its strict status is **fail**, not relabelled as a strict pass: adding ST
changes filter response and, at fixed SNR, the absolute injected-noise amplitude.
The reviewed migration separately requires no aggregate loss of true QRS, no
increase of false/missed QRS, no aggregate increase of falsely usable HR/QRS/QT,
and no unrelated-source deterioration. These are post-hoc bounds on exposed
correlated software cases, not clinical non-inferiority or a prospective result.

In the exposed 920-case source comparison, TP 9,868 → 9,873; FP 4,688 → 4,629;
FN 252 → 247. Raw falsely usable HR 29 → 29, QRS 160 → 159, QT 146 → 146.
Stratum tradeoffs remain visible. For example, one LBBB beat with electrode-motion
noise at 24 dB changed QRS error from 2 to 36 ms; the robust displayed QRS summary
was 164 ms before and after. The benchmark applies global status to beat errors,
not independently validated beatwise confidence. Monitor/aggressive availability
is applied by the product after the sample-analysis entry evaluated by that noise
benchmark. Neither aggregate gains nor acquisition warnings erase the raw errors.

An earlier 20 ms ST-rise candidate had less favorable measurement behavior and
was rejected. Cross-runtime raw hashes are not used as evidence of a changed
source: baseline and candidate must execute in the same runtime. All old reports
and preregistered protocols remain intact.
