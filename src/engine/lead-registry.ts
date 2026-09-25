/** Physical channels only. Display order/sign never changes stored samples.
 * Dower coefficients and iteration order are unchanged from v1.4.0.
 * The four augmented/derived limb channels are computed in leads.ts.
 */
export const LEAD_REGISTRY = {
  I:   { group: "limb", source: "independent", projection: [0.632, -0.235, 0.059], cabreraRank: 1, cabreraPolarity: 1 },
  II:  { group: "limb", source: "independent", projection: [0.235, 1.066, -0.132], cabreraRank: 3, cabreraPolarity: 1 },
  III: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 5, cabreraPolarity: 1 },
  aVR: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 2, cabreraPolarity: -1 },
  aVL: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 0, cabreraPolarity: 1 },
  aVF: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 4, cabreraPolarity: 1 },
  V1:  { group: "chest", source: "independent", projection: [-0.515, 0.157, -0.917], cabreraRank: 6, cabreraPolarity: 1 },
  V2:  { group: "chest", source: "independent", projection: [0.044, 0.164, -1.387], cabreraRank: 7, cabreraPolarity: 1 },
  V3:  { group: "chest", source: "independent", projection: [0.882, 0.098, -1.277], cabreraRank: 8, cabreraPolarity: 1 },
  V4:  { group: "chest", source: "independent", projection: [1.213, 0.127, -0.601], cabreraRank: 9, cabreraPolarity: 1 },
  V5:  { group: "chest", source: "independent", projection: [1.125, 0.127, -0.086], cabreraRank: 10, cabreraPolarity: 1 },
  V6:  { group: "chest", source: "independent", projection: [0.831, 0.076, 0.230], cabreraRank: 11, cabreraPolarity: 1 },
} as const;
export type Lead = keyof typeof LEAD_REGISTRY;
export type IndependentLead = {
  [L in Lead]: typeof LEAD_REGISTRY[L]["source"] extends "independent" ? L : never
}[Lead];
// Object insertion order is the explicit standard acquisition/display order.
export const LEADS: readonly Lead[] = Object.freeze(Object.keys(LEAD_REGISTRY) as Lead[]);
export const INDEPENDENT: readonly IndependentLead[] = Object.freeze(
  LEADS.filter((lead): lead is IndependentLead => LEAD_REGISTRY[lead].source === "independent"),
);
export const PRECORDIAL_LEADS: readonly Lead[] = Object.freeze(
  LEADS.filter(lead => LEAD_REGISTRY[lead].group === "chest"),
);
const CABRERA_LEADS: readonly Lead[] = Object.freeze(
  [...LEADS].sort((a, b) => LEAD_REGISTRY[a].cabreraRank - LEAD_REGISTRY[b].cabreraRank),
);
export function orderedLeads(cabrera = false): readonly Lead[] {
  return cabrera ? CABRERA_LEADS : LEADS;
}
export function displayPolarity(lead: Lead, cabrera = false): 1 | -1 {
  return cabrera ? LEAD_REGISTRY[lead].cabreraPolarity : 1;
}
export function leadGain(lead: Lead, view: { gain: number; chestGain: number }): number {
  return LEAD_REGISTRY[lead].group === "chest" ? view.chestGain : view.gain;
}
