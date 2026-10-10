/**
 * Statistical shape model of the normal sinus beat, learned from PTB-XL+ 12SL
 * median beats (CC BY 4.0, see THIRD_PARTY_NOTICES.md and docs/fidelidad.md).
 *
 * The model stores only a mean beat, 64 modes of variation and a joint Gaussian
 * between mode coefficients and case-level variables (durations, frontal axis,
 * wave magnitudes). A "patient" is a coefficient vector sampled conditionally on
 * what the case asks for; no individual recording is shipped or reproduced.
 *
 * Layout of a template: phases P, PQ, QRS, ST (to the spatial T apex), T (apex
 * to T end) and post-T, each resampled to a
 * fixed number of points; per point, the eight independent leads I, II, V1–V6.
 */
import raw from "./normal-shape-model.json";
import { LEAD_REGISTRY } from "../lead-registry";
import { normal, random } from "../random";

export const MODEL_LEADS = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
export type PhaseName = "pre" | "p" | "pq" | "qrs" | "st" | "t" | "post";
const NL = MODEL_LEADS.length;

export interface PhaseLayout { name: PhaseName; points: number; offset: number }
export interface ShapeModel {
  code: ModelCode;
  k: number;
  dim: number;
  points: number;
  phases: Record<PhaseName, PhaseLayout>;
  postMs: number;
  /** Learned lead-in before P onset (gradual start of atrial activation). */
  preMs: number;
  mean: Float64Array;
  basis: Float64Array; // k × dim
  names: string[];
  jointMean: Float64Array;
  jointCov: Float64Array; // m × m
  /** Gaussian mixture over the same joint vector (the real population is not Gaussian). */
  mixture: { weights: number[]; means: Float64Array; cholesky: Float64Array };
  /** Spread of the population draw (1 = learned covariance). Below 1 only for very
   * small classes, whose Gaussian tails blend subtypes no patient has. */
  sampleScale: number;
  /** Paced populations: the recorded pacing spike (unit 8-lead direction, log-normal
   * spatial size in mV and mean normalized waveform at 500 Hz, ±10 ms). */
  spike?: { unit: number[]; logNormMean: number; logNormSd: number; shape500Hz: number[] };
  population: { durationsMsP50: number[]; axisP50: number; magnitudesP50: number[] };
}

function decodeFloat32(b64: string): Float64Array {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Float64Array.from(new Float32Array(bytes.buffer));
}
function decodeInt16(b64: string): Int16Array {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return new Int16Array(bytes.buffer);
}

/** Learned populations: the normal sinus beat (always bundled) and per-diagnosis
 * classes that the signal worker loads on demand (models.ts). */
export type ModelCode = "NORM" | "CLBBB" | "CRBBB" | "IRBBB" | "LAFB" | "LVH" | "IMI" | "ASMI" | "PVC" | "VPACE";
/** Ectopic populations: ventricular premature beats and ventricular paced beats. */
export type EctopicModelCode = "PVC" | "VPACE";
/** Populations of the conducted (sinus/supraventricular) beat. */
export type BeatModelCode = Exclude<ModelCode, EctopicModelCode>;
export type RawShapeModel = typeof raw;
const registry = new Map<ModelCode, ShapeModel>();

