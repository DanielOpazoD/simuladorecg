import { kernelWeight, regionalRbbbKernels, regionalWindow, usesRegionalActivation, type RegionalSupport } from "./regional-activation";
import type { ECGCase, Beat } from "./types";
import { ventricularSource } from "./ventricular-source";
import { secondaryRepolarization } from "./secondary-repolarization";
import { frontal, project, axisFromLeads, type Vec } from "./leads";
export type Kernel = { mu: number; sigma: number; v: Vec; regional?: RegionalSupport };
/** Reference amplitude for the existing T templates, in mV. */
import { regionalTerritory, T_REFERENCE_AMPLITUDE } from "./regional-repolarization";
export { T_REFERENCE_AMPLITUDE } from "./regional-repolarization";
const normal: Kernel[] = [
  { mu: 0.12, sigma: 0.052, v: [-0.12, -0.04, -0.11] },
  { mu: 0.28, sigma: 0.07, v: [-0.035, 0.02, -0.065] },
  { mu: 0.49, sigma: 0.12, v: [0.92, 0.62, 0.45] },
  { mu: 0.81, sigma: 0.1, v: [0.025, -0.1, 0.1] },
];
const rbbb: Kernel[] = [
  { mu: 0.075, sigma: 0.035, v: [-0.12, -0.04, -0.11] },
  { mu: 0.32, sigma: 0.082, v: [0.92, 0.62, 0.45] },
  { mu: 0.51, sigma: 0.067, v: [0.025, -0.1, 0.1] },
  { mu: 0.76, sigma: 0.115, v: [-0.48, -0.02, -0.58] },
];
const lbbb: Kernel[] = [
  { mu: 0.14, sigma: 0.08, v: [0.22, 0.12, 0.34] },
  { mu: 0.39, sigma: 0.13, v: [0.9, 0.5, 0.54] },
  { mu: 0.69, sigma: 0.15, v: [1.03, 0.57, 0.59] },
  { mu: 0.88, sigma: 0.06, v: [0.2, 0.04, 0.16] },
];
export function gaussian(u: number, mu: number, sigma: number) {
  return Math.exp(-0.5 * ((u - mu) / sigma) ** 2);
}
export function compact(u: number) {
  if (u <= 0 || u >= 1) return 0;
  return Math.min(1, u / 0.035, (1 - u) / 0.035);
}
export function bump(u: number) {
  if (u <= 0 || u >= 1) return 0;
  const g = Math.exp(-0.5 * ((u - 0.5) / 0.18) ** 2);
  return (
    (g - Math.exp(-0.5 * (0.5 / 0.18) ** 2)) /
    (1 - Math.exp(-0.5 * (0.5 / 0.18) ** 2))
  );
}
/** Existing QRS gain and low-voltage factor, shared by vector and local components. */
export function qrsAmplitudeScale(c: Pick<ECGCase, "qrsAmp" | "electrolyte">): number {
  return c.qrsAmp * (c.electrolyte === "lowvoltage" ? 0.38 : 1);
}
/** Illustrative delta pulse with explicit compact support; beat eligibility is owned by the caller.
 * Keep arithmetic order identical to the synthesizer; this is not an accessory-pathway model.
 */
