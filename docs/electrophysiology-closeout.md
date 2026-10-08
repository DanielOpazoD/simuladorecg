# Electrophysiology closeout before functional and UX work

Baseline: `8f31167d3f7d0314ca6b1851efdeaffe6d3a551f` (PR153), tree `e3a903c9546f64c3e43299620f16ad430afeb5bf`. All 21 pre- and post-merge checks passed. This is technical regression evidence, not clinical validation.

## Fixed problem and intended learning

A P wave, T wave, stimulus or one limb of a wide QRS must not become a second ventricular activation. Removing such a false activation must preserve the actual QRS and its complete boundaries. Rate, intervals, confidence, displayed values, calipers and export must refer to the same selected population and time coordinates.

The source fixes already integrated for LPFB, secondary ST and WPW are protected. No new physiology, diagnostic claims, feature expansion or visual redesign is added during this closeout. Functional and aesthetic UX work follows the acceptance checkpoint.

## Frozen inventory

`benchmarks/closeout/baseline-screen.json` identifies the exact final PR153 evidence, all 2,476 configurations (2,396 admitted, 80 explicit rejections), and every positive raw engineering screen. Counts are 50 HR, 434 QRS and 33 QT flags, with 487 configurations in their union. These are **not** counts of visible UI errors or clinically adjudicated failures. In particular, legacy interval scores use midpoint matching; attribution must be checked against actual QRS support before assigning a cause. Keep the original scores and adverse cases even if a scoring defect is discovered.

The 50 raw HR errors were replayed through acquisition scope and model audit: all 50 values are withheld. Abstention does not resolve their detection mechanisms. Three use the already unsupported-for-automatic-measurement aggressive filter; the other 47 occur in off/diagnostic acquisitions. In the default catalog under off/diagnostic acquisition, the QRS screen flags junctional rhythm, VT and torsades (five configurations); it flags no default QT cases. Stress/transfer configurations remain in the ledger.

Every item is assigned to one of: waveform/source, candidate identity, numerical boundaries, confidence/audit, or evaluator/infrastructure. This is diagnosis, not permission to waive it. A failure cannot be relabelled out of scope after inspecting a candidate.

## Two integrated implementation blocks

1. **One ventricular-complex contract.** Consolidate the observed marker, complete support, component ownership and evidence used by detection, rate, delineation and confidence. Resolve reproduced P/QRS/T confusions and inconsistent ownership end to end. Avoid another sequence of local thresholds or branch-specific exceptions. No generator events, configured rhythm/rate or model truth enters sample analysis. Add no new dependency or abstraction unless an isolated comparison demonstrates its necessity.
2. **Repolarization and measurement coherence.** On the stabilized ventricular population, close reproduced ST/T/end-T/QT inconsistencies across numerical analysis, calipers, A/B, acquisition and export. Preserve exact unaffected waveforms and all prior adverse external results, including the failed initial terminal-QT comparison. Previously exposed records are regression data, not a fresh holdout.

A block is not ready merely because the aggregate error count falls. Its relevant identified causes and cross-stage failures must be closed. There is no promised PR quota or unverified completion date.

## Acceptance fixed before implementation

- Reproduce each targeted defect on this baseline and demonstrate genuine numerical/identity correction. A correct average rate with wrong beat identities fails. A warning-only change is not counted as correction.
- Preserve all true activations, measured windows, raw samples and downstream ownership; reject newly introduced false detections, omissions, phase substitutions or newly usable bad QRS/QT values under the existing tolerances.
- Preserve known-correct measurement availability. Report withdrawals separately from corrections. Intrinsically unsupported measurement must follow an explicit prior signal/acquisition criterion, never silent substitution from the model.
- Run focused causal and independent analytical controls while iterating. Require the complete 2,476-case, 304-regional, 540-secondary-ST, strict 920-noise and exposed real-record regressions before merge, together with the full unit/build and actual browser/export/rollback contracts.
- Preserve failed experiments and their source identities. New synthetic transfer parameters are frozen before inspection; they are not clinical validation. Separate development, technical verification and external validation.
- On the exact final head, inspect artifacts and real desktop/mobile browser views. Merge only with all required checks successful, then verify main and post-merge CI.

