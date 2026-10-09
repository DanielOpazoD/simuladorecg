import { describe, expect, it } from "vitest";
import {
  leadOperator, phaseAxis, phaseMagnitude, reconstruct, rotation, samplePatient, shapeModel,
  templateAxis, transform, type PatientTargets,
} from "../src/engine/realistic/shape-model";

const base: PatientTargets = {
  seed: 2026, axis: 55, pAxis: null, tAxis: null,
  pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: 0,
};
const identityOps = () => {
  const op = leadOperator(rotation(0, 0));
  return { p: op, pq: op, qrs: op, st: op, t: op, post: op };
};

describe("modelo de forma del latido normal", () => {
  it("carga un modelo coherente aprendido de muchos pacientes", () => {
    const m = shapeModel();
    expect(m.k).toBe(64);
    expect(m.dim).toBe(m.points * 8);
    expect(m.basis.length).toBe(m.k * m.dim);
    expect(m.names.length).toBe(m.k + 11);
    expect(m.jointCov.length).toBe(m.names.length ** 2);
  });

  it("la rotación nula con escala 1 deja el latido intacto, incluido lo no dipolar", () => {
    const m = shapeModel(), x = reconstruct(m, new Float64Array(m.k));
    const y = transform(m, x, identityOps());
    for (let i = 0; i < x.length; i++) expect(y[i]).toBeCloseTo(x[i], 10);
  });

  it("rotar el corazón conserva el residuo no dipolar", () => {
    const m = shapeModel(), x = reconstruct(m, new Float64Array(m.k));
    const op = leadOperator(rotation(30, 20)), back = leadOperator(rotation(-30, 0));
    const once = transform(m, x, { p: op, pq: op, qrs: op, st: op, t: op, post: op });
    const r2 = leadOperator(rotation(0, -20));
    const undone = transform(m, transform(m, once, { p: r2, pq: r2, qrs: r2, st: r2, t: r2, post: r2 }), { p: back, pq: back, qrs: back, st: back, t: back, post: back });
    for (let i = 0; i < x.length; i++) expect(undone[i]).toBeCloseTo(x[i], 9);
  });

  it("cumple exactamente el eje frontal y las magnitudes pedidas", () => {
    for (const axis of [-30, 0, 30, 55, 80, 100]) {
      const p = samplePatient({ ...base, axis, qrsScale: 1.4, tScale: 0.7 });
      const x = transform(p.model, reconstruct(p.model, p.z), p.ops);
      expect(Math.abs(templateAxis(p.model, x) - axis)).toBeLessThan(0.5);
      const q = samplePatient({ ...base, axis, pAxis: 60, tAxis: 30 }), y = transform(q.model, reconstruct(q.model, q.z), q.ops);
      expect(Math.abs(phaseAxis(q.model, y, "p") - 60)).toBeLessThan(0.5);
      expect(Math.abs(phaseAxis(q.model, y, ["st", "t"]) - 30)).toBeLessThan(0.5);
      const pop = p.model.population.magnitudesP50;
      expect(phaseMagnitude(p.model, x, "qrs")).toBeCloseTo(pop[1] * 1.4, 6);
      expect(phaseMagnitude(p.model, x, ["st", "t"])).toBeCloseTo(pop[2] * 0.7, 6);
    }
  });

  it("cada semilla es un paciente distinto y reproducible", () => {
    const a = samplePatient(base), b = samplePatient(base), c = samplePatient({ ...base, seed: 7 });
    expect(Array.from(a.z)).toEqual(Array.from(b.z));
    const d = Array.from(a.z).reduce((s, v, i) => s + (v - c.z[i]) ** 2, 0);
    expect(d).toBeGreaterThan(1);
  });

  it("las duraciones auriculares muestreadas son fisiológicas", () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = samplePatient({ ...base, seed });
      expect(p.pMs).toBeGreaterThan(60);
      expect(p.pMs).toBeLessThan(160);
      expect(p.pqMs).toBeGreaterThan(5);
    }
  });

  it("un latido normal tiene la polaridad clásica: R dominante en II y V5, P y T positivas en II", () => {
    const p = samplePatient(base), m = p.model, x = transform(m, reconstruct(m, p.z), p.ops);
    const lead = (name: number, phase: "p" | "qrs" | "t") => {
      const ph = m.phases[phase], v = Array.from({ length: ph.points }, (_, i) => x[(ph.offset + i) * 8 + name]);
      return { max: Math.max(...v), min: Math.min(...v) };
    };
    const II = 1, V1 = 2, V5 = 6;
    expect(lead(II, "qrs").max).toBeGreaterThan(-lead(II, "qrs").min);
    expect(lead(V5, "qrs").max).toBeGreaterThan(-lead(V5, "qrs").min);
    expect(-lead(V1, "qrs").min).toBeGreaterThan(lead(V1, "qrs").max);
    expect(lead(II, "p").max).toBeGreaterThan(0.04);
    expect(lead(II, "t").max).toBeGreaterThan(0.1);
  });
});

describe("propiedades sobre muchos pacientes", () => {
  const seeds = Array.from({ length: 120 }, (_, i) => 1 + i * 37);
  it("el eje informado es siempre el que tiene la plantilla, y casi siempre el pedido", () => {
    for (const axis of [-90, 55, 150, 180]) {
      let exact = 0;
      for (const seed of seeds) {
        // Activation axis (no J hand-over to the repolarization gain).
        const p = samplePatient({ ...base, seed, axis }), x = transform(p.model, reconstruct(p.model, p.z), p.ops, false);
        expect(Math.abs(((templateAxis(p.model, x) - p.achievedAxes.qrs + 540) % 360) - 180)).toBeLessThan(0.05);
        if (Math.abs(((p.achievedAxes.qrs - axis + 540) % 360) - 180) < 1) exact++;
      }
      expect(exact / seeds.length).toBe(1);
    }
  });
  it("no hay escalón en J aunque QRS y T tengan ganancias muy distintas", () => {
    for (const [qrsScale, tScale] of [[1, 1], [1, 3.6], [3, 1], [0.1, 3.6]]) {
      let worst = 0;
      for (const seed of seeds.slice(0, 40)) {
        const p = samplePatient({ ...base, seed, qrsScale, tScale }), m = p.model, y = transform(m, reconstruct(m, p.z), p.ops);
        const j = m.phases.st.offset, before = j - 1;
        for (let l = 0; l < 8; l++) worst = Math.max(worst, Math.abs(y[j * 8 + l] - y[before * 8 + l]));
      }
      expect(worst).toBeLessThan(0.06);
    }
  });
});
