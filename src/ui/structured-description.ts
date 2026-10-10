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
const mm = (mv: number) => `${mv > 0 ? "+" : "−"}${Math.abs(mv * 10).toFixed(1).replace(".", ",")} mm`;
const n0 = (v: number) => Math.round(v).toString();
const dec = (v: number) => v.toFixed(1).replace(".", ",");
const ms = (s: number) => `${Math.round(s * 1000)} ms`;

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

function stLine(m: LeadMeasure[]): { text: string; up: boolean; down: boolean } {
  const leads = m.filter((r) => r.lead !== "aVR");
  const up = leads.filter((r) => r.j0 >= ST_LENS.thresholdMv), down = leads.filter((r) => r.j0 <= -ST_LENS.thresholdMv);
  const avr = m.find((r) => r.lead === "aVR")!;
  if (!up.length && !down.length) return { text: "Sin desviación del ST de 0,5 mm o más en el punto J.", up: false, down: false };
  const parts: string[] = [];
  // Guideline criterion at J: 1 mm in two contiguous leads; in V2–V3 1.5 mm (women),
  // 2 mm (men ≥ 40) or 2.5 mm (men < 40). The case has no sex or age, so an elevation
  // is called sub-threshold only when it misses even the lowest of them.
  const meets = new Set(up.filter((r) => r.j0 >= (r.lead === "V2" || r.lead === "V3" ? 0.15 : 0.1)).map((r) => r.lead));
  const sdst = contiguous(meets).length > 0;
  if (up.length) {
    const p = largest(up, (r) => r.j0), where = `${mm(p.j0)} en J y ${mm(p.j60)} a J+60, en ${p.lead}`;
    parts.push(sdst ? `SDST en ${leadList(up.map((r) => r.lead))} (máx. ${where})`
      : `Punto J elevado en ${leadList(up.map((r) => r.lead))} (máx. ${where}), bajo el criterio de las guías (1 mm en dos derivaciones contiguas; 1,5 a 2,5 mm en V2–V3 según sexo y edad)` +
        (up.every((r) => /^V[1-4]$/.test(r.lead)) ? ", habitual en V1–V3" : ""));
  }
  if (down.length) {
    const p = largest(down, (r) => r.j0), rising = median(down.map((r) => (r.j60 - r.j0) / Math.abs(r.j0))) >= 0.5;
    parts.push(`IDST ${rising ? "ascendente desde J" : "horizontal o descendente"} en ${leadList(down.map((r) => r.lead))} (máx. ${mm(p.j0)} en J, en ${p.lead})`);
  }
  if (Math.abs(avr.j0) >= ST_LENS.thresholdMv) parts.push(`aVR ${mm(avr.j0)}`);
  return { text: `${parts.join("; ")}.`, up: sdst, down: down.length > 0 };
}

function tLine(m: LeadMeasure[]): string {
  const leads = m.filter((r) => r.lead !== "aVR");
  const biphasic = leads.filter((r) => r.tMax >= 0.1 && r.tMin <= -0.1 && Math.min(r.tMax, -r.tMin) >= 0.3 * Math.max(r.tMax, -r.tMin));
  const inverted = leads.filter((r) => !biphasic.includes(r) && r.tMin <= -0.1 && -r.tMin > r.tMax);
  const parts: string[] = [];
  if (inverted.length) parts.push(`T negativas en ${leadList(inverted.map((r) => r.lead))} (máx. ${mm(largest(inverted, (r) => r.tMin).tMin)})`);
  for (const positiveFirst of [true, false]) {
    const group = biphasic.filter((r) => r.tPositiveFirst === positiveFirst);
    if (group.length) parts.push(`T bifásicas ${positiveFirst ? "positiva-negativa" : "negativa-positiva"} en ${leadList(group.map((r) => r.lead))}`);
  }
  const tall = largest(leads, (r) => r.tMax);
  if (tall.tMax >= 0.1) parts.push(`T más alta ${mm(tall.tMax)} en ${tall.lead} (T/QRS ${dec(tall.tMax / Math.max(tall.qrs, 0.01))})`);
  return parts.length ? `${parts.join("; ")}.` : "T de bajo voltaje en todas las derivaciones.";
}

function qLine(m: LeadMeasure[]): string {
  // Fourth Universal Definition: Q ≥ 30 ms and ≥ 0.1 mV deep (or QS) in two contiguous
  // leads; in V2–V3 any Q ≥ 20 ms or QS. aVR stays out.
  const isQ = (r: LeadMeasure) => r.lead !== "aVR" && (r.qs || (r.lead === "V2" || r.lead === "V3" ? r.qDur >= 0.02 : r.qDur >= 0.03 && r.qDepth <= -0.1));
  const q = m.filter(isQ), set = new Set(q.map((r) => r.lead)), pairs = contiguous(set);
  const shown = q.filter((r) => pairs.includes(r.lead) || r.lead === "V2" || r.lead === "V3");
  if (!shown.length) return "Sin Q patológicas.";
  const p = largest(shown, (r) => r.qDepth);
  return `Q patológicas en ${leadList(shown.map((r) => r.lead))} (máx. ${mm(p.qDepth)} y ${ms(p.qDur)}${p.qs ? ", QS" : ""}, en ${p.lead}).`;
}

