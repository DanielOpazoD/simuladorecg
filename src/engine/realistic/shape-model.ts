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
export type PhaseName = "p" | "pq" | "qrs" | "st" | "t" | "post";
const NL = MODEL_LEADS.length;

export interface PhaseLayout { name: PhaseName; points: number; offset: number }
export interface ShapeModel {
  k: number;
  dim: number;
  points: number;
  phases: Record<PhaseName, PhaseLayout>;
  postMs: number;
  mean: Float64Array;
  basis: Float64Array; // k × dim
  names: string[];
  jointMean: Float64Array;
  jointCov: Float64Array; // m × m
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

let cached: ShapeModel | null = null;
export function shapeModel(): ShapeModel {
  if (cached) return cached;
  const k = raw.components, mean = decodeFloat32(raw.mean), dim = mean.length;
  const b16 = decodeInt16(raw.basis), basis = new Float64Array(k * dim);
  for (let i = 0; i < k; i++)
    for (let j = 0; j < dim; j++) basis[i * dim + j] = b16[i * dim + j] * raw.basisScale[i];
  const phases = {} as Record<PhaseName, PhaseLayout>;
  let offset = 0;
  for (const p of raw.phases) {
    phases[p.name as PhaseName] = { name: p.name as PhaseName, points: p.points, offset };
    offset += p.points;
  }
  if (offset * NL !== dim) throw new Error("Modelo de forma inconsistente.");
  cached = {
    k, dim, points: offset, phases, postMs: raw.postMs, mean, basis,
    names: raw.joint.names, jointMean: Float64Array.from(raw.joint.mean),
    jointCov: Float64Array.from(raw.joint.cov), population: raw.population,
  };
  return cached;
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
  const q = m.phases.qrs;
  let i1 = 0, avf = 0;
  for (let p = q.offset; p < q.offset + q.points; p++) {
    i1 += x[p * NL];
    avf += x[p * NL + 1] - x[p * NL] / 2;
  }
  return (Math.atan2(avf, i1) * 180) / Math.PI;
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
  seed: number;
  /** Frontal axes (degrees, net area) of QRS, P and T; null keeps the sampled one. */
  axis: number;
  pAxis: number | null;
  tAxis: number | null;
  /** Multipliers of the population-median wave magnitudes. */
  pScale: number;
  qrsScale: number;
  tScale: number;
  /** Horizontal-plane rotation of the whole heart vector, degrees. */
  horizontalDeg: number;
}
export interface Patient {
  model: ShapeModel;
  z: Float64Array;
  pMs: number;
  pqMs: number;
  /** Fraction of the ST-T interval at which the spatial T apex occurs. */
  tApexFraction: number;
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
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      const v = dipoleOf(x, p * NL);
      for (let i = 0; i < 3; i++) dipole[i] += v[i];
      residualI += x[p * NL] - (D[0][0] * v[0] + D[0][1] * v[1] + D[0][2] * v[2]);
      residualII += x[p * NL + 1] - (D[1][0] * v[0] + D[1][1] * v[1] + D[1][2] * v[2]);
    }
  }
  return { dipole, residualI, residualII };
}

/** Frontal axis of one or more phases from net I and aVF area (degrees). */
export function phaseAxis(m: ShapeModel, x: Float64Array, names: PhaseName | PhaseName[]): number {
  let i1 = 0, avf = 0;
  for (const name of [names].flat()) {
    const ph = m.phases[name];
    for (let p = ph.offset; p < ph.offset + ph.points; p++) {
      i1 += x[p * NL];
      avf += x[p * NL + 1] - x[p * NL] / 2;
    }
  }
  return (Math.atan2(avf, i1) * 180) / Math.PI;
}
const GROUPS: { phases: PhaseName[]; ref: PhaseName[]; target: (t: PatientTargets) => number | null }[] = [
  { phases: ["p", "pq"], ref: ["p"], target: (t) => t.pAxis },
  { phases: ["qrs"], ref: ["qrs"], target: (t) => t.axis },
  { phases: ["st", "t", "post"], ref: ["st", "t"], target: (t) => t.tAxis },
];

/** Sample a reproducible patient that honors the case-level targets. */
export function samplePatient(t: PatientTargets): Patient {
  // A patient whose frontal net area is nearly zero (indeterminate axis) cannot be
  // rotated to every requested axis. The seed then moves deterministically to the
  // next candidate, so the axis controls always hold; the best attempt is kept.
  let best: Patient | null = null, bestErr = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    const p = sampleCandidate(t, attempt);
    const miss = (got: number, goal: number | null) => (goal === null ? 0 : Math.abs(((got - goal + 540) % 360) - 180));
    const err = Math.max(miss(p.achievedAxes.qrs, t.axis), miss(p.achievedAxes.p, t.pAxis), miss(p.achievedAxes.t, t.tAxis));
    if (err < bestErr) { best = p; bestErr = err; }
    if (err < 1) break;
  }
  return best!;
}

function sampleCandidate(t: PatientTargets, attempt: number): Patient {
  const m = shapeModel(), pop = m.population.magnitudesP50;
  const rng = random(((t.seed ^ 0x5eed1e) + attempt * 0x9e3779b9) >>> 0);
  // Unconditional draw: the person depends only on the seed.
  const known: Record<string, number> = {};
  const s = sampleConditional(m, known, rng);
  const z = Float64Array.from({ length: m.k }, (_, i) => s[`z${i}`]);
  const base = reconstruct(m, z);
  const rotations = {} as Record<PhaseName, Mat3>;
  const achieved = { p: 0, qrs: 0, t: 0 };
  for (const [gi, g] of GROUPS.entries()) {
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
    let best = 0;
    if (goal !== null) {
      const err = (a: number) => Math.abs(((goal - axisAt(a) + 540) % 360) - 180);
      for (let a = -180; a < 180; a += 0.5) if (err(a) < err(best)) best = a;
      for (let step = 0.25; step > 1e-4; step /= 2)
        for (const c of [best - step, best + step]) if (err(c) < err(best)) best = c;
    }
    achieved[(["p", "qrs", "t"] as const)[gi]] = axisAt(best);
    for (const ph of g.phases) rotations[ph] = rotation(best, t.horizontalDeg);
  }
  const unit = {} as Record<PhaseName, Float64Array>;
  for (const ph of Object.keys(rotations) as PhaseName[]) unit[ph] = leadOperator(rotations[ph]);
  const rotated = transform(m, base, unit, false);
  const tGain = (pop[2] * t.tScale) / Math.max(1e-6, phaseMagnitude(m, rotated, ["st", "t"]));
  const pGain = (pop[0] * t.pScale) / Math.max(1e-6, phaseMagnitude(m, rotated, "p"));
  const scales: Record<PhaseName, number> = {
    p: pGain, pq: pGain,
    qrs: (pop[1] * t.qrsScale) / Math.max(1e-6, phaseMagnitude(m, rotated, "qrs")),
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
  };
}
