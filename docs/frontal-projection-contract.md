# Single immutable frontal projection

The forward transform already used the lead registry, but `frontal()` duplicated
its six coefficients in the inverse. The public registry, its nested coefficient
arrays and the copied `DOWER` table were mutable at runtime despite readonly
TypeScript declarations. A write could silently change subsequent projections.
No end-user corruption incident is claimed; this is a reproducible structural risk.

Both directions now use the same versioned coefficients. Registry records and
nested arrays are frozen, and DOWER shares those immutable arrays rather than
copying mutable calibration state. The inverse preserves the historical arithmetic
order, including signed coefficients, to avoid numerical sample drift. Coefficients,
units, source morphology, acquisition and physiological scope are unchanged.

Acceptance:
- Two predecessor tests fail: the containers are mutable and coefficient writes
  succeed. Mutation probes restore a vulnerable predecessor before assertion
- Candidate writes are rejected, including nested coefficients and lead metadata
- 3,025 combinations of axis, signed amplitude and Z preserve the historical
  inverse exactly and independently recover expected I/II projections. The
  1e-10-degree tolerance tests floating-point algebra, not clinical accuracy
- All 244 catalog/filter combinations (61 implemented presets × four filters)
  preserve every sample in every lead and all events exactly against main
  0246a47e253fc9b49daf5d47f80257d16e6d9db6

The Dower projection remains an approximate population transform, not individualized
thoracic anatomy. Structural immutability does not validate its clinical accuracy.
No new model or educational feature is introduced.

The existing exact-source revision registry records both old and new projection
hashes. Frozen historical analyzer builds restore the original projection files
alongside the original detector; no historical protocol/hash is overwritten.
Current builds are still assessed independently. Both original and calibration
LUDB cohorts (80 exposed records) retain exact numerical outputs and all statuses.