export const WPW_DELTA_SECONDS = 0.045;
export function wpwDeltaVector(c: ECGCase, phase: number): Vec {
  if (phase <= 0 || phase >= 1) return [0, 0, 0];
  const v = frontal(c.axis, 0.25, 0.03),
    gain = qrsAmplitudeScale(c) * Math.sin(Math.PI * phase);
  return [v[0] * gain, v[1] * gain, v[2] * gain];
}
export function qrsKernels(c: ECGCase, beat: Beat): Kernel[] {
  const source = ventricularSource(c, beat);
  const block = source ? "source" : c.conduction;
  let ks: Kernel[] = (
    source ? source.kernels : block === "lbbb"
      ? lbbb
      : block.includes("rbbb") || block === "irbbb"
        ? rbbb
        : normal
  ).map((k) => ({ ...k, v: [...k.v] as Vec }));
  if (usesRegionalActivation(c, beat)) ks = regionalRbbbKernels(ks, c.qrs);
  if (!c.septalQ && block === "normal") ks = ks.slice(1);
  let sum: Vec = [0, 0, 0];
  for (const k of ks) for (let j = 0; j < 3; j++) sum[j] += k.v[j] * kernelWeight(k);
  const p = project(sum),
    baseAxis = axisFromLeads(p.I, p.II);
  let target = c.axis;
  if (source) target = source.axis;
  const rotation = ((target - baseAxis) * Math.PI) / 180;
  if (block.includes("rbbb") || block === "irbbb") {
    const net = project(sum),
      amp = Math.hypot(net.I, (2 * net.II - net.I) / Math.sqrt(3)),
      desired = frontal(target, amp, sum[2]);
    for (let j = 0; j < 2; j++)
      ks[1].v[j] += (desired[j] - sum[j]) / kernelWeight(ks[1]);
  }
  for (const k of ks) {
    if (!block.includes("rbbb") && block !== "irbbb") {
      const pr = project(k.v);
      const a = (axisFromLeads(pr.I, pr.II) * Math.PI) / 180 + rotation;
      const amp = Math.hypot(pr.I, (2 * pr.II - pr.I) / Math.sqrt(3));
      k.v = frontal((a * 180) / Math.PI, amp, k.v[2]);
    }
    k.v[2] += c.transition * 0.23 * Math.hypot(k.v[0], k.v[1]);
    for (let j = 0; j < 3; j++)
      k.v[j] *= qrsAmplitudeScale(c);
  }
  if (c.overload === "rv_chronic" || c.overload === "rv_acute") {
    ks.push({
      mu: 0.6,
      sigma: 0.15,
      // This appended QRS component shares the gain/attenuation of the main kernels.
      v: [-0.12, 0.08, -0.7 * (c.overload === "rv_acute" ? 0.55 : 1)]
        .map((v) => v * qrsAmplitudeScale(c)) as Vec,
    });
  }
  if (c.overload === "lv")
    for (const k of ks) for (let j = 0; j < 3; j++) k.v[j] *= 1.8;

  // Transition and overload are applied after the initial axis alignment. Close
  // that small drift so the final integrated QRS, not an intermediate vector,
  // honors the requested/source frontal axis.
  sum = [0, 0, 0];
  for (const k of ks) for (let j = 0; j < 3; j++) sum[j] += k.v[j] * kernelWeight(k);
  const finalProjection = project(sum),
    finalAxis = axisFromLeads(finalProjection.I, finalProjection.II),
    finalRotation = target - finalAxis;
  if (Math.abs(finalRotation) > 1e-10) {
    for (const k of ks) {
      const pr = project(k.v),
        a = axisFromLeads(pr.I, pr.II) + finalRotation,
        amp = Math.hypot(pr.I, (2 * pr.II - pr.I) / Math.sqrt(3));
      k.v = frontal(a, amp, k.v[2]);
    }
  }
  // In the combined source retain the established main/terminal RV bases.
  // Redistribute early LV direction against the intermediate basis so the
  // integrated axis, delayed RV activity and secondary T reference stay intact.
  if (block === "lpfb" || block === "rbbb_lpfb") {
    const previous = ks[0].v;
    const pr = project(previous);
    const amplitude = Math.hypot(pr.I, (2 * pr.II - pr.I) / Math.sqrt(3));
    ks[0].v = frontal(-60, amplitude, previous[2]);
    for (let j = 0; j < 3; j++) ks[2].v[j] +=
      (previous[j] - ks[0].v[j]) * kernelWeight(ks[0]) / kernelWeight(ks[2]);
  }
  return ks;
}
/** Shared shape evaluation; the legacy arithmetic remains bit-for-bit intact. */
export function qrsKernelValue(k: Kernel, u: number): number {
  return gaussian(u, k.mu, k.sigma) * (k.regional ? regionalWindow(u, k.regional) : compact(u));
}
export function qrsDuration(c: ECGCase, b: Beat) {
  const source = ventricularSource(c, b);
  if (source) return Math.max(source.minimumQrsMs, c.qrs) / 1000;
  return c.qrs / 1000;
}

/** Which repolarization components the lesion intensity control can change.
 * QRS morphology (including the posterior R correction) is independent.
 */
export function lesionControlEffect(
  c: Pick<ECGCase, "ischemia" | "phase">,
): "none" | "st" | "t" | "st-t" {
  if (c.ischemia === "none" || c.phase === "chronic") return "none";
  if (c.ischemia === "wellens_a" || c.ischemia === "wellens_b") return "t";
  if (
    c.ischemia === "de_winter" ||
    c.phase === "hyperacute" ||
    c.phase === "evolving"
  )
    return "st-t";
  return "st";
}

