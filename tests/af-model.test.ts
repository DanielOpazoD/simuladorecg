/**
 * F5.1 generator against an independent decoding of af-model.json: spatial
 * covariance and lead order, spectrum (peak, width, harmonic, band edges) and
 * noise independence between seeds.
 */
import { describe, expect, it } from "vitest";
import raw from "../src/engine/realistic/af-model.json";
import { addFibrillationWaves, afMeanPatient, afPatientFromJoint } from "../src/engine/realistic/atrial-fibrillation";

const f32 = (b64: string) => {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  return Array.from(new Float32Array(bytes.buffer));
};
const names = raw.joint.names, mean = f32(raw.joint.mean), at = (z: number[], k: string) => z[names.indexOf(k)];

/** Covariance L·Lᵀ decoded here, independently of the generator. */
function covariance(z: number[]): number[][] {
  const vm = f32(raw.spatial.mean), vb = f32(raw.spatial.basis), k = raw.spatial.k, nv = vm.length;
  const v = vm.slice();
  for (let i = 0; i < k; i++) for (let j = 0; j < nv; j++) v[j] += vb[i * nv + j] * z[names.indexOf(`v${i}`)];
  const L = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let a = 0, p = 0; a < 8; a++) for (let b = 0; b <= a; b++, p++) L[a][b] = a === b ? Math.exp(v[p]) : v[p];
  return L.map((r) => L.map((s) => r.reduce((t, x, i) => t + x * s[i], 0)));
}
function generate(z: number[] | null, seconds: number, seed = 1, fs = 1000) {
  const acc = Array.from({ length: 8 }, () => new Float64Array(seconds * fs));
  addFibrillationWaves(acc, fs, seed, z ? afPatientFromJoint(z) : afMeanPatient());
  return acc;
}
function measuredCovariance(acc: Float64Array[]) {
  const n = acc[0].length;
  return acc.map((x) => acc.map((y) => { let s = 0; for (let i = 0; i < n; i++) s += x[i] * y[i]; return s / n; }));
}
/** Averaged Hann periodogram of one lead at 100 Hz (every 10th sample). */
function psd(x: Float64Array) {
  const y = Array.from(x).filter((_, i) => i % 10 === 0), N = 512, out = new Array(N / 2).fill(0);
  let count = 0;
  for (let s = 0; s + N <= y.length; s += N / 2, count++)
    for (let k = 0; k < N / 2; k++) {
      let re = 0, im = 0;
      for (let t = 0; t < N; t++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / (N - 1)), a = (2 * Math.PI * k * t) / N;
        re += w * y[s + t] * Math.cos(a); im -= w * y[s + t] * Math.sin(a);
      }
      out[k] += re * re + im * im;
    }
  return { f: out.map((_, k) => (k * 100) / N), p: out.map((v) => v / count) };
}