function atrialRate(s: Signal): number | null {
  const t = s.events.atria.map((a) => a.time);
  return t.length < 3 ? null : 60 / median(t.slice(1).map((v, i) => v - t[i]));
}

export interface StructuredDescription { lines: { key: string; text: string }[]; summary: string }
export function structuredDescription(c: ECGCase, s: Signal): StructuredDescription {
  const t = s.truth, rr = t.hr > 0 ? 60 / t.hr : null;
  const qtc = t.qt && rr ? t.qt / Math.cbrt(rr) : null;
  const av = c.rhythm === "sinus" ? AV[c.av] : undefined, ectopy = ECTOPY[c.ectopy];
  const dissociated = !!av && c.av !== "first", ventricular = dissociated || c.rhythm === "af" || c.rhythm === "flutter";
  const atrial = dissociated || c.rhythm === "flutter" ? atrialRate(s) : null;
  const rhythm = `${RHYTHM[c.rhythm]}${av ? ` con ${av}` : ""}${ectopy ? ` y ${ectopy}` : ""}` +
    (t.hr > 0 ? `, frecuencia ${ventricular ? "ventricular " : ""}${n0(t.hr)} lpm` : "") +
    (atrial ? `, ${c.rhythm === "flutter" ? "ondas F" : "ondas P"} a ${n0(atrial)}/min` : "");
  const dominant = dominantBeats(s), dominantQrs = dominant.length ? median(dominant.map((i) => s.events.beats[i].qrs!)) * 1000 : null;
  const qrs = dominantQrs ?? t.qrs;
  const intervals = [t.pr !== null ? `PR ${n0(t.pr)} ms` : "PR no medible", qrs !== null ? `QRS ${n0(qrs)} ms` : null, qtc !== null ? `QTc ${n0(qtc)} ms (Fridericia)` : null].filter(Boolean).join(" · ");
  const axis = t.axis === null ? "Eje no determinable" : `Eje QRS ${n0(t.axis)}° (${t.axis >= -30 && t.axis <= 90 ? "normal" : t.axis < -30 && t.axis >= -90 ? "desviado a la izquierda" : t.axis > 90 && t.axis <= 180 ? "desviado a la derecha" : "extremo"})`;
  const m = leadMeasures(s);
  const wide = (qrs ?? 0) >= 120 || (dominant.length > 0 && s.events.beats[dominant[0]].kind !== "normal");
  const lines = [
    { key: "A", text: `12 derivaciones, ${c.view.speed} mm/s, ${c.view.gain} mm/mV.` },
    { key: "B·C", text: `${rhythm}.` },
    { key: "D", text: `${intervals}.` },
    { key: "E", text: `${axis}.` },
  ];
  // Polymorphic or chaotic rhythms have no repeatable ST; flutter waves occupy the PR
  // segment the ST is read against.
  if (!m.some((r) => r.beats > 0) || c.rhythm === "torsades" || c.rhythm === "vf") lines.push({ key: "ST", text: "Sin complejos organizados para leer el ST, la T ni las Q." });
  else if (c.rhythm === "flutter") lines.push({ key: "ST", text: "No se lee: las ondas F ocupan la línea de base (el segmento PR) contra la que se mide el ST." });
  else {
    const st = stLine(m);
    lines.push({ key: "ST", text: c.rhythm === "af" ? `${st.text} Referencia del PR alterada por las ondas f: lectura aproximada.` : st.text }, { key: "T", text: tLine(m) }, { key: "Q", text: wide ? "No se evalúan con QRS ancho o no conducido." : qLine(m) });
    if (wide && (st.up || st.down)) lines.push({ key: "ST/QRS", text: "Con QRS ancho el ST es en parte secundario a la despolarización: léelo en proporción al QRS, no como reciprocidad." });
    else if (st.up && st.down) lines.push({ key: "Rec.", text: "Elevación y descenso simultáneos con QRS estrecho: hay reciprocidad." });
  }
  const summary = `ECG de 12 derivaciones a ${c.view.speed} mm/s. ${rhythm}; ${intervals}; ${axis[0].toLowerCase()}${axis.slice(1)}. ${lines.slice(4).map((l) => l.text).join(" ")}`;
  return { lines, summary };
}
