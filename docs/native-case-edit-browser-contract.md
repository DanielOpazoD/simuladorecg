# Exercise case edits through the actual browser input

Postmerge run 37639549117 failed its Firefox/1440 navigation assertion:
“Edited case must not retain an unverified diagnosis tab”. The archived failure
capture still shows the original 72/min control and original sinus provenance,
not the intended 81/min edit. No page/console error was reported.

The driver assigned `.value` and dispatched a synthetic event on a resolved
element immediately after clicking a panel that replaces the controls. That
operation does not exercise native focus/keyboard interaction and may target a
detached control. The product's input handler changes case provenance and renders
the navigation synchronously; the artifact does not establish a product defect.
A detached-element/synchronization race is the working explanation, not a claim
that the original run proved its exact timing.

Replace the synthetic edit with nine native ArrowRight steps from the verified
72/min control. Re-resolve the locator, focus it, wait for its actual 81/min value,
and require a new worker request plus an 81/min exported custom case. Keep every
original navigation, diagnosis-retirement, provenance/history and restoration
assertion and all engines/viewports. No sleep, retry or timeout extension is added.

Capture the actual customized screen. The same test must pass on Chromium,
Firefox and WebKit at desktop/mobile widths, and the postmerge verification must
also complete. A passing repeated run alone does not explain the old failure;
this change strengthens the action and its postconditions without changing the
physiological model or relaxing the failed assertion.
