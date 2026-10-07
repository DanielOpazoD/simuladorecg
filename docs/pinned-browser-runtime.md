# Reproducible browser-test environment

## Observed setup cost and toolchain drift

On 2026-10-07, postmerge run 37626744720, job 112810487268, browser-tooling
setup ran from 13:13:30 to 13:23:02 UTC. Its log reports 126 MB of OS packages
fetched in 8 minutes 50 seconds. Browser tests had not started during that wait;
they eventually passed. The same setup step also reported that its unlocked
`npm install --no-save --package-lock=false` changed seven existing packages.
A second interaction job in run 37627176400 experienced the same slow setup.

## Change

Use Microsoft's official Playwright 1.63.0 Noble image for the two jobs that
execute browsers (`verify-core` and the three `browser-contracts` groups).
Keep Node 22.16.0 and run as UID1001, without privileged, host-network or
host-IPC options. Explicit Bash preserves the existing shell-flow semantics.

Pin Playwright 1.63.0 in the ordinary dev-dependency lockfile. All existing
locked package entries remain identical; only playwright and playwright-core
are added. `npm ci` installs the runner deterministically. No second package
resolution mutates that environment and no per-run OS/browser installation is
performed. The development dependency is not imported by application code.

A preflight checks the installed release and executable availability of all
three engines. It does not download missing tools or continue on a mismatch.
Actual browser scripts still establish behavior. Preserve every script,
engine, viewport, immutable build identity, 15-minute budget and fail-closed
merge check. No retry, skipped test or relaxed pixel/clinical assertion is added.

The official [CI guide](https://playwright.dev/docs/ci#via-containers) documents
container jobs; the [Docker guide](https://playwright.dev/docs/docker) requires
matching the package and image versions. An image pull still needs the registry
and can fail; this is not a guarantee of zero infrastructure failures. Numerical
and UI acceptance still depends on the actual CI run and its archived evidence.

## Prospective acceptance

- Test lock/image version drift, missing preflight and attempted dependency mutation
- Require every existing numerical/browser gate on the exact candidate
- Verify source identity and all engine/viewport result sets, inspect real captures
- Measure setup and whole-workflow time separately; do not claim savings in advance
- Preserve all original package entries and all product samples