function decode(code: ModelCode, r: RawShapeModel): ShapeModel {
  const k = r.components, mean = decodeFloat32(r.mean), dim = mean.length;
  const b16 = decodeInt16(r.basis), basis = new Float64Array(k * dim), basisScale = decodeFloat32(r.basisScale);
  for (let i = 0; i < k; i++)
    for (let j = 0; j < dim; j++) basis[i * dim + j] = b16[i * dim + j] * basisScale[i];
  const phases = {} as Record<PhaseName, PhaseLayout>;
  let offset = 0;
  for (const p of r.phases) {
    phases[p.name as PhaseName] = { name: p.name as PhaseName, points: p.points, offset };
    offset += p.points;
  }
  if (offset * NL !== dim || !Array.from({ length: k }, (_, i) => `z${i}`).every((z) => r.joint.names.includes(z))) throw new Error(`Modelo de forma ${code} inconsistente.`);
  return {
    code, k, dim, points: offset, phases, postMs: r.postMs, preMs: r.preMs, mean, basis,
    names: r.joint.names, jointMean: Float64Array.from(r.joint.mean),
    jointCov: Float64Array.from(r.joint.cov), population: r.population,
    mixture: { weights: r.mixture.weights, means: decodeFloat32(r.mixture.means), cholesky: decodeFloat32(r.mixture.cholesky) },
    sampleScale: (r as { sampleScale?: number }).sampleScale ?? 1,
    spike: (r as { spike?: ShapeModel["spike"] }).spike,
  };
}
export function registerShapeModel(code: ModelCode, r: RawShapeModel): void {
  if (!registry.has(code)) registry.set(code, decode(code, r));
}
export const hasShapeModel = (code: ModelCode) => code === "NORM" || registry.has(code);
/** Test seam: drop the class models so a test can exercise on-demand loading. */
export function forgetClassShapeModels(): void {
  for (const code of [...registry.keys()]) if (code !== "NORM") registry.delete(code);
}

/** Offline scripts bundled for Node (scripts/, run from the repository root)
 * read class models from disk. Browsers and the test runner never do: there a
 * missing model must surface as an error, so on-demand loading stays tested. */
function readFromDisk(code: ModelCode): RawShapeModel | null {
  const host = (globalThis as { process?: { env?: Record<string, string | undefined>; cwd?: () => string; getBuiltinModule?: (id: string) => unknown } }).process;
  if (!host?.getBuiltinModule || !host.cwd || host.env?.VITEST) return null;
  const fs = host.getBuiltinModule("node:fs") as { existsSync(p: string): boolean; readFileSync(p: string, e: string): string };
  const file = `${host.cwd()}/src/engine/realistic/models/${code}.json`;
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RawShapeModel) : null;
}

export function shapeModel(code: ModelCode = "NORM"): ShapeModel {
  if (code === "NORM" && !registry.has(code)) registerShapeModel(code, raw);
  if (!registry.has(code)) {
    const fromDisk = readFromDisk(code);
    if (fromDisk) registerShapeModel(code, fromDisk);
  }
  const m = registry.get(code);
  // Callers load class models first (ensureShapeModel); never fall back silently
  // to another population, which would change the trace without notice.
  if (!m) throw new Error(`El modelo aprendido ${code} no está cargado.`);
  return m;
}

/** Mean + basisᵀ·z, in the (point, lead) layout. */
export function reconstruct(m: ShapeModel, z: ArrayLike<number>): Float64Array {
  const x = Float64Array.from(m.mean);
  for (let i = 0; i < m.k; i++) {
    const zi = z[i];
    if (zi === 0) continue;
    const row = i * m.dim;
    for (let j = 0; j < m.dim; j++) x[j] += m.basis[row + j] * zi;
  }
  return x;
}

// ── Small dense linear algebra for Gaussian conditioning ──────────────────────
function cholesky(a: Float64Array, n: number): Float64Array {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j];
      for (let p = 0; p < j; p++) s -= l[i * n + p] * l[j * n + p];
      l[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / l[j * n + j];
    }
  return l;
}
function solveSpd(a: Float64Array, n: number, b: Float64Array, cols: number): Float64Array {
  // Solves A X = B (B is n × cols) by Cholesky.
  const l = cholesky(a, n), x = Float64Array.from(b);
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < n; i++) {
      let s = x[i * cols + c];
      for (let p = 0; p < i; p++) s -= l[i * n + p] * x[p * cols + c];
      x[i * cols + c] = s / l[i * n + i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i * cols + c];
      for (let p = i + 1; p < n; p++) s -= l[p * n + i] * x[p * cols + c];
      x[i * cols + c] = s / l[i * n + i];
    }
  }
  return x;
}

