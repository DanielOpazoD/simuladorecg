import type { Beat, ECGCase } from "./types";
import type { Kernel } from "./morphology";

export type ActivationRegion = "septal" | "lv-main" | "lv-terminal" | "rv-delayed" | "rv-septal" | "lv-delayed";
export interface RegionalSupport {
  region: ActivationRegion;
  /** Finite support in QRS phase coordinates, not a clinical activation map. */
  start: number;
  end: number;
  /** Integral of the actual windowed basis / sqrt(2*pi), in QRS phase units. */
  weight: number;
}
export const REGIONAL_ACTIVATION_LIMIT =
  "Activación regional experimental de BRD: tiempos y áreas de las bases son parámetros de ingeniería, no un mapa anatómico ni calibración clínica. ST/T secundarios se acoplan a la actividad tardía; no valida Sgarbossa.";

/** Retain an incompatible requested mode visibly; never silently label it active. */
export function regionalActivationState(c: ECGCase) {
  const requested = c.activationModel === "regional-rbbb-v1" || c.activationModel === "regional-lbbb-v1";
  const left = c.activationModel === "regional-lbbb-v1" ||
    (c.activationModel !== "regional-rbbb-v1" && c.conduction === "lbbb");
  const model = left ? "regional-lbbb-v1" as const : "regional-rbbb-v1" as const;
  const minimumQrsMs = left ? 130 : 100;
  let reason = "";
  if (left ? c.conduction !== "lbbb" : c.conduction !== "rbbb" && c.conduction !== "irbbb")
    reason = left ? "El modo BRI requiere BRI aislado." : "Solo disponible para BRD aislado completo o incompleto.";
  else if (c.overload !== "none" || c.ischemia === "posterior")
    reason = "La combinación con sobrecarga o componente QRS posterior queda fuera de este modelo regional.";
  else if (["vt", "torsades", "idioventricular", "vf", "asystole"].includes(c.rhythm) ||
      (c.rhythm === "paced" && c.pacing !== "AAI") ||
      (c.rhythm === "sinus" && c.av === "complete" && c.escape === "ventricular"))
    reason = "Este modo actúa sobre latidos conducidos, no sobre fuentes ventriculares ni estimulación ventricular.";
  else if (!Number.isFinite(c.qrs) || c.qrs < minimumQrsMs || c.qrs > 240)
    reason = `El dominio experimental requiere QRS de ${minimumQrsMs}–240 ms; se conserva el valor solicitado.`;
  return { requested, available: !reason, active: requested && !reason, reason, model, minimumQrsMs };
}
export function usesRegionalActivation(c: ECGCase, b: Pick<Beat, "kind">): boolean {
  return b.kind === "normal" && regionalActivationState(c).active;
}

/** C1 taper at both support edges; no instantaneous artificial discontinuity. */
export function regionalWindow(u: number, support: Pick<RegionalSupport, "start" | "end">): number {
  const x = (u - support.start) / (support.end - support.start);
  if (x <= 0 || x >= 1) return 0;
  const edge = Math.min(x, 1 - x) / .08;
  return edge >= 1 ? 1 : .5 * (1 - Math.cos(Math.PI * edge));
}
export function kernelWeight(k: Kernel): number {
  return k.regional?.weight ?? k.sigma;
}

// Existing RBBB vector directions are retained. Only the activation clock changes.
// Early timing is anchored to the historical 140 ms template, not patient data.
const REFERENCE_QRS_MS = 140;
const windows = [
  { region: "septal", start: 0, end: 30, mu: 10.5, sigma: 4.9 },
  { region: "lv-main", start: 12, end: 80, mu: 44.8, sigma: 11.48 },
  { region: "lv-terminal", start: 42, end: 96, mu: 71.4, sigma: 9.38 },
  { region: "rv-delayed", start: 55, end: REFERENCE_QRS_MS, mu: 106.4, sigma: 16.1 },
] as const;

