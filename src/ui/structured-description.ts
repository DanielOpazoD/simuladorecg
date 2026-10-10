import type { ECGCase, Lead, Signal } from "../engine/types";
import { stMarks, ST_LENS } from "../render/st-lens";

/**
 * Structured description of the trace shown (A3): the ABCDE reading of ECGsmith's
 * systematic method, the ST of each lead read on the samples (J+60 against PR,
 * median of the beats) and a 30-second presentation. It describes; it does not
 * diagnose (the case sheet interprets).
 */
const RHYTHM: Partial<Record<ECGCase["rhythm"], string>> = {
  sinus: "sinusal", af: "fibrilación auricular", flutter: "flutter auricular",
  junctional: "de la unión", paced: "de marcapasos", vt: "taquicardia ventricular", idioventricular: "idioventricular",
  torsades: "torsades de pointes", vf: "fibrilación ventricular", asystole: "asistolia",
};
const AV: Partial<Record<ECGCase["av"], string>> = {
  first: "PR prolongado", mobitz1: "bloqueo AV de segundo grado tipo Mobitz I", mobitz2: "bloqueo AV de segundo grado tipo Mobitz II",
  two_one: "bloqueo AV 2:1", high: "bloqueo AV avanzado", complete: "bloqueo AV completo",
};
const ECTOPY: Partial<Record<ECGCase["ectopy"], string>> = { pac: "extrasístoles auriculares", pvc: "extrasístoles ventriculares", bigeminy: "bigeminismo ventricular", trigeminy: "trigeminismo ventricular", couplet: "duplas ventriculares" };
const ST_ORDER: readonly Lead[] = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
const CONTIGUOUS: readonly (readonly [Lead, Lead])[] = [
  ["I", "aVL"], ["II", "aVF"], ["III", "aVF"], ["II", "III"],
  ["V1", "V2"], ["V2", "V3"], ["V3", "V4"], ["V4", "V5"], ["V5", "V6"], ["I", "V6"],
];
const mm = (mv: number) => `${mv > 0 ? "+" : "−"}${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;
const n0 = (v: number) => Math.round(v).toString();
/** "V2–V4" for consecutive precordials, else a list. */
export function leadList(leads: readonly Lead[]): string {
  const out: string[] = [];
  for (let i = 0; i < leads.length; i++) {
    const v = /^V(\d)$/.exec(leads[i]);
    let j = i;
    while (v && j + 1 < leads.length && leads[j + 1] === `V${Number(/^V(\d)$/.exec(leads[j])![1]) + 1}`) j++;
    out.push(j > i + 1 ? `${leads[i]}–${leads[j]}` : leads.slice(i, j + 1).join(", "));
    i = j;
  }
  return out.length > 1 ? `${out.slice(0, -1).join(", ")} y ${out.at(-1)}` : out[0] ?? "";
}

export interface StReading { lead: Lead; j60: number }
/** Median ST deviation at J+60 per lead (mV), over the beats of the trace. */
export function stReading(s: Pick<Signal, "fs" | "leads" | "events">): StReading[] {
  const end = s.leads.I.length / s.fs;
  return ST_ORDER.map((lead) => {
    const v = stMarks(s, lead, 0.3, end - 0.3).map((m) => m.j60).sort((a, b) => a - b);
    return { lead, j60: v.length ? v[Math.floor(v.length / 2)] : 0 };
  });
}

export interface StructuredDescription { lines: { key: string; text: string }[]; summary: string }
export function structuredDescription(c: ECGCase, s: Signal): StructuredDescription {
  const t = s.truth, rr = t.hr > 0 ? 60 / t.hr : null;
  const qtc = t.qt && rr ? t.qt / Math.cbrt(rr) : null;
  const av = c.rhythm === "sinus" ? AV[c.av] : undefined, ectopy = ECTOPY[c.ectopy];
  const ventricular = !!av && c.av !== "first" || c.rhythm === "af";
  const rhythm = `Ritmo ${RHYTHM[c.rhythm] ?? c.rhythm}${av ? ` con ${av}` : ""}${ectopy ? ` y ${ectopy}` : ""}${t.hr > 0 ? `, frecuencia ${ventricular ? "ventricular " : ""}${n0(t.hr)} lpm` : ""}`;
  const intervals = [t.pr !== null ? `PR ${n0(t.pr)} ms` : "PR no medible", t.qrs !== null ? `QRS ${n0(t.qrs)} ms` : null, qtc !== null ? `QTc ${n0(qtc)} ms (Fridericia)` : null].filter(Boolean).join(" · ");
  const axis = t.axis === null ? "Eje no determinable" : `Eje QRS ${n0(t.axis)}° (${t.axis >= -30 && t.axis <= 90 ? "normal" : t.axis < -30 && t.axis >= -90 ? "desviado a la izquierda" : t.axis > 90 && t.axis <= 180 ? "desviado a la derecha" : "extremo"})`;
  const st = t.hr > 0 ? stReading(s) : [];
  const up = st.filter((r) => r.lead !== "aVR" && r.j60 >= ST_LENS.thresholdMv), down = st.filter((r) => r.lead !== "aVR" && r.j60 <= -ST_LENS.thresholdMv);
  const avr = st.find((r) => r.lead === "aVR");
  const peak = (rs: StReading[]) => rs.reduce((a, b) => (Math.abs(b.j60) > Math.abs(a.j60) ? b : a));
  // Guideline criterion for elevation: two contiguous leads at 1 mm or more, 2 mm in
  // V2–V3 (men ≥ 40; the case has no sex or age, so the most demanding one is taken).
  const meets = new Set(up.filter((r) => r.j60 >= (r.lead === "V2" || r.lead === "V3" ? 0.2 : 0.1)).map((r) => r.lead));
  const belowGuide = up.length > 0 && !CONTIGUOUS.some(([a, b]) => meets.has(a) && meets.has(b));
  const stText = !st.length ? "Sin complejos organizados para leer el ST."
    : !up.length && !down.length ? "Sin desviación del ST de 0,5 mm o más (J+60 respecto del PR)."
    : [up.length ? `SDST en ${leadList(up.map((r) => r.lead))} (máx. ${mm(peak(up).j60)} en ${peak(up).lead})` : "",
       belowGuide ? "por debajo del umbral de las guías (1 mm; 2 mm en V2–V3)" : "",
       down.length ? `IDST en ${leadList(down.map((r) => r.lead))} (máx. ${mm(peak(down).j60)} en ${peak(down).lead})` : "",
       avr && Math.abs(avr.j60) >= ST_LENS.thresholdMv ? `aVR ${mm(avr.j60)}` : ""].filter(Boolean).join("; ").replace("; por debajo", ", por debajo") + ".";
  const recip = up.length && down.length ? "Elevación y descenso simultáneos: hay reciprocidad." : "";
  const lines = [
    { key: "A", text: `12 derivaciones, ${c.view.speed} mm/s, ${c.view.gain} mm/mV.` },
    { key: "B·C", text: `${rhythm}.` },
    { key: "D", text: `${intervals}.` },
    { key: "E", text: `${axis}.` },
    { key: "ST", text: stText },
    ...(recip ? [{ key: "Rec.", text: recip }] : []),
  ];
  const summary = `ECG de 12 derivaciones a ${c.view.speed} mm/s. ${rhythm}; ${intervals}; ${axis[0].toLowerCase()}${axis.slice(1)}. ${stText}${recip ? ` ${recip}` : ""}`;
  return { lines, summary };
}
