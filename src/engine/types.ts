export const LEADS = [
  "I",
  "II",
  "III",
  "aVR",
  "aVL",
  "aVF",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
] as const;
export type Lead = (typeof LEADS)[number];
export type Rhythm =
  | "sinus"
  | "af"
  | "flutter"
  | "junctional"
  | "idioventricular"
  | "vt"
  | "torsades"
  | "vf"
  | "asystole"
  | "paced";
export type AV =
  | "normal"
  | "first"
  | "mobitz1"
  | "mobitz2"
  | "two_one"
  | "high"
  | "complete";
export type Conduction =
  | "normal"
  | "rbbb"
  | "irbbb"
  | "lbbb"
  | "lafb"
  | "lpfb"
  | "rbbb_lafb"
  | "rbbb_lpfb"
  | "wpw";
export type Ischemia =
  | "none"
  | "anterior"
  | "lateral"
  | "inferior_rca"
  | "inferior_lcx"
  | "posterior"
  | "rv"
  | "diffuse"
  | "subendo"
  | "wellens_a"
  | "wellens_b"
  | "de_winter"
  | "pericarditis"
  | "sgarbossa";
export interface ECGCase {
  version: 1;
  presetId: string;
  name: string;
  seed: number;
  rhythm: Rhythm;
  av: AV;
  conduction: Conduction;
  ischemia: Ischemia;
  overload: "none" | "rv_acute" | "rv_chronic" | "lv";
  hr: number;
  atrialRate: number;
  variability: number;
  respiratoryRate: number;
  pr: number;
  qrs: number;
  qtc: number;
  axis: number;
  pAxis: number;
  tAxis: number;
  pAmp: number;
  qrsAmp: number;
  tAmp: number;
  transition: number;
  septalQ: boolean;
  ectopy: "none" | "pac" | "pvc" | "bigeminy" | "trigeminy" | "couplet";
  coupling: number;
  flutterRatio: number;
  escape: "junctional" | "ventricular";
  pacing: "AAI" | "VVI" | "DDD";
  st: number;
  phase: "acute" | "hyperacute" | "evolving" | "chronic";
  stShape: "plateau" | "concave" | "convex";
  electrolyte:
    | "none"
    | "hyperkalemia"
    | "hypokalemia"
    | "longqt"
    | "shortqt"
    | "lowvoltage";
  artifacts: {
    baseline: number;
    muscle: number;
    mains: number;
    loose: number;
    reversed: boolean;
  };
  filter: "off" | "diagnostic" | "monitor" | "aggressive";
  notch: 0 | 50 | 60;
  mainsFrequency: 50 | 60;
  view: {
    mode: "paper" | "monitor" | "rhythm";
    format: "3x4" | "3x4+1" | "3x4+3" | "6x2" | "12x1";
    speed: number;
    gain: number;
    chestGain: number;
    lead: Lead;
    grid: boolean;
    palette: "paper" | "dark";
    pxPerMm: number;
    fit: boolean;
    cabrera: boolean;
    duration: 30 | 60;
    timing: "sequential" | "simultaneous";
  };
}
export interface AtrialEvent {
  time: number;
  kind: "sinus" | "ectopic" | "retrograde";
  conducted: boolean;
  pr?: number;
}
export interface Beat {
  time: number;
  kind: "normal" | "pvc" | "ventricular" | "paced";
  rr: number;
  pr?: number;
  qrs?: number;
  qt?: number;
  adaptedRR?: number;
}
export interface EventSeries {
  atria: AtrialEvent[];
  beats: Beat[];
  spikes: number[];
}
export interface Signal {
  fs: number;
  duration: number;
  leads: Record<Lead, Float64Array>;
  events: EventSeries;
  truth: {
    hr: number;
    pr: number | null;
    qrs: number | null;
    qt: number | null;
    axis: number | null;
  };
  warnings: string[];
}
export type MetricKey = "hr" | "pr" | "qrs" | "qt" | "axis";
export type Reliability = "usable" | "review" | "unavailable";
/** Repeatability is not a probability of clinical correctness. */
export interface MetricEvidence {
  status: Reliability;
  reason: string;
  count: number;
  total: number;
  spread: number | null;
}
export interface DelineatedBeat {
  peak: number;
  onset: number;
  offset: number;
  pOnset: number | null;
  pPeak: number | null;
  tPeak: number | null;
  tEnd: number | null;
  tTangentEnd: number | null;
  rr: number;
  pr: number | null;
  qrs: number;
  qt: number | null;
  axis: number;
  noise: number;
}
export interface Measurement {
  hr: number | null;
  instantHr: number | null;
  pr: number | null;
  qrs: number | null;
  qt: number | null;
  axis: number | null;
  pAxis: number | null;
  tAxis: number | null;
  rr: number | null;
  qtc: {
    bazett: number | null;
    fridericia: number | null;
    framingham: number | null;
    hodges: number | null;
  };
  quality: string;
  beats: DelineatedBeat[];
  evidence: Record<MetricKey, MetricEvidence>;
  window: { start: number; end: number };
  detectedPeaks: number[];
  rejected?: Partial<Record<MetricKey, number>>;
}
export const DEFAULT_CASE: ECGCase = {
  version: 1,
  presetId: "sinus",
  name: "Ritmo sinusal",
  seed: 2026,
  rhythm: "sinus",
  av: "normal",
  conduction: "normal",
  ischemia: "none",
  overload: "none",
  hr: 72,
  atrialRate: 80,
  variability: 0.012,
  respiratoryRate: 14,
  pr: 160,
  qrs: 90,
  qtc: 410,
  axis: 55,
  pAxis: 55,
  tAxis: 40,
  pAmp: 0.15,
  qrsAmp: 1,
  tAmp: 0.28,
  transition: 0,
  septalQ: true,
  ectopy: "none",
  coupling: 0.58,
  flutterRatio: 2,
  escape: "junctional",
  pacing: "DDD",
  st: 2,
  phase: "acute",
  stShape: "plateau",
  electrolyte: "none",
  artifacts: { baseline: 0, muscle: 0, mains: 0, loose: 0, reversed: false },
  filter: "diagnostic",
  notch: 0,
  mainsFrequency: 50,
  view: {
    mode: "paper",
    format: "3x4+1",
    speed: 25,
    gain: 10,
    chestGain: 10,
    lead: "II",
    grid: true,
    palette: "paper",
    pxPerMm: 96 / 25.4,
    fit: true,
    cabrera: false,
    duration: 30,
    timing: "sequential",
  },
};
export function cloneCase(c: ECGCase): ECGCase {
  return JSON.parse(JSON.stringify(c));
}
export function normalizeCase(input: unknown): ECGCase {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("El archivo no contiene un caso ECG.");
  const s = input as Record<string, unknown>;
  if (s.version !== 1)
    throw new Error("Versión de caso no compatible (se requiere versión 1).");
  const c = cloneCase(DEFAULT_CASE);
  const enums: Record<string, readonly unknown[]> = {
    rhythm: [
      "sinus",
      "af",
      "flutter",
      "junctional",
      "idioventricular",
      "vt",
      "torsades",
      "vf",
      "asystole",
      "paced",
    ],
    av: [
      "normal",
      "first",
      "mobitz1",
      "mobitz2",
      "two_one",
      "high",
      "complete",
    ],
    conduction: [
      "normal",
      "rbbb",
      "irbbb",
      "lbbb",
      "lafb",
      "lpfb",
      "rbbb_lafb",
      "rbbb_lpfb",
      "wpw",
    ],
    ischemia: [
      "none",
      "anterior",
      "lateral",
      "inferior_rca",
      "inferior_lcx",
      "posterior",
      "rv",
      "diffuse",
      "subendo",
      "wellens_a",
      "wellens_b",
      "de_winter",
      "pericarditis",
      "sgarbossa",
    ],
    overload: ["none", "rv_acute", "rv_chronic", "lv"],
    ectopy: ["none", "pac", "pvc", "bigeminy", "trigeminy", "couplet"],
    escape: ["junctional", "ventricular"],
    pacing: ["AAI", "VVI", "DDD"],
    phase: ["acute", "hyperacute", "evolving", "chronic"],
    stShape: ["plateau", "concave", "convex"],
    electrolyte: [
      "none",
      "hyperkalemia",
      "hypokalemia",
      "longqt",
      "shortqt",
      "lowvoltage",
    ],
    filter: ["off", "diagnostic", "monitor", "aggressive"],
    notch: [0, 50, 60],
    mainsFrequency: [50, 60],
  };
  for (const [k, values] of Object.entries(enums)) {
    if (s[k] !== undefined && !values.includes(s[k]))
      throw new Error("Valor no válido: " + k);
    if (s[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = s[k];
  }
  const ranges: Record<string, [number, number]> = {
    hr: [20, 250],
    atrialRate: [40, 350],
    seed: [1, 2147483647],
    variability: [0, 0.3],
    respiratoryRate: [6, 40],
    pr: [80, 400],
    qrs: [60, 240],
    qtc: [260, 650],
    axis: [-180, 180],
    pAxis: [-180, 180],
    tAxis: [-180, 180],
    pAmp: [0, 0.5],
    qrsAmp: [0.1, 3],
    tAmp: [0, 1],
    transition: [-1, 1],
    coupling: [0.3, 0.85],
    flutterRatio: [2, 4],
    st: [0, 8],
  };
  for (const [k, [min, max]] of Object.entries(ranges)) {
    const v = s[k];
    if (v !== undefined) {
      if (typeof v !== "number" || !Number.isFinite(v))
        throw new Error("Número no válido: " + k);
      (c as unknown as Record<string, unknown>)[k] = Math.max(
        min,
        Math.min(max, v),
      );
    }
  }
  c.seed = Math.round(c.seed);
  c.flutterRatio = Math.round(c.flutterRatio);
  for (const k of ["presetId", "name"] as const)
    if (typeof s[k] === "string") c[k] = s[k].slice(0, 100);
  if (typeof s.septalQ === "boolean") c.septalQ = s.septalQ;
  if (s.artifacts && typeof s.artifacts === "object") {
    const a = s.artifacts as Record<string, unknown>;
    for (const k of ["baseline", "muscle", "mains", "loose"] as const)
      if (typeof a[k] === "number" && Number.isFinite(a[k]))
        c.artifacts[k] = Math.max(0, Math.min(1, a[k] as number));
    if (typeof a.reversed === "boolean") c.artifacts.reversed = a.reversed;
  }
  if (s.view && typeof s.view === "object") {
    const v = s.view as Record<string, unknown>;
    const opts: Record<string, readonly unknown[]> = {
      mode: ["paper", "monitor", "rhythm"],
      format: ["3x4", "3x4+1", "3x4+3", "6x2", "12x1"],
      speed: [12.5, 25, 50],
      gain: [2.5, 5, 10, 20],
      chestGain: [2.5, 5, 10, 20],
      lead: LEADS,
      palette: ["paper", "dark"],
      duration: [30, 60],
      timing: ["sequential", "simultaneous"],
    };
    for (const [k, values] of Object.entries(opts))
      if (values.includes(v[k]))
        (c.view as unknown as Record<string, unknown>)[k] = v[k];
    for (const k of ["grid", "fit", "cabrera"] as const)
      if (typeof v[k] === "boolean") c.view[k] = v[k];
    if (typeof v.pxPerMm === "number" && Number.isFinite(v.pxPerMm))
      c.view.pxPerMm = Math.max(2, Math.min(10, v.pxPerMm));
  }
  return c;
}
export function constraints(c: ECGCase): string[] {
  const out: string[] = [];
  if (c.rhythm !== "sinus" && c.av !== "normal")
    out.push(
      "Los bloqueos AV seleccionables requieren actividad sinusal; se utiliza conducción propia del ritmo.",
    );
  if (c.rhythm !== "sinus" && c.ectopy !== "none")
    out.push("La ectopia programada solo se aplica al ritmo sinusal.");
  if (c.filter === "monitor" || c.filter === "aggressive")
    out.push(
      "Este filtro modifica el ST y la amplitud. Utiliza Diagnóstico para evaluar repolarización.",
    );
  if (c.conduction === "wpw")
    out.push(
      "Preexcitación aproximada; la localización de la vía accesoria no está modelada.",
    );
  if (c.av === "first" && c.pr <= 200)
    out.push("PR ≤200 ms: el caso ajustado ya no cumple BAV de primer grado.");
  if (
    (c.conduction === "rbbb" ||
      c.conduction === "lbbb" ||
      c.conduction.startsWith("rbbb_")) &&
    c.qrs < 120
  )
    out.push(
      "QRS <120 ms: el caso ajustado no cumple bloqueo completo de rama.",
    );
  if (c.conduction === "irbbb" && (c.qrs < 110 || c.qrs >= 120))
    out.push(
      "El BRD incompleto adulto requiere QRS de 110–119 ms; revisa el ajuste.",
    );
  if (c.av === "mobitz1")
    out.push(
      "PR variable por ciclo. Comprueba cada intervalo con calibres; el PR de base no resume todos los latidos.",
    );
  if (c.av === "complete" && c.rhythm === "sinus")
    out.push(
      "FC controla el escape; la frecuencia auricular se ajusta por separado.",
    );
  if (
    c.ischemia !== "none" &&
    (c.conduction === "lbbb" || c.conduction.includes("rbbb")) &&
    c.ischemia !== "sgarbossa"
  )
    out.push(
      "La lesión se suma a los cambios secundarios de conducción; requiere interpretación contextual.",
    );
  return out;
}
