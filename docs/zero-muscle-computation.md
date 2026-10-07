# Do not compute an artifact with zero amplitude

## Mechanism and contract

Each independent lead owns a fresh local pseudorandom stream used only by its
muscle-artifact process. The synthesizer formerly advanced that process at every
internal sample even when its output was multiplied by exactly zero. Skip only
that update when muscle amplitude is exactly zero. No threshold, shared cache,
seed change, resampling or approximation is introduced. Every nonzero amplitude,
including 1e-12, still follows the original process.

Other random mechanisms (sinus variability, AF and VF) use their own streams and
continue normally. All existing sample-addition arithmetic remains unchanged.
This is a runtime optimization, not improved physiological calibration.

## Evidence

Complete signals, events, truth and warnings compare exactly against the
predecessor across 244 preset/filter scenarios plus 192 configurations covering
sinus/AF/VF/VVI, four filters, three seeds (including zero), signed zero,
1e-12/.1/.5 muscle amplitudes, and simultaneous baseline/mains/loose artifacts.
Inputs remain unchanged. The equality assertion distinguishes signed zero.

Seven warmed alternating local timing pairs each generated six clean 10-second
cases four times. Median was 447.749 ms before and 351.689 ms after, a 21.45%
reduction on Node 24.19 in this run. Individual pairs improved 14.58–32.84%.
The prospective minimum material improvement was 10%. This is source generation
only, not app FPS, total CI duration, resource cost, or a clinical claim.

Unit checks verify zero unused variate calls for quiet asystole, nonzero tiny
artifact generation, deterministic reset after a zero-artifact run, and the
unchanged active branch's linear amplitude response. Existing frozen-source,
filter, noise and browser checks remain required and unchanged.
