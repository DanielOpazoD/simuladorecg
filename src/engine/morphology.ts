import type { ECGCase, Beat } from "./types";
import { frontal, project, axisFromLeads, type Vec } from "./leads";
export type Kernel = { mu: number; sigma: number; v: Vec };
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
export function qrsKernels(c: ECGCase, beat: Beat): Kernel[] {
  const ventricular =
    beat.kind === "pvc" || beat.kind === "ventricular" || beat.kind === "paced";
  const block = ventricular ? "lbbb" : c.conduction;
  let ks = (
    block === "lbbb"
      ? lbbb
      : block.includes("rbbb") || block === "irbbb"
        ? rbbb
        : normal
  ).map((k) => ({ ...k, v: [...k.v] as Vec }));
  if (!c.septalQ && block === "normal") ks = ks.slice(1);
  let sum: Vec = [0, 0, 0];
  for (const k of ks) for (let j = 0; j < 3; j++) sum[j] += k.v[j] * k.sigma;
  const p = project(sum),
    baseAxis = axisFromLeads(p.I, p.II);
  let target = c.axis;
  if (ventricular) target = -65;
  const rotation = ((target - baseAxis) * Math.PI) / 180;
  if (block.includes("rbbb") || block === "irbbb") {
    const net = project(sum),
      amp = Math.hypot(net.I, (2 * net.II - net.I) / Math.sqrt(3)),
      desired = frontal(target, amp, sum[2]);
    for (let j = 0; j < 2; j++)
      ks[1].v[j] += (desired[j] - sum[j]) / ks[1].sigma;
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
      k.v[j] *= c.qrsAmp * (c.electrolyte === "lowvoltage" ? 0.38 : 1);
  }
  if (c.overload === "rv_chronic" || c.overload === "rv_acute") {
    ks.push({
      mu: 0.6,
      sigma: 0.15,
      v: [-0.12, 0.08, -0.7 * (c.overload === "rv_acute" ? 0.55 : 1)],
    });
  }
  if (c.overload === "lv")
    for (const k of ks) for (let j = 0; j < 3; j++) k.v[j] *= 1.8;
  return ks;
}
export function qrsDuration(c: ECGCase, b: Beat) {
  if (b.kind === "pvc" || b.kind === "ventricular" || b.kind === "paced")
    return Math.max(150, c.qrs) / 1000;
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
export function tVector(c: ECGCase, b: Beat): Vec {
  if (c.tAmp === 0) return [0, 0, 0];
  const tScale = c.tAmp / T_REFERENCE_AMPLITUDE,
    // The phase effect reaches its existing reference shape at st=2.
    // Higher intensity continues to scale ST, without amplifying this global T effect.
    phaseBlend = Math.min(1, Math.max(0, c.st / 2));
  let v = frontal(c.tAxis, T_REFERENCE_AMPLITUDE, -0.07),
    amp = 1;
  if (!regionalTerritory(c, b) && c.phase === "hyperacute" && c.ischemia !== "none")
    amp = 1 + 1.15 * phaseBlend;
  if (!regionalTerritory(c, b) && c.phase === "evolving" && c.ischemia !== "none") amp = 1 - 2 * phaseBlend;
  const ventricular = b.kind !== "normal";
  if (c.conduction === "lbbb" || ventricular)
    v = frontal(
      (ventricular ? -65 : c.axis) + 180,
      T_REFERENCE_AMPLITUDE * 0.9,
      -0.15,
    );
  if (
    !ventricular &&
    (c.conduction.includes("rbbb") || c.conduction === "irbbb")
  )
    v = [0.18, 0.12, 0.27];
  if (
    !ventricular &&
    (c.overload === "rv_chronic" || c.overload === "rv_acute")
  )
    v = [0.12, 0.04, 0.42];
  if (!ventricular && c.overload === "lv") v = [-0.3, -0.08, 0.15];
  if (c.electrolyte === "hyperkalemia") amp = 2.6;
  if (c.electrolyte === "hypokalemia") amp = 0.4;
  return v.map((x) => x * tScale * amp) as Vec;
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
