# Allocation-free impulse derivatives

## Contract

`suppressImpulses` created two temporary four-element arrays per sample for
short and long derivative magnitudes, plus arrays when locating each impulse.
Replace only those `map`/spread operations with the same four scalar arguments.
Keep arithmetic grouping, argument order, masks, thresholds, copied channels,
pass-through identity and input preservation. No cache or shared mutable state.

This optimization changes neither the physiological source nor impulse
classification. The suppressed copy remains an analysis-only approximation;
visible and exported samples stay original. It does not reconstruct hidden
activation or make an impulse-dominated tracing clinically interpretable.

## Paired evidence

260 cases compare the complete predecessor and candidate results exactly:
244 existing preset/filter combinations and 16 artificial-impulse fixtures
covering 100/250/500/1000 Hz, positive/negative impulses, Float32/Float64 inputs.
Masks, all sample arrays, pass-through identity, copied/shared-channel identity,
and original inputs match. Low-rate sampling limitations are preserved rather
than silently changing the detector threshold.

Seven warmed, alternating local timing pairs each process 18 scenarios four
times. Median preprocessing time: 158.623 ms before, 55.298 ms after, a 65.14%
reduction in this Node 24.19 run. The prospective material-benefit criterion was
10%. This measures preprocessing, not browser FPS, whole-app or CI speed, cost,
or clinical accuracy. No timing assertion is added to CI.

Permanent tests exercise quiet signals, exact masks, unchanged unmasked
samples, copy-on-write semantics, both impulse signs and changed input objects.
The exact source revision is registered alongside the analyzer, and historical
comparisons restore its historical bytes too. Full pipeline checks remain
required; no acceptance budget or clinical threshold is changed.