describe("F5.1: generador de ondas f frente a una decodificación independiente del modelo", () => {
  it("la covarianza entre derivaciones medida reproduce L·Lᵀ del modelo, derivación por derivación", () => {
    const C = covariance(mean), M = measuredCovariance(generate(null, 120));
    let num = 0, den = 0;
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { num += (M[a][b] - C[a][b]) ** 2; den += C[a][b] ** 2; }
    expect(Math.sqrt(num / den)).toBeLessThan(0.1);
    for (let a = 0; a < 8; a++) expect(Math.sqrt(M[a][a] / C[a][a])).toBeGreaterThan(0.9);
  });
  it("los modos espaciales del modelo cambian la covarianza como dice el modelo", () => {
    const z = mean.slice();
    z[names.indexOf("v0")] += 1.5; z[names.indexOf("v1")] -= 1;
    const C = covariance(z), C0 = covariance(mean), M = measuredCovariance(generate(z, 120));
    let num = 0, den = 0, shift = 0;
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      num += (M[a][b] - C[a][b]) ** 2; den += C[a][b] ** 2; shift += (C[a][b] - C0[a][b]) ** 2;
    }
    expect(Math.sqrt(shift / den)).toBeGreaterThan(0.2); // the modes do move the covariance
    expect(Math.sqrt(num / den)).toBeLessThan(0.1);
  });
  it("el espectro medido sigue el pico, el ancho, el armónico y los bordes de banda del paciente", () => {
    const z = mean.slice();
    z[names.indexOf("dominant_hz")] = 4.5; z[names.indexOf("harmonic")] = 0.6;
    z[names.indexOf("log_width")] = Math.log(0.8); z[names.indexOf("peak")] = Math.max(1.2, at(mean, "peak"));
    const peak = at(z, "peak"), g = (f: number, c: number, w: number) => Math.exp(-0.5 * ((f - c) / w) ** 2);
    const theory = (f: number) => 10 ** (peak * (g(f, 4.5, 0.8) + 0.6 * g(f, 9, 1.2))) - 1 + 0.02;
    const { f, p } = psd(generate(z, 200)[2]);
    const inBand = f.map((x, i) => (x >= 3 && x <= 12 ? i : -1)).filter((i) => i >= 0);
    const best = inBand.reduce((a, i) => (p[i] > p[a] ? i : a), inBand[0]);
    expect(Math.abs(f[best] - 4.5)).toBeLessThan(0.4);
    // Harmonic: power near 2F well above the inter-peak trough, as in theory.
    const near = (c: number) => p[Math.round((c * 512) / 100)];
    expect(near(9) / near(6.75)).toBeGreaterThan(0.3 * (theory(9) / theory(6.75)));
    // Shape: log-spectrum correlates with the theoretical one inside the band.
    const lm = inBand.map((i) => Math.log(p[i])), lt = inBand.map((i) => Math.log(theory(f[i])));
    const mu = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length, a0 = mu(lm), b0 = mu(lt);
    const r = lm.reduce((s, v, i) => s + (v - a0) * (lt[i] - b0), 0) /
      Math.sqrt(lm.reduce((s, v) => s + (v - a0) ** 2, 0) * lt.reduce((s, v) => s + (v - b0) ** 2, 0));
    expect(r).toBeGreaterThan(0.85);
    // Band edges: almost no power below 2 Hz or above 13.5 Hz.
    const total = p.reduce((a, b) => a + b, 0), outside = p.reduce((a, v, i) => a + (f[i] < 2 || f[i] > 13.5 ? v : 0), 0);
    expect(outside / total).toBeLessThan(0.03);
  });
  it("el ancho del pico a media potencia sigue el del paciente", () => {
    const fwhm = (f: number[], p: number[], lo: number, hi: number) => {
      const idx = f.map((x, i) => (x >= lo && x <= hi ? i : -1)).filter((i) => i >= 0);
      const top = Math.max(...idx.map((i) => p[i]));
      return idx.filter((i) => p[i] >= top / 2).length * (f[1] - f[0]);
    };
    for (const width of [0.35, 1.4]) {
      const z = mean.slice();
      z[names.indexOf("dominant_hz")] = 6; z[names.indexOf("harmonic")] = 0;
      z[names.indexOf("log_width")] = Math.log(width); z[names.indexOf("peak")] = 1.5;
      const g = (f: number) => 10 ** (1.5 * Math.exp(-0.5 * ((f - 6) / width) ** 2)) - 1 + 0.02;
      const grid = Array.from({ length: 1000 }, (_, i) => 3 + i * 0.009);
      const expected = fwhm(grid, grid.map(g), 3, 12);
      const { f, p } = psd(generate(z, 200)[2]);
      const measured = fwhm(f, p, 3, 12);
      expect(measured / expected).toBeGreaterThan(0.6);
      expect(measured / expected).toBeLessThan(1.8);
    }
  });
  it("cada semilla genera su propio ruido aunque el paciente sea el mismo", () => {
    const a = generate(null, 10, 1)[2], b = generate(null, 10, 2)[2];
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
    expect(Math.abs(ab / Math.sqrt(aa * bb))).toBeLessThan(0.2);
  });
});
