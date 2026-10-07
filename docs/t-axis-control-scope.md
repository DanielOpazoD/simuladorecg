# T-axis control applicability

The existing explanation said secondary T follows QRS, yet the slider remained
interactive when its value had no effect. The UI now disables this native control
for source-driven/coupled directions, imposed overload direction, absent organized
T or zero T amplitude. For remaining primary-T cases it checks the actual vector
rule at two independent axes rather than duplicating cancellation factors in UI
code. This describes the implemented model, not clinically impossible conditions.

The stored value is preserved. Returning to a primary-T case or restoring amplitude
reactivates it without changing the selected value. Mixed sinus/ventricular ectopy
keeps the control available for the primary component. A nearby visible reason is
associated through aria-describedby. Both initial rendering and in-place amplitude
updates use the same state calculation; sliders are not replaced during input.

Verification requires:
- Known inactive cases preserve every lead sample when the requested T axis changes
- Primary and mixed cases actually change their waveform
- No case mutation, retention across muting/restoration and correct cancellation
  behavior with a potassium override
- Chromium desktop/mobile: coupled → primary, keyboard axis adjustment, amplitude
  Home/End, exact value restoration and a screenshot of the disabled control
- Existing production identity, worker, A/B export and cross-browser accessibility
  checks, plus the complete unit/type/build suite

No generator, acquisition, diagnostic measurement or model coefficient is changed.
Local browser execution is not part of the verification record; rendered checks
and screenshots are produced by the repository's existing CI browser workflow.

Actual first-pass CI screenshots showed that the custom range still looked active
despite its disabled semantics. The reviewed revision therefore adds a visibly
muted native disabled state and the explicit text “Control inactivo”; the associated
reason remains readable. Browser checks verify the computed inactive/active opacity
as well as interaction and value retention. This required a new exact-head CI run.