/** Sample every variable not in `known` from the joint Gaussian conditioned on `known`. */
export function sampleConditional(
  m: ShapeModel,
  known: Record<string, number>,
  rng: () => number,
): Record<string, number> {
  const all = m.names, M = all.length;
  const ki = all.map((n, i) => (n in known ? i : -1)).filter((i) => i >= 0);
  const ui = all.map((n, i) => (n in known ? -1 : i)).filter((i) => i >= 0);
  const q = ki.length, u = ui.length, C = m.jointCov, mu = m.jointMean;
  const Cdd = new Float64Array(q * q), Cdu = new Float64Array(q * u), r = new Float64Array(q);
  for (let a = 0; a < q; a++) {
    r[a] = known[all[ki[a]]] - mu[ki[a]];
    for (let b = 0; b < q; b++) Cdd[a * q + b] = C[ki[a] * M + ki[b]];
    for (let b = 0; b < u; b++) Cdu[a * u + b] = C[ki[a] * M + ui[b]];
  }
  const w = q ? solveSpd(Cdd, q, Cdu, u) : new Float64Array(0); // Cdd⁻¹ Cdu
  const alpha = q ? solveSpd(Cdd, q, r, 1) : new Float64Array(0);
  const cov = new Float64Array(u * u), mean = new Float64Array(u);
  for (let a = 0; a < u; a++) {
    let s = mu[ui[a]];
    for (let p = 0; p < q; p++) s += Cdu[p * u + a] * alpha[p];
    mean[a] = s;
    for (let b = 0; b < u; b++) {
      let c = C[ui[a] * M + ui[b]];
      for (let p = 0; p < q; p++) c -= Cdu[p * u + a] * w[p * u + b];
      cov[a * u + b] = c;
    }
  }
  const l = cholesky(cov, u), e = Array.from({ length: u }, () => normal(rng));
  const out: Record<string, number> = { ...known };
  for (let a = 0; a < u; a++) {
    let s = mean[a];
    for (let b = 0; b <= a; b++) s += l[a * u + b] * e[b];
    out[all[ui[a]]] = s;
  }
  return out;
}

// ── Dipolar (Dower) decomposition: rotations act on the heart vector only ─────
const D = MODEL_LEADS.map((lead) => (LEAD_REGISTRY[lead] as { projection: readonly number[] }).projection);
/** Pseudo-inverse (DᵀD)⁻¹Dᵀ, 3 × 8. */
const PINV = (() => {
  const dtd = new Float64Array(9);
  for (const row of D) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dtd[i * 3 + j] += row[i] * row[j];
  const dt = new Float64Array(3 * NL);
  for (let l = 0; l < NL; l++) for (let i = 0; i < 3; i++) dt[i * NL + l] = D[l][i];
  return solveSpd(dtd, 3, dt, NL);
})();

