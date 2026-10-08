import { LEADS, LEAD_REGISTRY, INDEPENDENT, type Lead, type IndependentLead } from "./lead-registry";
export { INDEPENDENT } from "./lead-registry";
export type Vec = [number, number, number];
/** Forward Dower projection from the physical-channel registry. */
export const DOWER = Object.freeze(Object.fromEntries(INDEPENDENT.map(lead =>
  [lead, LEAD_REGISTRY[lead].projection],
))) as Readonly<Record<IndependentLead, Readonly<Vec>>>;
export function dot(a: Readonly<Vec>, b: Readonly<Vec>) {
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
  const first = DOWER.I, second = DOWER.II;
  const i = amp * Math.cos(a) - first[2] * z;
  const ii = amp * Math.cos(a - Math.PI / 3) + (-second[2]) * z;
  const det = first[0] * second[1] + (-first[1]) * second[0];
  return [(i * second[1] + (-first[1]) * ii) / det,
    (first[0] * ii - second[0] * i) / det, z];
}
export function axisFromLeads(i: number, ii: number) {
  return (Math.atan2((2 * ii - i) / Math.sqrt(3), i) * 180) / Math.PI;
}
export function makeArrays(n: number): Record<Lead, Float64Array> {
  return Object.fromEntries(
    LEADS.map((l) => [l, new Float64Array(n)]),
  ) as Record<Lead, Float64Array>;
}