export function lesionVector(c: ECGCase): Vec {
  const map: Partial<Record<ECGCase["ischemia"], Vec>> = {
    inferior_rca: [-0.1, 0.18, -0.02],
    inferior_lcx: [0.12, 0.2, 0.02],
    anterior: [0.06, 0.025, -0.29],
    lateral: [0.28, -0.015, -0.01],
    posterior: [-0.04, 0.01, 0.25],
    rv: [-0.13, 0.11, -0.22],
    diffuse: [-0.2, -0.19, 0.08],
    subendo: [-0.1, -0.12, 0.1],
    pericarditis: [0.18, 0.18, -0.14],
    sgarbossa: [0.22, 0.05, -0.07],
  };
  const v = map[c.ischemia] || [0, 0, 0];
  const factor =
    (c.st / 2) *
    (c.phase === "hyperacute"
      ? 0.35
      : c.phase === "evolving"
        ? 0.35
        : c.phase === "chronic"
          ? 0
          : 1);
  return v.map((n) => n * factor) as Vec;
}
/** Final T vector: choose the activation direction once, then apply modifiers.
 * Overload already changes coupled QRS kernels; do not add a second strain T.
 * Constants are existing educational factors, not serum-K or ischemia calibration.
 */
export function tVector(c: ECGCase, b: Beat, kernels?: readonly Kernel[]): Vec {
  if (c.tAmp === 0) return [0, 0, 0];
  const tScale = c.tAmp / T_REFERENCE_AMPLITUDE,
    phaseBlend = Math.min(1, Math.max(0, c.st / 2)),
    coupled = secondaryRepolarization(c, b, kernels ?? qrsKernels(c, b)).t;
  // T remains in the source frame here; synthesis projects it with the torsades QRS frame.
  if (c.rhythm === "torsades" && coupled)
    return coupled.map(x => x * tScale) as Vec;
  const potassium = c.electrolyte === "hyperkalemia" || c.electrolyte === "hypokalemia",
    activePhase = c.ischemia !== "none" && phaseBlend > 0 &&
      (c.phase === "hyperacute" || c.phase === "evolving");
  if (coupled && potassium && activePhase)
    throw new Error("Combinación fuera de alcance: T secundaria con fase isquémica activa y alteración de potasio simultáneas. Evalúa cada modificador por separado.");
  let v: Vec = coupled ?? frontal(c.tAxis, T_REFERENCE_AMPLITUDE, -0.07), amp = 1;
  if (!regionalTerritory(c, b) && c.phase === "hyperacute" && c.ischemia !== "none")
    amp = 1 + 1.15 * phaseBlend;
  if (!regionalTerritory(c, b) && c.phase === "evolving" && c.ischemia !== "none")
    amp = 1 - 2 * phaseBlend;
  if (!coupled) {
    if (c.overload === "rv_chronic" || c.overload === "rv_acute") v = [0.12, 0.04, 0.42];
    if (c.overload === "lv") v = [-0.3, -0.08, 0.15];
  }
  if (c.electrolyte === "hyperkalemia") amp = 2.6;
  if (c.electrolyte === "hypokalemia") amp = 0.4;
  return v.map(x => x * tScale * amp) as Vec;
}

/** Two overlapping atrial components give V1 early anterior / late posterior activity.
 * Their frontal directions remain aligned with the requested P axis.
 */
export function atrialVector(c: ECGCase, u: number): Vec {
  const right = bump(u / 0.76),
    left = bump((u - 0.24) / 0.76);
  const normalization = 1 / bump(0.5 / 0.76);
  const amplitude = c.pAmp * (0.5 * right + 0.5 * left) * normalization;
  return frontal(c.pAxis, amplitude, c.pAmp * (-0.58 * right) * normalization);
}
/** Smooth asymmetric repolarization: slower rise, faster terminal return. */
export function tWave(u: number, peaked = false): number {
  if (u <= 0 || u >= 1) return 0;
  const apex = peaked ? 0.5 : 0.62;
  const value =
    u < apex
      ? (1 - Math.cos((Math.PI * u) / apex)) / 2
      : (1 + Math.cos((Math.PI * (u - apex)) / (1 - apex))) / 2;
  return peaked ? value ** 1.6 : value;
}
