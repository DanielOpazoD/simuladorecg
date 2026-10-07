# Readable uncertainty in the external ECG viewer

Actual PR120 WebKit/390px evidence showed the rate and review status, but the
right-hand reason was clipped behind a 560px-wide table. Horizontal scrolling
was available, yet the safety-relevant explanation was not readable together
with its measurement without an additional gesture.

Only the five-row measurement summary now responds to its container width.
Below 560px it stacks each metric into a compact row card: label/value, status
and a full-width reason. Original table markup and explicit table/row/cell roles
retain relationships; visually clipped column headers remain accessible. Original
font size, values, quality labels and full reason text are preserved. Beat-by-beat and manual
annotation tables retain their existing scrolling behavior. No waveform, units,
analysis, confidence rule or export data changes.

The existing real CSV/worker/export tests retain their desktop and 390px flows
and add 320px on Chromium, WebKit and Firefox. They check that all cells and text
fit the table/wrapper, table roles and accessible column headers remain, headers have column scope,
values and exact source samples are unchanged, and original trace recovery still
works. Screenshots must be inspected before release; unit tests cannot establish
readability. Viewport emulation is not a physical-device or screen-reader audit.

The first fixed-column candidate passed overflow checks but visual review at
320px showed broken words and excessively narrow explanations. It was not merged.
The stacked refinement follows container-based responsive guidance, preserves
accessible headers and uses explicit roles because CSS display changes can affect
table semantics. No reason text, generated label or measurement is duplicated.
