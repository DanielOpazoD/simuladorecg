# Isolate the confidence-policy counterfactual

## Defect

Two validators described their comparison as a quality-only change, but loaded
an entire historical analyzer before PR120 and compared it with the current
analyzer. That comparison mixes the confidence rule with all subsequent
numerical fixes. A legitimate numerical correction can then be misattributed
to the confidence rule, and the report cannot isolate the rule's causal effect.

## Contract

Build the predecessor with the current source tree and exactly one substituted
file: the hash-verified historical alternating-confidence implementation.
Verify every other source byte is identical. Both versions analyze identical
samples. Keep the existing strict full numerical equality, evidence-support
identity, prohibition on promotions, and prohibition on invented abstentions.
No measurement field is exempted from comparison.

The independent historical QRS/T detector baseline, event matching, all 1712
synthetic scenarios, 80 exposed annotated records, noise gates and thresholds
remain unchanged. This policy-specific comparison does not replace those
numerical regression gates or claim the current analyzer is clinically correct.

Before integration, compare the reports with the prior validator on this
unchanged engine. They must have identical row outcomes and summary counts.
A substituted second file, modified historical policy, or numerical mutation
caused by the confidence rule must fail. No production or UI change is made.
