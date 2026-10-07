# Do not invent a single axis for balanced opposing directions

An equal pair of antipodal directions has no unique global angular summary.
The previous circular-median tie choice could return a direction not represented
by either QRS population. Retain every per-beat direction and interval, but return
null for the global QRS/P/T summary of precisely balanced antipodal clusters.

The 1e-10-degree tolerance covers atan2/wrap roundoff only. This is not a clinical
axis-dispersion threshold, and it does not solve every possible nonunique angular
median. Ordinary summaries, unequal populations, true zero degrees and crossings
of the +/-180-degree boundary must remain unchanged.

Acceptance: independent alternating-polarity samples fail the old summary and
pass the new one, reversing beat order gives the same abstention, P-only/T-only
opposition remains isolated, and ordinary controls remain identical. Recheck
known native/reference regressions and noise gates. The external worker/export
and actual browser must retain null global axis with non-null beatwise axes.
No source morphology, detection threshold, interval or clinical validation claim
changes. Missing global direction does not mean absent electrical activity.
