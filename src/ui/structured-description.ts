import type { ECGCase, Lead, Signal } from "../engine/types";
import { stMarks, ST_LENS } from "../render/st-lens";

/**
 * Structured description of the trace shown (A3): the ABCDE reading of ECGsmith's
 * systematic method, with ST, T and Q read on the samples (against PR, median of the
 * dominant beats) and a 30-second presentation. It describes; it does not diagnose
 * (the case sheet interprets).
 */
const RHYTHM: Record<ECGCase["rhythm"], string> = {
  sinus: "Ritmo sinusal", af: "Fibrilación auricular", flutter: "Flutter auricular",
  junctional: "Ritmo de la unión", paced: "Ritmo de marcapasos", vt: "Taquicardia ventricular",
  idioventricular: "Ritmo idioventricular", torsades: "Torsades de pointes", vf: "Fibrilación ventricular", asystole: "Asistolia",
};
const AV: Partial<Record<ECGCase["av"], string>> = {
  first: "PR prolongado", mobitz1: "bloqueo AV de segundo grado tipo Mobitz I", mobitz2: "bloqueo AV de segundo grado tipo Mobitz II",
  two_one: "bloqueo AV 2:1", high: "bloqueo AV avanzado", complete: "bloqueo AV completo",
};
const ECTOPY: Partial<Record<ECGCase["ectopy"], string>> = { pac: "extrasístoles auriculares", pvc: "extrasístoles ventriculares", bigeminy: "bigeminismo ventricular", trigeminy: "trigeminismo ventricular", couplet: "duplas ventriculares" };
const ST_ORDER: readonly Lead[] = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
/** Contiguous pairs of the guideline criteria (aVR stays out). */
const CONTIGUOUS: readonly (readonly [Lead, Lead])[] = [
  ["I", "aVL"], ["II", "aVF"], ["III", "aVF"], ["II", "III"], ["I", "V6"],
  ["V1", "V2"], ["V2", "V3"], ["V3", "V4"], ["V4", "V5"], ["V5", "V6"],
];
export const mm = (mv: number) => `${mv > 0 ? "+" : "−"}${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;
const n0 = (v: number) => Math.round(v).toString();
export const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/** Lead list; runs of three or more consecutive precordials compress ("V2–V4"). */
export function leadList(leads: readonly Lead[]): string {
  const n = (l: Lead) => (/^V\d$/.test(l) ? Number(l.slice(1)) : NaN), out: string[] = [];
  for (let i = 0; i < leads.length; i++) {
    let j = i;
    while (j + 1 < leads.length && n(leads[j + 1]) === n(leads[j]) + 1) j++;
    if (j >= i + 2) { out.push(`${leads[i]}–${leads[j]}`); i = j; }
    else out.push(leads[i]);
  }
  return out.length > 1 ? `${out.slice(0, -1).join(", ")} y ${out.at(-1)}` : out[0] ?? "";
}

/** Per-lead reading of the dominant beats: ST at J and J+60, T extremes (and which
 * comes first), QRS amplitude and the initial Q, all against the PR segment, median of
 * the beats. Only beats of the dominant kind: an ectopic beat's secondary ST is not the
 * patient's ST. */
export interface LeadMeasure {
  lead: Lead; beats: number;
  j0: number; j60: number;
  tMax: number; tMin: number; tPositiveFirst: boolean;
  qrs: number; qDepth: number; qDur: number; qs: boolean;
}
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
export function dominantBeats(s: Pick<Signal, "events">): number[] {
  const kinds = new Map<string, number[]>();
  s.events.beats.forEach((b, i) => { if (b.qrs !== undefined) kinds.set(b.kind, [...(kinds.get(b.kind) ?? []), i]); });
  if (kinds.get("normal")?.length) return kinds.get("normal")!;
  return [...kinds.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}
export function leadMeasures(s: Pick<Signal, "fs" | "leads" | "events">): LeadMeasure[] {
  const fs = s.fs, end = s.leads.I.length / fs, beats = new Set(dominantBeats(s));
  return ST_ORDER.map((lead) => {
    const a = s.leads[lead], at = (t: number) => Math.round(t * fs), rows: Omit<LeadMeasure, "lead" | "beats">[] = [];
    for (const m of stMarks(s, lead, 0.3, end - 0.3)) {
      if (!beats.has(m.beat)) continue;
      const b = s.events.beats[m.beat], pr = m.prLevel, on = at(b.time), j = at(m.jTime);
      let lo = 0, hi = 0;
      for (let i = on; i <= j; i++) { lo = Math.min(lo, a[i] - pr); hi = Math.max(hi, a[i] - pr); }
      const tEnd = Math.min(a.length - 1, at(b.qt !== undefined ? b.time + b.qt : m.jTime + 0.32));
      let tMax = 0, tMin = 0, iMax = 0, iMin = 0;
      for (let i = at(m.jTime + ST_LENS.windowS); i <= tEnd; i++) {
        const v = a[i] - pr;
        if (v > tMax) { tMax = v; iMax = i; }
        if (v < tMin) { tMin = v; iMin = i; }
      }
      let k = on;
      while (k < j && Math.abs(a[k] - pr) < 0.03) k++;
      let qDepth = 0, qDur = 0;
      if (a[k] - pr < 0) {
        let e = k;
        while (e < j && a[e] - pr < 0) { qDepth = Math.min(qDepth, a[e] - pr); e++; }
        qDur = (e - on) / fs;
      }
      rows.push({ j0: m.j0, j60: m.j60, tMax, tMin, tPositiveFirst: iMax < iMin, qrs: hi - lo, qDepth, qDur, qs: hi < 0.05 });
    }
    const pick = (k: "j0" | "j60" | "tMax" | "tMin" | "qrs" | "qDepth" | "qDur") => median(rows.map((r) => r[k]));
    const most = (k: "tPositiveFirst" | "qs") => rows.filter((r) => r[k]).length * 2 > rows.length;
    return { lead, beats: rows.length, j0: pick("j0"), j60: pick("j60"), tMax: pick("tMax"), tMin: pick("tMin"), tPositiveFirst: most("tPositiveFirst"), qrs: pick("qrs"), qDepth: pick("qDepth"), qDur: pick("qDur"), qs: most("qs") };
  });
}

/** Leads of `set` that belong to a contiguous pair inside it. */
const contiguous = (set: ReadonlySet<Lead>) => ST_ORDER.filter((l) => CONTIGUOUS.some((p) => p.includes(l) && set.has(p[0]) && set.has(p[1])));
const largest = (rs: LeadMeasure[], value: (r: LeadMeasure) => number) => rs.reduce((a, b) => (Math.abs(value(b)) > Math.abs(value(a)) ? b : a));
const absMm = (mv: number) => `${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;

/** The clinical reading of each component (what a clinician would write) and the
 * leads behind it; the measured values and criteria live in the info dialogs. */
export interface StFindings { elevation: LeadMeasure[]; mild: LeadMeasure[]; depression: LeadMeasure[]; rising: boolean; avr: LeadMeasure; meetsCriterion: boolean }
/** Guideline threshold at J. The case has no sex or age: V2–V3 take the most quoted
 * value, 2 mm (men ≥ 40); the lowest (1.5 mm, women) flags normal early repolarization. */
export const elevationThreshold = (lead: Lead) => (lead === "V2" || lead === "V3" ? 0.2 : 0.1);
export function stFindings(m: LeadMeasure[]): StFindings {
  const leads = m.filter((r) => r.lead !== "aVR");
  const up = leads.filter((r) => r.j0 >= ST_LENS.thresholdMv);
  const down = leads.filter((r) => r.j0 <= -ST_LENS.thresholdMv), downPairs = contiguous(new Set(down.map((r) => r.lead)));
  // Guideline criterion at J: 1 mm in two contiguous leads (2 mm in V2–V3, see above).
  const meetingPairs = contiguous(new Set(up.filter((r) => r.j0 >= elevationThreshold(r.lead)).map((r) => r.lead)));
  const meetsCriterion = meetingPairs.length > 0;
  // Depression: ≥ 0.5 mm in two contiguous leads; next to an elevation, an isolated
  // reciprocal depression (III in a high lateral occlusion) also counts.
  const depression = down.filter((r) => meetsCriterion || downPairs.includes(r.lead));
  // Below the criterion, an elevation is worth naming only beyond the physiological
  // V1–V3 pattern and in contiguous leads (a residual elevation, for instance).
  const mildLeads = contiguous(new Set(up.map((r) => r.lead)));
  const mild = !meetsCriterion && up.some((r) => !/^V[1-3]$/.test(r.lead)) ? up.filter((r) => mildLeads.includes(r.lead)) : [];
  return { elevation: up.filter((r) => meetingPairs.includes(r.lead)), mild, depression, rising: depression.length > 0 && median(depression.map((r) => (r.j60 - r.j0) / Math.abs(r.j0))) >= 0.5, avr: m.find((r) => r.lead === "aVR")!, meetsCriterion };
}
function stLine(f: StFindings): string {
  const parts: string[] = [];
  if (f.elevation.length) { const p = largest(f.elevation, (r) => r.j0); parts.push(`Elevación del ST en ${leadList(f.elevation.map((r) => r.lead))}, máxima en ${p.lead} (${absMm(p.j0)})`); }
  if (f.mild.length) parts.push(`elevación leve del ST en ${leadList(f.mild.map((r) => r.lead))}, bajo el criterio de las guías`);
  if (f.depression.length) { const p = largest(f.depression, (r) => r.j0); parts.push(`descenso del ST ${f.rising ? "con pendiente ascendente" : "horizontal o descendente"} en ${leadList(f.depression.map((r) => r.lead))}, máximo en ${p.lead} (${absMm(p.j0)})`); }
  if (f.avr.j0 >= ST_LENS.thresholdMv) parts.push(`elevación del ST en aVR (${absMm(f.avr.j0)})`);
  else if (f.avr.j0 <= -ST_LENS.thresholdMv) parts.push(`descenso del ST en aVR (${absMm(f.avr.j0)})`);
  if (!parts.length) return "Sin alteraciones del ST.";
  const text = parts.join("; ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

export interface TFindings { inverted: LeadMeasure[]; biphasic: LeadMeasure[]; flat: LeadMeasure[]; prominent: LeadMeasure[] }
export function tFindings(m: LeadMeasure[]): TFindings {
  const leads = m.filter((r) => r.lead !== "aVR");
  const biphasic = leads.filter((r) => r.tMax >= 0.1 && r.tMin <= -0.1 && Math.min(r.tMax, -r.tMin) >= 0.3 * Math.max(r.tMax, -r.tMin));
  const negative = leads.filter((r) => !biphasic.includes(r) && r.tMin <= -0.1 && -r.tMin > r.tMax);
  // Normal variants: an inverted T in V1, or in III alone, is common in healthy adults.
  const inferiorToo = negative.some((r) => r.lead === "II" || r.lead === "aVF");
  const inverted = negative.filter((r) => r.lead !== "V1" && (r.lead !== "III" || inferiorToo));
  // Flat: under 1 mm where the T is normally upright (I, II, V3–V6; aVF may be flat in
  // healthy adults), in two contiguous leads.
  const flatCandidates = leads.filter((r) => /^(I|II|V[3-6])$/.test(r.lead) && !biphasic.includes(r) && !negative.includes(r) && r.tMax < 0.1);
  const flatPairs = contiguous(new Set(flatCandidates.map((r) => r.lead)));
  const flat = flatCandidates.filter((r) => flatPairs.includes(r.lead));
  // Prominent: ≥ 10 mm, or ≥ 7 mm and at least 80 % of a QRS of ≥ 8 mm (a small QRS
  // alone does not make a normal T «large for its QRS»).
  const prominent = leads.filter((r) => !biphasic.includes(r) && (r.tMax >= 1 || (r.tMax >= 0.7 && r.qrs >= 0.8 && r.tMax / r.qrs >= 0.8)));
  return { inverted, biphasic, flat, prominent };
}
function tLine(f: TFindings, wide: boolean): string {
  // With a wide QRS the T is secondary: its size says nothing about ischaemia.
  if (wide) f = { ...f, prominent: [] };
  const parts: string[] = [];
  if (f.inverted.length) parts.push(`Ondas T invertidas en ${leadList(f.inverted.map((r) => r.lead))}`);
  if (f.biphasic.length) parts.push(`ondas T bifásicas en ${leadList(f.biphasic.map((r) => r.lead))}`);
  if (f.flat.length) parts.push(`ondas T aplanadas en ${leadList(f.flat.map((r) => r.lead))}`);
  if (f.prominent.length) parts.push(`ondas T prominentes, grandes para su QRS, en ${leadList(f.prominent.map((r) => r.lead))}`);
  if (!parts.length) return "Onda T normal.";
  const text = parts.join("; ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** Fourth Universal Definition: Q ≥ 30 ms and ≥ 0.1 mV deep (or QS) in two contiguous
 * leads; in V2–V3 any Q ≥ 20 ms or QS. aVR stays out. */
export function pathologicalQ(m: LeadMeasure[]): LeadMeasure[] {
  const isQ = (r: LeadMeasure) => r.lead !== "aVR" && (r.qs || (r.lead === "V2" || r.lead === "V3" ? r.qDur >= 0.02 : r.qDur >= 0.03 && r.qDepth <= -0.1));
  const q = m.filter(isQ), pairs = contiguous(new Set(q.map((r) => r.lead)));
  return q.filter((r) => pairs.includes(r.lead) || r.lead === "V2" || r.lead === "V3");
}
const qLine = (q: LeadMeasure[]) => q.length ? `Ondas Q patológicas en ${leadList(q.map((r) => r.lead))}.` : "Sin ondas Q patológicas.";

function atrialRate(s: Signal): number | null {
  const t = s.events.atria.map((a) => a.time);
  return t.length < 3 ? null : 60 / median(t.slice(1).map((v, i) => v - t[i]));
}

export type DescriptionInfo = "st" | "t" | "q";
export interface StructuredDescription { lines: { key: string; text: string; info?: DescriptionInfo }[]; summary: string; measures: LeadMeasure[] }
export function structuredDescription(c: ECGCase, s: Signal): StructuredDescription {
  const t = s.truth, rr = t.hr > 0 ? 60 / t.hr : null;
  const qtc = t.qt && rr ? t.qt / Math.cbrt(rr) : null;
  const av = c.rhythm === "sinus" ? AV[c.av] : undefined, ectopy = ECTOPY[c.ectopy];
  const dissociated = !!av && c.av !== "first", ventricular = dissociated || c.rhythm === "af" || c.rhythm === "flutter";
  const atrial = dissociated ? atrialRate(s) : null;
  const rhythm = `${RHYTHM[c.rhythm]}${av ? ` con ${av}` : ""}${ectopy ? ` y ${ectopy}` : ""}` +
    (t.hr > 0 ? `, frecuencia ${ventricular ? "ventricular " : ""}${n0(t.hr)} lpm` : "") +
    (atrial ? `, ondas P a ${n0(atrial)}/min` : "");
  const dominant = dominantBeats(s), dominantQrs = dominant.length ? median(dominant.map((i) => s.events.beats[i].qrs!)) * 1000 : null;
  const qrs = dominantQrs ?? t.qrs;
  const intervals = [t.pr !== null ? `PR ${n0(t.pr)} ms` : "PR no medible", qrs !== null ? `QRS ${n0(qrs)} ms` : null, qtc !== null ? `QTc ${n0(qtc)} ms` : null].filter(Boolean).join(" · ");
  const axis = t.axis === null ? "Eje no determinable" : `Eje QRS ${n0(t.axis)}° (${t.axis >= -30 && t.axis <= 90 ? "normal" : t.axis < -30 && t.axis >= -90 ? "desviado a la izquierda" : t.axis > 90 && t.axis <= 180 ? "desviado a la derecha" : "extremo"})`;
  const m = leadMeasures(s);
  const ventricularDominant = dominant.length > 0 && s.events.beats[dominant[0]].kind !== "normal";
  const wide = (qrs ?? 0) >= 120 || ventricularDominant;
  // Q waves are not read with LBBB, pre-excitation or ventricular/paced complexes; with
  // RBBB the initial forces are preserved and they are.
  const qUnreadable = ventricularDominant || c.conduction === "lbbb" || c.conduction === "wpw";
  const lines: StructuredDescription["lines"] = [
    { key: "A", text: `12 derivaciones, ${c.view.speed} mm/s, ${c.view.gain} mm/mV.` },
    { key: "B·C", text: `${rhythm}.` },
    { key: "D", text: `${intervals}.` },
    { key: "E", text: `${axis}.` },
  ];
  // Polymorphic or chaotic rhythms have no repeatable ST; flutter waves occupy the PR
  // segment the ST is read against.
  if (!m.some((r) => r.beats > 0) || c.rhythm === "torsades" || c.rhythm === "vf") lines.push({ key: "ST", text: "ST, onda T y ondas Q no valorables: no hay complejos organizados." });
  else if (c.rhythm === "flutter") lines.push({ key: "ST", text: "ST no valorable: las ondas F ocupan la línea de base." });
  else {
    // With f waves on the baseline a mild sub-threshold elevation is not readable.
    const st = stFindings(m);
    if (c.rhythm === "af") st.mild = [];
    const stText = stLine(st);
    lines.push({ key: "ST", text: c.rhythm === "af" ? `${stText.slice(0, -1)} (lectura aproximada por las ondas f).` : stText, info: "st" },
      { key: "T", text: tLine(tFindings(m), wide), info: "t" },
      { key: "Q", text: qUnreadable ? "Ondas Q no valorables con este QRS (bloqueo de rama izquierda, preexcitación o QRS ventricular)." : qLine(pathologicalQ(m)), info: "q" });
    if (wide && (st.elevation.length || st.depression.length)) lines.push({ key: "ST/QRS", text: "Alteraciones del ST secundarias al QRS ancho: valorar su proporción con el QRS." });
    else if (st.elevation.length && st.depression.length) lines.push({ key: "Rec.", text: "Cambios recíprocos del ST." });
  }
  const summary = `ECG de 12 derivaciones a ${c.view.speed} mm/s. ${rhythm}; ${intervals}; ${axis[0].toLowerCase()}${axis.slice(1)}. ${lines.slice(4).map((l) => l.text).join(" ")}`;
  return { lines, summary, measures: m };
}