After the critical inventory has passed this acceptance checkpoint, freeze the engine for the functional/UX cycle. Any genuinely new physiological ambition belongs to a later, explicitly scoped cycle; it must not continually move this finish line.

## Independent algorithm references for the isolated comparison

- [Martínez et al., 2004: wavelet-based ECG delineation](https://pubmed.ncbi.nlm.nih.gov/15072211/): staged QRS detection/delineation followed by P/T delineation. Published results are not transferable accuracy claims for this simulator.
- [WFDB XQRS documentation](https://wfdb.readthedocs.io/en/latest/processing.html#qrs-detectors): an independently implemented bandpass/wavelet detector can help challenge the current candidate-selection assumptions.
- [PhysioNet ECGPUWAVE](https://physionet.org/content/ecgpuwave/1.3.4/): a separate reference implementation for waveform-limit processing. Do not copy or integrate software without checking its license and actual suitability.

## Development evidence (unpublished)

The first observation-contract refactor was numerically identical across all fields of 150 exposed measurements. A subsequent change makes accepted ventricular markers the active neighbors for delineation; discarded P/T landmarks are retained as historical evidence only. A causal negative-control test holds samples and accepted candidates fixed and inserts the measured T peaks into the discarded landmark list. Released PR153 changes QT/beat boundaries and loses one resolved T end; the candidate preserves the original measurement. This is a technical invariance test, not a claim of clinical waveform classification accuracy.

The initial 272-case development comparison passed the existing no-new-FP/FN/phase/usable-interval-error screens. It did **not** resolve the 50 raw HR failures. One aggressive-filter AIVR case lost HR usability when delineation became unavailable; its prior QRS values were already wrong (224 ms reported). This withdrawal is not a correction and remains explicit. These focused results do not substitute for the complete bank, real records, source gates or browser verification.

Independent development comparisons also rejected a direct XQRS replacement and simple fixed multilead bandpass detection: they introduced failures among the 61 diagnostic catalog defaults. These were exploratory comparisons on exposed cases, not preregistered external validation. Denoised hidden-component experiments were similarly rejected when they created extra ventricular detections. No such numerical detector experiment is in the current candidate.

### Full-bank rejection of the canonical-neighbor prototype

The initial focused pass above was insufficient. The complete 2,476-case comparison against PR153 rejected canonical-neighbor variant v4: both off/diagnostic WPW cases with QRS amplitude 0.5, T amplitude 0.8 and 60 bpm newly exposed wrong usable QRS (232 ms) and QT (498–500 ms). The variant also had five configurations with worse raw maximum QRS errors under review, including newly delineated beats. None of this was merged. Its six causal neighbor-invariance controls are research evidence of one property, not acceptance of the entire algorithm.

A narrower terminal-search-only experiment preserved QRS and rate results in 272 cases but yielded only one additional unresolved QT candidate; it did not close the identified mechanism and is not a release.

Further independent NeuroKit2 0.2.13 development comparisons retained every lead and method (neurokit, Pan–Tompkins, Hamilton, Engzee). Each introduced failures among diagnostic defaults. A subsequent exposed experiment with a 180 ms delay and a four-lead norm was also rejected as a replacement. No new runtime dependency was added.

A separate sample-domain bandwidth prototype removed some amplitude-driven false P/T detections but lost three genuine PVC activations in each of two recordings. Its apparently corrected average HR therefore failed the prior identity criterion and was rejected. Work now examines the complete observed deflection rather than treating a short leading slope as the whole complex. No thresholds or test tolerances were relaxed to accept any of these variants.
