import type { Beat, ECGCase } from "./types";
import type { Vec } from "./leads";

/** A source is not a diagnosis or a rhythm. These are illustrative activation
 * profiles, not anatomically calibrated lead fields. A PVC, VT or escape can
 * share a source; the automatic assignment only chooses a teaching example.
 */
export type VentricularSourceId =
  | "rv_apical_pacing"
  | "ventricular_escape"
  | "representative_pvc"
  | "representative_vt";
export type SourceKernel = { mu: number; sigma: number; v: Vec };
export interface VentricularSourceProfile {
  id: VentricularSourceId;
  label: string;
  axis: number;
  minimumQrsMs: number;
  kernels: readonly SourceKernel[];
  secondaryTZ: number;
  secondarySTZ: number;
}
// The pacing profile retains the historical kernels/axis bit for bit.
const apical: SourceKernel[] = [
  { mu: .14, sigma: .08, v: [.22, .12, .34] },
  { mu: .39, sigma: .13, v: [.9, .5, .54] },
  { mu: .69, sigma: .15, v: [1.03, .57, .59] },
  { mu: .88, sigma: .06, v: [.2, .04, .16] },
];
const profiles: Record<VentricularSourceId, VentricularSourceProfile> = {
  rv_apical_pacing: { id: "rv_apical_pacing", label: "ejemplo apical derecho", axis: -65,
    minimumQrsMs: 150, kernels: apical, secondaryTZ: -.15, secondarySTZ: -.035 },
  ventricular_escape: { id: "ventricular_escape", label: "escape: ejemplo anterior de eje izquierdo", axis: 20,
    minimumQrsMs: 150, secondaryTZ: .12, secondarySTZ: .025,
    kernels: [
      { mu: .12, sigma: .06, v: [-.08, -.02, .07] },
      { mu: .36, sigma: .13, v: [.66, .45, -.54] },
      { mu: .68, sigma: .15, v: [.65, .35, -.46] },
      { mu: .88, sigma: .06, v: [-.16, -.06, -.10] },
    ] },
  representative_pvc: { id: "representative_pvc", label: "ectopia: ejemplo tipo BRI y eje inferior", axis: 75,
    minimumQrsMs: 150, secondaryTZ: -.15, secondarySTZ: -.035,
    kernels: [
      { mu: .12, sigma: .07, v: [.18, .10, .33] },
      { mu: .36, sigma: .14, v: [.85, .52, .66] },
      { mu: .65, sigma: .15, v: [.78, .51, .58] },
      { mu: .87, sigma: .07, v: [.14, .03, .14] },
    ] },
  representative_vt: { id: "representative_vt", label: "TV: ejemplo anterior de eje superior", axis: -110,
    minimumQrsMs: 150, secondaryTZ: .15, secondarySTZ: .035,
    kernels: [
      { mu: .13, sigma: .07, v: [.12, .03, -.20] },
      { mu: .38, sigma: .14, v: [.78, .45, -.82] },
      { mu: .70, sigma: .14, v: [.61, .39, -.52] },
      { mu: .88, sigma: .06, v: [.12, .03, -.10] },
    ] },
};
// Freeze the nested reference data; qrsKernels clones it before applying controls.
for (const p of Object.values(profiles)) {
  for (const k of p.kernels) { Object.freeze(k.v); Object.freeze(k); }
  Object.freeze(p.kernels); Object.freeze(p);
}
export const VENTRICULAR_SOURCES = Object.freeze(profiles);
export const VENTRICULAR_SOURCE_IDS = Object.freeze(Object.keys(profiles) as VentricularSourceId[]);
export function ventricularSource(c: Pick<ECGCase, "rhythm" | "ventricularSource">, b: Pick<Beat, "kind">): VentricularSourceProfile | null {
  if (b.kind === "normal") return null;
  const requested = c.ventricularSource;
  if (requested && requested !== "auto") {
    if (!Object.hasOwn(profiles, requested)) throw new Error("Fuente ventricular no válida");
    return profiles[requested];
  }
  if (b.kind === "paced" || c.rhythm === "torsades") return profiles.rv_apical_pacing;
  if (b.kind === "pvc") return profiles.representative_pvc;
  return c.rhythm === "vt" ? profiles.representative_vt : profiles.ventricular_escape;
}
