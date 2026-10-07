# Readable uncertainty in the external ECG viewer

Actual PR120 WebKit/390px evidence showed the rate and review status, but the
right-hand reason was clipped behind a 560px-wide table. Horizontal scrolling
was available, yet the safety-relevant explanation was not readable together
with its measurement without an additional gesture.

Only the five-row measurement summary now responds to its container width.
Below 560px it uses fixed columns, wrapping and reduced cell padding; it retains
native table display, visible column headers, explicit column scope, the original
font size, values, quality labels and full reason text. Beat-by-beat and manual
annotation tables retain their existing scrolling behavior. No waveform, units,
analysis, confidence rule or export data changes.

The existing real CSV/worker/export tests retain their desktop and 390px flows
and add 320px on Chromium, WebKit and Firefox. They check that all cells and text
fit the table/wrapper, native table semantics remain, headers have column scope,
values and exact source samples are unchanged, and original trace recovery still
works. Screenshots must be inspected before release; unit tests cannot establish
readability. Viewport emulation is not a physical-device or screen-reader audit.

Implementation follows the responsive-table guidance's semantic foundation and
container-based adaptation. It does not convert this small table to cards or hide
headers, so no generated labels, added ARIA roles or duplicated data are needed.
