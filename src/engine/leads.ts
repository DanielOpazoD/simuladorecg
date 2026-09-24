import { LEADS, type Lead } from "./types";
export type Vec = [number, number, number];
/** Forward Dower: Frank X left, Y inferior, Z posterior. See docs/model.md. */
export const DOWER: Record<string, Vec> = {
  I: [0.632, -0.235, 0.059],
  II: [0.235, 1.066, -0.132],
  V1: [-0.515, 0.157, -0.917],
  V2: [0.044, 0.164, -1.387],
  V3: [0.882, 0.098, -1.277],
  V4: [1.213, 0.127, -0.601],
  V5: [1.125, 0.127, -0.086],
  V6: [0.831, 0.076, 0.23],
};
export const INDEPENDENT = [
  "I",
  "II",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
] as const;
export function dot(a: Vec, b: Vec) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function project(v: Vec): Record<Lead, number> {
  const out = {} as Record<Lead, number>;
  for (const l of INDEPENDENT) out[l] = dot(DOWER[l], v);
  return derive(out);
}
export function derive(o: Record<Lead, number>) {
  o.III = o.II - o.I;
  o.aVR = -(o.I + o.II) / 2;
  o.aVL = o.I - o.II / 2;
  o.aVF = o.II - o.I / 2;
  return o;
}
/** Set clinical frontal axis using I and II, accounting for Dower mixing with Z. */
export function frontal(axis: number, amp: number, z = 0): Vec {
  const a = (axis * Math.PI) / 180;
  const i = amp * Math.cos(a) - 0.059 * z;
  const ii = amp * Math.cos(a - Math.PI / 3) + 0.132 * z;
  const det = 0.632 * 1.066 + 0.235 * 0.235;
  return [(i * 1.066 + 0.235 * ii) / det, (0.632 * ii - 0.235 * i) / det, z];
}
export function axisFromLeads(i: number, ii: number) {
  return (Math.atan2((2 * ii - i) / Math.sqrt(3), i) * 180) / Math.PI;
}
export function makeArrays(n: number): Record<Lead, Float64Array> {
  return Object.fromEntries(
    LEADS.map((l) => [l, new Float64Array(n)]),
  ) as Record<Lead, Float64Array>;
}