// Simpson quadrature of four immutable basis shapes, once at module load.
// Runtime widths transform these fixed areas analytically; no per-beat quadrature.
type TemporalBasis = { region: ActivationRegion; start: number; end: number; mu: number; sigma: number };
const leftWindows: readonly TemporalBasis[] = [
  {region:"rv-septal",start:0,end:50,mu:21,sigma:12},
  {region:"lv-main",start:20,end:100,mu:58.5,sigma:19.5},
  {region:"lv-delayed",start:55,end:150,mu:103.5,sigma:22.5},
  {region:"lv-terminal",start:90,end:150,mu:132,sigma:9},
];
const basisAreas = (basis: readonly TemporalBasis[]) => basis.map(w => {
  const width = w.end - w.start, mu = (w.mu - w.start) / width, sigma = w.sigma / width;
  const n = 2048;
  let sum = 0;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const y = Math.exp(-.5 * ((u - mu) / sigma) ** 2) * regionalWindow(u, {start: 0, end: 1});
    sum += y * (i % 2 ? 4 : 2);
  }
  return sum / (3 * n * Math.sqrt(2 * Math.PI));
 });
const areas = basisAreas(windows), leftAreas = basisAreas(leftWindows);

/** Regional surrogate, not a bidomain solver. Delayed RV activation broadens;
 * the early septal/LV clock is fixed. Preserving each basis' time integral is
 * an explicit modeling constraint, not a physiological conservation law.
 */
export function regionalRbbbKernels(kernels: readonly Kernel[], qrsMs: number): Kernel[] {
  if (kernels.length !== 4 || !Number.isFinite(qrsMs) || qrsMs < 100 || qrsMs > 240)
    throw new Error("Activación regional BRD fuera de dominio: cuatro bases y QRS de 100–240 ms.");
  return kernels.map((k, i) => {
    const w = windows[i], referenceWidth = w.end - w.start;
    const end = i === 3 ? qrsMs : w.end, width = end - w.start;
    const gain = referenceWidth / width;
    return {
      mu: (w.start + (w.mu - w.start) / referenceWidth * width) / qrsMs,
      sigma: w.sigma / referenceWidth * width / qrsMs,
      v: [k.v[0] * gain, k.v[1] * gain, k.v[2] * gain],
      regional: { region: w.region, start: w.start / qrsMs, end: end / qrsMs,
        weight: width / qrsMs * areas[i] },
    };
  });
}

/** Programmed basis support only; these are not measured patient activation times. */
export function regionalActivationTimeline(qrsMs: number, model: "regional-rbbb-v1" | "regional-lbbb-v1" = "regional-rbbb-v1") {
  if(model === "regional-lbbb-v1") return leftWindows.map((w,i)=>({region:w.region,
    startMs:i===0?w.start:20+(w.start-20)*(qrsMs-20)/130,
    endMs:i===0?w.end:20+(w.end-20)*(qrsMs-20)/130}));
  return windows.map((w, i) => ({ region: w.region, startMs: w.start,
    endMs: i === 3 ? qrsMs : w.end }));
}

/** Illustrative fixed RV/septal source with delayed LV bases; no patient map. */
export function regionalLbbbKernels(kernels: readonly Kernel[], qrsMs: number): Kernel[] {
  if(kernels.length!==4 || !Number.isFinite(qrsMs) || qrsMs<130 || qrsMs>240)
    throw new Error("Activación regional BRI fuera de dominio: cuatro bases y QRS de 130–240 ms.");
  const supports=regionalActivationTimeline(qrsMs,"regional-lbbb-v1");
  return kernels.map((k,i)=>{
    const w=leftWindows[i], start=supports[i].startMs, end=supports[i].endMs,
      width=end-start, referenceWidth=w.end-w.start, gain=referenceWidth/width;
    return {mu:(start+(w.mu-w.start)/referenceWidth*width)/qrsMs,
      sigma:w.sigma/referenceWidth*width/qrsMs,
      v:k.v.map(v=>v*gain) as [number,number,number],
      regional:{region:w.region,start:start/qrsMs,end:end/qrsMs,weight:width/qrsMs*leftAreas[i]}};
  });
}

export function regionalActivationLimit(c: ECGCase): string {
  return regionalActivationState(c).model === "regional-lbbb-v1"
    ? "Activación regional experimental de BRI: base inicial VD/septal y contribuciones VI diferidas. Tiempos y áreas de ingeniería, no mapa anatómico ni calibración clínica. ST y T secundarios aproximados siguen estas bases; no predice respuesta a resincronización."
    : REGIONAL_ACTIVATION_LIMIT;
}