/** Heart vector (Dower XYZ) that best explains eight lead values. */
export function dipoleOf(y: ArrayLike<number>, offset = 0): [number, number, number] {
  const v: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) for (let l = 0; l < NL; l++) v[i] += PINV[i * NL + l] * y[offset + l];
  return v;
}

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export function rotation(frontalDeg: number, horizontalDeg: number): Mat3 {
  // Frontal: about the sagittal axis (x left, y inferior); positive moves the axis
  // toward +90°. Horizontal: about the vertical axis; positive turns the vector
  // posteriorly (+z), delaying the precordial transition.
  const f = (frontalDeg * Math.PI) / 180, h = (horizontalDeg * Math.PI) / 180;
  const cf = Math.cos(f), sf = Math.sin(f), ch = Math.cos(h), sh = Math.sin(h);
  const Rf: Mat3 = [cf, -sf, 0, sf, cf, 0, 0, 0, 1];
  const Rh: Mat3 = [ch, 0, -sh, 0, 1, 0, sh, 0, ch];
  const out = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let p = 0; p < 3; p++) out[i * 3 + j] += Rh[i * 3 + p] * Rf[p * 3 + j];
  return out;
}
/** 8 × 8 lead-space operator: scale · (D R D⁺ + (I − D D⁺)). */
export function leadOperator(r: Mat3, scale = 1): Float64Array {
  const op = new Float64Array(NL * NL);
  for (let a = 0; a < NL; a++)
    for (let b = 0; b < NL; b++) {
      let dip = 0, proj = 0;
      for (let i = 0; i < 3; i++) {
        let rp = 0;
        for (let j = 0; j < 3; j++) rp += r[i * 3 + j] * PINV[j * NL + b];
        dip += D[a][i] * rp;
        proj += D[a][i] * PINV[i * NL + b];
      }
      op[a * NL + b] = scale * (dip + (a === b ? 1 : 0) - proj);
    }
  return op;
}
/** Points around J over which the QRS operator hands over to the repolarization
 * operator (last QRS points, first ST points). Different gains or rotations on
 * each side would otherwise leave a step at J. */
const J_BLEND = { qrs: 4, st: 12 };

/** Apply one operator per phase to a template (returns a new array). */
export function transform(m: ShapeModel, x: Float64Array, ops: Record<PhaseName, Float64Array>, blendAtJ = true): Float64Array {
  const y = new Float64Array(x.length), q = m.phases.qrs, st = m.phases.st;
  const blendStart = blendAtJ ? q.offset + q.points - J_BLEND.qrs : -1, blendEnd = blendAtJ ? st.offset + J_BLEND.st : -1;
  const mixed = new Float64Array(NL * NL);
  for (const ph of Object.values(m.phases)) {
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      let op = ops[ph.name];
      if (p >= blendStart && p < blendEnd) {
        const w = (p - blendStart + 0.5) / (blendEnd - blendStart);
        for (let k = 0; k < NL * NL; k++) mixed[k] = (1 - w) * ops.qrs[k] + w * ops.st[k];
        op = mixed;
      }
      for (let a = 0; a < NL; a++) {
        let s = 0;
        for (let b = 0; b < NL; b++) s += op[a * NL + b] * x[p * NL + b];
        y[p * NL + a] = s;
      }
    }
  }
  return y;
}

/** Frontal QRS axis from net I and aVF area of the template QRS phase (degrees). */
export function templateAxis(m: ShapeModel, x: Float64Array): number {
  return phaseAxis(m, x, "qrs");
}
/** Peak spatial magnitude (8-lead norm) within one or more phases. */
export function phaseMagnitude(m: ShapeModel, x: Float64Array, names: PhaseName | PhaseName[]): number {
  let best = 0;
  for (const name of [names].flat()) {
    const ph = m.phases[name];
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      let s = 0;
      for (let a = 0; a < NL; a++) s += x[p * NL + a] ** 2;
      best = Math.max(best, Math.sqrt(s));
    }
  }
  return best;
}

