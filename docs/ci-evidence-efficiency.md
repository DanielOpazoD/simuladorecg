# CI evidence transfer and duplicate browser work

Observed on workflow run37503961004 (PR105, 2026-10-06): the complete ECG evidence artifact is127,425,794bytes. The accessibility job previously downloaded that entire archive only to copy its dist directory. It did not consume the reports, source archive or screenshots. The complete artifact remains available with the same retention and contents.

Changes:
- Upload a small dist-only artifact named with the exact evaluated commit. The dependent job downloads that artifact directly into dist and verifies production identity before testing. No rebuild or cross-run fallback.
- Activation, diagnosis navigation and regional activation browser suites previously ran Chromium in verify and then Chromium/WebKit/Firefox in accessibility on the same bytes. Run each once in the three-engine job, retaining its two viewport sizes. No suite, engine or numerical contract is removed.
- Preserve the accessibility dependency on successful verify, all independent signal gates, the macOS job, and failure evidence. No continue-on-error and no looser timeouts.

Expected savings are one large redundant archive download and three duplicate Chromium suite executions. This is a structural reduction; actual elapsed-time improvement depends on runner and network conditions and must be measured after CI. It is not a claimed clinical validation or a promise of a specific speedup.

Workflow contracts check coverage, exact-build reuse, preserved numerical commands and evidence archive. See official action semantics: https://github.com/actions/upload-artifact and https://github.com/actions/download-artifact . Existing action versions are retained.
