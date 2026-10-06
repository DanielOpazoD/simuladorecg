# Torsades: coherent projected ventricular frame

Defect: the existing illustrative torsades model moves QRS vectors through a time-varying projection but leaves the QRS-derived secondary T vector in the original frame. Thus the coupling implemented before projection is lost during synthesis.

Domain: the existing phenomenological torsades example. Apply its SAME linear time-varying transform to the secondary T contribution at the actual sample time. Preserve the historical QRS transform, event calendar, programmed QT, primary lesion contribution, acquisition, non-torsades samples and all reference-analysis primitives. This is a mathematical consistency repair, not a cellular/reentrant mechanism or validated TdP morphology.

Evidence boundary: El-Sherif et al. (1997), canine anthopleurin-A LQTS, mapped26 TdP episodes and linked changing surface QRS axis to changing three-dimensional activation patterns (https://pubmed.ncbi.nlm.nih.gov/9416909/). This supports activation-driven changing projection as a qualitative premise. It does NOT establish the current12-cycle sinusoidal transform, a universal T rotation law, human amplitude ranges or diagnostic accuracy. Those remain model assumptions. Retain that distinction in visible scope.

Prediction: QRS-only samples remain exactly equal; secondary T follows the existing time-varying frame. A separately constructed frozen-source predictor must reproduce the complete filtered12-lead signal at the existing1e-12 numerical tolerance. Every non-torsades preset remains unchanged. Lead identities and raw candidate uncertainty remain intact.

Refutation: changed QRS/event timing, modification of unrelated presets or primary lesion fields, unpredicted samples, hidden detector policy changes, or new falsely confident measurements. Do not bypass failures by fitting the detector to generated truth.

Acceptance: discriminative old-vs-new counterfactuals, full independent source prediction, original numerical/reference/noise gates, three-engine production screenshots and explicit phenomenological scope. No clinical validation is claimed from these checks.

Exposed development sweep (120/180/240 bpm × four acquisition filters): no newly usable rate with error above the existing5bpm engineering review threshold. At180bpm the candidate's raw error rises from approximately0.03 to2.66bpm and is now explicitly reviewed; at240bpm the earlier monitor-filter false-usable estimate around202bpm becomes a reviewed estimate around240bpm. These are synthetic development observations, not clinical sensitivity/specificity or an independent patient test. QT remains unavailable throughout. Preserve the adverse180bpm observation as well as the improvement.

The initial full-scope comparison correctly failed on the torsades samples. Its replacement is a separately computed matrix projection on immutable historical source, not a new snapshot. Existing1e-12 software-prediction tolerance is retained for the declared intervention; unrelated defaults and all QRS-only samples remain exact. Zero-vector testing accepts IEEE signed zero as zero; no product normalization was introduced.
