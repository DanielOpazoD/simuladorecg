# Detector slopes without per-sample temporary arrays

The sample detector repeatedly allocated four-element arrays just to pass their
values to `Math.hypot`. The short/long derivative scans, energy slope and shape
acceleration now use explicit I, II, V1, V5 arguments in the **same order** and
with the **same arithmetic parentheses**. Channel references are local to each
call. No cache, dependency, new analysis API, threshold, window or source model
is introduced; covariance accumulation remains readable rather than unrolled.

## Measured benefit, bounded claim

Seven alternating warmed before/after blocks, each four passes over 18 exposed
synthetic cases (six presets at three rates), ran alone on local Node 24.19.
The median detector block decreased from 449.294 ms to 257.971 ms, 42.58%.
Every paired block improved, ranging from 37.24% to 46.09%. Checksums were equal.
This is one local microbenchmark, not app FPS, clinical accuracy, guaranteed CI
speedup or a power-consumption measurement. Timing is not a flaky CI assertion.

## Preservation evidence

The exact predecessor is main133, commit
`4e4daff0d6ee56b6146df0f858e3abb14c601a0d`, detector SHA-256
`9766068adbe3e0ce8b30f9f766c3708a8de8b3a3668215104c07a8f9cb4fb040`.
Candidate SHA-256:
`df93e6f7eec4f59464badb9191c9af2e0299e1678e2489bfd0f4fd306bd7140e`.

A paired pass compared all returned arrays, candidates, landmarks, thresholds
and filtered channels for 244 preset/filter sources with three detector options:
nominal 0.35 fraction, challenged 0.6, and disabled T rejection. All 732 results
were exactly equal, including 18 median-filter cases. Input samples were hashed
before and after and did not change. The 36 profile-fixture comparisons also match.

Small permanent tests independently calculate energy using an array-based
four-channel oracle at 100/250/500/1000 Hz, exercise the actual median branch,
and modify an existing input between calls to exclude stale-cache behavior.
A single-sample impulse at 250 Hz does not satisfy the unchanged >3.5 slope-ratio
screen because the rounded offsets give a ratio of two; the branch test uses
500/1000 Hz rather than assuming the screen fires at every sampling rate.

Existing annotated, native, source, noise and browser gates remain unchanged.
Historical detector bytes remain pinned; no report or numerical budget is reset.
