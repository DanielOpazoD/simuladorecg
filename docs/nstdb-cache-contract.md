# Verified NSTDB source reuse

Observed failure: the post-merge PR110 HR-quality job timed out fetching the
NSTDB1.0.0 manifest before evaluation. The identical PR gate and later main gate
passed. Repeating every public source download is an avoidable availability risk.

Reuse only the seven raw source files: the previously observed manifest (SHA256
b76bd98c5111439fcfff2f410afd70d64e79f072049c45b5a9916a3044fdb84f) and bw/ma/em
headers/data whose hashes that manifest declares. Never cache evaluations,
measurements, selected windows, product baselines or acceptance results.

A cache is untrusted input: validate all bytes before staging any file. Missing or
corrupt cache produces an explicit cold-acquisition report; it cannot bypass the
frozen reader. Newly acquired source must pass the same manifest check before
saving. Frozen acquisition/WFDB crosschecks, both temporal cohorts, all920 noise
cases, strict thresholds and every job timeout remain unchanged. No prefix cache
fallback. Cache restore/save errors alone must not suppress evaluation.

The common immutable key/path allows the noise and HR-quality workflows to reuse
public bytes. Save occurs after source acquisition, before existing raw-file
cleanup. This reduces downloads on verified hits; it does not establish a measured
end-to-end CI speedup. First runs and evicted caches still acquire official sources.

Local verification: eight adversarial/CLI integrity tests, two workflow guards
(red on unchanged main, green after the change), and1616 application tests plus
types/build pass. A real cold acquisition verified3,900,000 digital samples with
WFDB. The authenticated cache contains seven files totaling5,857,714 bytes. A warm
replay through the identical frozen reader with every network call forced to
throw succeeds and reproduces noise-segments.json byte-for-byte. These are local
results; GitHub cache service behavior still requires CI evidence.

Sources: https://physionet.org/content/nstdb/1.0.0/ and the official granular cache
actions at https://github.com/actions/cache/tree/v6.1.0 . No new package dependency.

A related CLI failure was reproduced while running the next fidelity check: a new
output directory masked the original error with an ENOENT while trying to write
its failure report. The evaluator now creates that directory first. An adversarial
CLI test uses a missing source tree and requires the original resolution failure
to be retained as JSON. No evaluation formula or threshold changes.