export interface PatientTargets {
  /** Learned population the patient is drawn from (default: normal sinus). */
  model?: ModelCode;
  seed: number;
  /** Frontal axes (degrees, net area) of QRS, P and T; null for P or T keeps the
   * patient's own axis relative to the QRS (it turns with the heart). */
  /** null keeps the patient's own QRS axis (ectopic beats have no axis control). */
  axis: number | null;
  pAxis: number | null;
  tAxis: number | null;
  /** Multipliers of the population-median wave magnitudes. */
  pScale: number;
  qrsScale: number;
  tScale: number;
  /** Horizontal-plane rotation of the whole heart vector, degrees. */
  horizontalDeg: number;
  /** Scales multiply the patient's own wave sizes instead of setting them to
   * the population median (ectopic beats keep their real amplitude spread). */
  naturalAmplitude?: boolean;
  /** Pick the stable-axis candidate even without an axis target, so fixing the axis
   * control later rotates the same person (F2.3). */
  stableCandidate?: boolean;
}
export interface Patient {
  model: ShapeModel;
  z: Float64Array;
  pMs: number;
  pqMs: number;
  /** Fraction of the ST-T interval at which the spatial T apex occurs. */
  tApexFraction: number;
  /** The patient's own QRS and ST-T durations (ms) in the learned population. */
  qrsMs: number;
  sttMs: number;
  /** The patient's own RR (ms) at which its durations were measured. */
  rrMs: number;
  /** Net-area frontal axes the template actually has (equal to the targets
   * unless a dominant non-dipolar residual makes a target unreachable). */
  achievedAxes: { p: number; qrs: number; t: number };
  /** Per-phase lead operators that enforce the requested axes and magnitudes. */
  ops: Record<PhaseName, Float64Array>;
  rotations: Record<PhaseName, Mat3>;
  scales: Record<PhaseName, number>;
}

/** Net areas of phases split into the heart-vector (dipolar) part and the
 * non-dipolar residual seen in I and II. */
function netAreas(m: ShapeModel, x: Float64Array, names: PhaseName[]) {
  const dipole = [0, 0, 0];
  let residualI = 0, residualII = 0;
  for (const name of names) {
    const ph = m.phases[name];
    // QRS areas are taken from the QRS-onset level, as electrocardiographs do,
    // so the atrial Ta offset inherited from the TP reference does not count.
    const base = name === "qrs" ? x.slice(ph.offset * NL, ph.offset * NL + NL) : new Float64Array(NL);
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      const y = Array.from({ length: NL }, (_, a) => x[p * NL + a] - base[a]);
      const v = dipoleOf(y);
      for (let i = 0; i < 3; i++) dipole[i] += v[i];
      residualI += y[0] - (D[0][0] * v[0] + D[0][1] * v[1] + D[0][2] * v[2]);
      residualII += y[1] - (D[1][0] * v[0] + D[1][1] * v[1] + D[1][2] * v[2]);
    }
  }
  return { dipole, residualI, residualII };
}

/** Worst-case frontal net area of the QRS (from its onset level) over every heart
 * rotation, relative to its rotation-invariant spatial size; 0 when some axes are
 * unreachable. Small values mean an indeterminate axis that beat jitter or
 * respiration can flip. */
