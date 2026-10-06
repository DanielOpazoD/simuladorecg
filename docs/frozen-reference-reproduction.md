# Reproduce a frozen reference without freezing product development

The original LUDB workflow was written for an equality-only PR. It required the
entire current application to equal519267d3, then required current analyzer
bytes and all measurements to equal that historical analyzer. Re-running it after
later reviewed product changes failed before it could reproduce the reference.

The historical product, analyzer hashes, dependency graph, cohort protocol,
fixture identity, record count, contamination exclusions, measurement evaluator
and exact report comparison remain unchanged. The baseline is always evaluated
from its pinned Git worktree, never from today's application.

A new identity step first verifies every historical analyzer file. Corruption or
wrong checkout is an error. It then compares current analyzer files with that
manifest and records both commits and all differing file hashes. An identical
current analyzer still runs the original candidate evaluation and exact report
equality assertion. A changed analyzer is explicitly marked different; the old
equality-only experiment is inapplicable and no candidate measurements or
current-product accuracy are claimed. The workflow summary and archived identity
report state this limitation. The historical benchmark-preservation diff remains.

This workflow's success means frozen-reference reproduction, not that today's
analyzer equals or outperforms the baseline. Current analyzer evaluation remains
in the separate active LUDB, delineation, noise and measurement-quality workflows.
Their cohorts, thresholds and gates are not changed here. A future comparative
study must deliberately use an appropriate protocol rather than treating an old
source-identity failure as clinical regression or relabeling it successful.

Tests exercise identical, changed, missing and corrupt sources, malformed
manifests and the existing21 adversarial reference contracts. The CLI verifies
actual checkout identity in addition to file hashes. This is development-data
reproduction; it neither opens a holdout nor supplies clinical validation.