export function axisMargin(m: ShapeModel, x: Float64Array, horizontalDeg = 0): number {
  const areas = netAreas(m, x, ["qrs"]), q = m.phases.qrs;
  let size = 0;
  for (let p = q.offset; p < q.offset + q.points; p++) {
    let s2 = 0;
    for (let a = 0; a < NL; a++) s2 += x[p * NL + a] ** 2;
    size += Math.sqrt(s2);
  }
  // As the heart rotates, the net-area vector traces a closed curve in the
  // (I, aVF) plane. Every axis is reachable only if that curve winds around the
  // origin; the margin is then its closest approach to the origin.
  let worst = Infinity, turned = 0, previous: number | null = null;
  for (let angle = -180; angle <= 180; angle += 2) {
    const r = rotation(angle, horizontalDeg), v = [0, 1, 2].map((i) => r[i * 3] * areas.dipole[0] + r[i * 3 + 1] * areas.dipole[1] + r[i * 3 + 2] * areas.dipole[2]);
    const I = D[0][0] * v[0] + D[0][1] * v[1] + D[0][2] * v[2] + areas.residualI;
    const II = D[1][0] * v[0] + D[1][1] * v[1] + D[1][2] * v[2] + areas.residualII;
    const F = II - I / 2, phi = Math.atan2(F, I);
    worst = Math.min(worst, Math.hypot(I, F));
    if (previous !== null) turned += ((phi - previous + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    previous = phi;
  }
  if (Math.abs(turned) < Math.PI) return 0;
  return worst / Math.max(1e-9, size);
}

/** Frontal axis of one or more phases from net I and aVF area (degrees). */
export function phaseAxis(m: ShapeModel, x: Float64Array, names: PhaseName | PhaseName[]): number {
  let i1 = 0, avf = 0;
  for (const name of [names].flat()) {
    const ph = m.phases[name], b0 = name === "qrs" ? x[ph.offset * NL] : 0, b1 = name === "qrs" ? x[ph.offset * NL + 1] : 0;
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      i1 += x[p * NL] - b0;
      avf += x[p * NL + 1] - b1 - (x[p * NL] - b0) / 2;
    }
  }
  return (Math.atan2(avf, i1) * 180) / Math.PI;
}
/** Regression slope of P and T frontal axes on the QRS axis in 6.574 PTB-XL NORM
 * ECGs (12SL axes): P 0,14 (r = 0,19), T 0,25 (r = 0,38). Index = GROUPS order. */
const AXIS_COUPLING = [0.14, 1, 0.25];

const GROUPS: { phases: PhaseName[]; ref: PhaseName[]; target: (t: PatientTargets) => number | null }[] = [
  { phases: ["pre", "p", "pq"], ref: ["p"], target: (t) => t.pAxis },
  { phases: ["qrs"], ref: ["qrs"], target: (t) => t.axis },
  { phases: ["st", "t", "post"], ref: ["st", "t"], target: (t) => t.tAxis },
];

/** Sample a reproducible patient that honors the case-level targets. */
/** Minimum worst-rotation axis margin a patient needs (≈ 30th percentile of
 * unselected draws): below it the measured axis is unstable. */
export const MIN_AXIS_MARGIN = 0.07;

export function samplePatient(t: PatientTargets): Patient {
  // A patient with an indeterminate frontal axis (tiny net area at some rotation)
  // cannot carry an axis control reliably. The choice depends only on the seed
  // and the horizontal rotation, never on the requested axes: moving an axis
  // control rotates the same person.
  const m = shapeModel(t.model);
  // Without an axis control (ectopic beats keep their own axis) there is nothing
  // to stabilize: the first draw is the patient, unbiased.
  if (t.axis === null && !t.stableCandidate) return sampleCandidate(m, t, 0);
  let chosen = 0, bestMargin = -1;
  for (let attempt = 0; attempt < 16; attempt++) {
    const margin = axisMargin(m, reconstruct(m, candidateZ(m, t.seed, attempt).z), t.horizontalDeg);
    if (margin > bestMargin) { chosen = attempt; bestMargin = margin; }
    if (margin >= MIN_AXIS_MARGIN) break;
  }
  return sampleCandidate(m, t, chosen);
}

function candidateZ(m: ShapeModel, seed: number, attempt: number) {
  const rng = random(((seed ^ 0x5eed1e) + attempt * 0x9e3779b9) >>> 0);
  // The person depends only on the seed: one draw from the population mixture.
  const { weights, means, cholesky } = m.mixture, M = m.names.length;
  let u = rng(), c = 0;
  while (c < weights.length - 1 && u > weights[c]) u -= weights[c++];
  const e = Array.from({ length: M }, () => normal(rng) * m.sampleScale), s: Record<string, number> = {};
  for (let a = 0; a < M; a++) {
    let v = means[c * M + a];
    // Lower triangle stored row by row per component.
    const base = c * ((M * (M + 1)) / 2) + (a * (a + 1)) / 2;
    for (let b = 0; b <= a; b++) v += cholesky[base + b] * e[b];
    s[m.names[a]] = v;
  }
  return { s, z: Float64Array.from({ length: m.k }, (_, i) => s[`z${i}`]) };
}

function sampleCandidate(m: ShapeModel, t: PatientTargets, attempt: number): Patient {
  const pop = m.population.magnitudesP50;
  const { s, z } = candidateZ(m, t.seed, attempt);
  const base = reconstruct(m, z);
  const rotations = {} as Record<PhaseName, Mat3>;
  const achieved = { p: 0, qrs: 0, t: 0 };
  // QRS first. P and T without an explicit target keep the patient's own axes and
  // follow the QRS rotation only as much as real P and T axes co-vary with it.
  let heart = 0;
  for (const gi of [1, 0, 2]) {
    const g = GROUPS[gi];
    // The net-area axis is linear in the template: a rotating dipolar part plus a
    // fixed non-dipolar residual. Scan the whole circle, then refine. When the
    // residual dominates a tiny net area no rotation reaches the target; the
    // closest axis is used and reported as achieved (never claimed as exact).
    const areas = netAreas(m, base, g.ref);
    const axisAt = (angle: number) => {
      const r = rotation(angle, t.horizontalDeg), v = [0, 1, 2].map((i) => r[i * 3] * areas.dipole[0] + r[i * 3 + 1] * areas.dipole[1] + r[i * 3 + 2] * areas.dipole[2]);
      const lead = (k: number) => D[k][0] * v[0] + D[k][1] * v[1] + D[k][2] * v[2];
      const I = lead(0) + areas.residualI, II = lead(1) + areas.residualII;
      return (Math.atan2(II - I / 2, I) * 180) / Math.PI;
    };
    const goal = g.target(t);
    let best = goal === null ? AXIS_COUPLING[gi] * heart : 0;
    if (goal !== null) {
      const err = (a: number) => Math.abs(((goal - axisAt(a) + 540) % 360) - 180);
      for (let a = -180; a < 180; a += 0.5) if (err(a) < err(best)) best = a;
      for (let step = 0.25; step > 1e-4; step /= 2)
        for (const c of [best - step, best + step]) if (err(c) < err(best)) best = c;
    }
    if (gi === 1) heart = best;
    achieved[(["p", "qrs", "t"] as const)[gi]] = axisAt(best);
    for (const ph of g.phases) rotations[ph] = rotation(best, t.horizontalDeg);
  }
  const unit = {} as Record<PhaseName, Float64Array>;
  for (const ph of Object.keys(rotations) as PhaseName[]) unit[ph] = leadOperator(rotations[ph]);
  const rotated = transform(m, base, unit, false);
  const own = t.naturalAmplitude === true;
  const tGain = own ? t.tScale : (pop[2] * t.tScale) / Math.max(1e-6, phaseMagnitude(m, rotated, ["st", "t"]));
  const pGain = own ? t.pScale : (pop[0] * t.pScale) / Math.max(1e-6, phaseMagnitude(m, rotated, "p"));
  const scales: Record<PhaseName, number> = {
    pre: pGain, p: pGain, pq: pGain,
    qrs: own ? t.qrsScale : (pop[1] * t.qrsScale) / Math.max(1e-6, phaseMagnitude(m, rotated, "qrs")),
    st: tGain, t: tGain, post: tGain,
  };
  const ops = {} as Record<PhaseName, Float64Array>;
  for (const ph of Object.keys(scales) as PhaseName[]) ops[ph] = leadOperator(rotations[ph], scales[ph]);
  // Report the axes of the rotated template without gains (a wave scaled to zero
  // keeps its direction; the J hand-over moves them by tenths of a degree at most).
  const final = rotated;
  achieved.p = phaseAxis(m, final, "p");
  achieved.qrs = phaseAxis(m, final, "qrs");
  achieved.t = phaseAxis(m, final, ["st", "t"]);
  return {
    model: m, z, ops, rotations, scales, achievedAxes: achieved, pMs: Math.exp(s.log_p), pqMs: Math.exp(s.log_pq),
    tApexFraction: Math.min(0.9, Math.max(0.35, 1 / (1 + Math.exp(-s.logit_t_apex)))),
    qrsMs: Math.exp(s.log_qrs), sttMs: Math.exp(s.log_stt), rrMs: Math.exp(s.log_rr),
  };
}
