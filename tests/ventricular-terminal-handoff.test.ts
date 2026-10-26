import { describe, expect, it } from "vitest";
import { addAtrial, addVentricular } from "../src/engine/realistic/beat";
import { realisticPatient } from "../src/engine/realistic/engine";
import { fromPreset, presetById } from "../src/presets/catalog";

describe("final ventricular aprendido sin cola auricular", () => {
  const patient = realisticPatient(fromPreset(presetById("sinus")!));
  const level = Float64Array.from({ length: 8 }, (_, l) => (l % 2 ? 1 : -1) * (l + 1) * 0.01);
  const flat = Float64Array.from({ length: patient.model.dim }, (_, i) => level[i % 8]);
  const buffers = (fs: number) => Array.from({ length: 8 }, () => new Float64Array(2 * fs));
  const qrsMs = 80, sttMs = 250, postMs = patient.model.postMs;

  // A constant template has a closed-form terminal ramp and cosine taper. The
  // expected value comes from that analytic envelope, without a QRS detector.
  const terminalValue = (value: number, elapsedMs: number) => {
    const w = Math.min(1, Math.max(0, (elapsedMs - qrsMs - sttMs) / postMs));
    return value * (1 - w) * (w > 0.8 ? 0.5 * (1 + Math.cos(Math.PI * (w - 0.8) / 0.2)) : 1);
  };

  it.each([500, 1000])("el final conserva su envolvente analítica en la rejilla y entre muestras (%s Hz)", (fs) => {
    for (const start of [0.059, 0.05900001, 0.05925, 0.0595, 0.059999, 0.25]) {
      const acc = buffers(fs), durationMs = qrsMs + sttMs + postMs;
      const last = Math.floor(start * fs + durationMs * fs / 1000);
      addVentricular(acc, fs, start, qrsMs, sttMs, flat, patient, 1);
      for (let l = 0; l < 8; l++) {
        for (let i = last - 8; i <= last; i++)
          expect(acc[l][i], `inicio ${start}, derivación ${l}, muestra ${i}`).toBeCloseTo(terminalValue(level[l], (i / fs - start) * 1000), 12);
        expect(acc[l].subarray(last + 1).every(v => v === 0), `soporte final, ${start}, ${l}`).toBe(true);
      }
    }
  });

  it.each([0, 1, 2])("una ULP tras el post-T no añade una cola Ta (fracción heredada %s)", (taKeep) => {
    const acc = buffers(1000), start = 0.059, totalMs = qrsMs + sttMs + postMs;
    const last = Math.floor(start * 1000 + totalMs);
    expect(last).toBe(649);
    expect((last / 1000 - start) * 1000).toBeGreaterThan(totalMs);
    addVentricular(acc, 1000, start, qrsMs, sttMs, flat, patient, taKeep);
    for (let l = 0; l < 8; l++) {
      expect(acc[l][last]).toBeCloseTo(0, 12);
      expect(Math.abs(acc[l][last] - acc[l][last - 1])).toBeLessThan(1e-6);
      expect(acc[l][last + 1]).toBe(0);
    }
  });

  it("la P bloqueada conserva su nivel y su cola exponencial en ese mismo borde numérico", () => {
    const acc = buffers(1000);
    // 0.008 + 0.203 is just past sample 211; elapsed is 283 ms + one ULP.
    addAtrial(acc, 1000, 0.008, 100, 103, flat, patient);
    for (let l = 0; l < 8; l++) {
      expect(acc[l][211]).toBeCloseTo(level[l], 12);
      expect(acc[l][291]).toBeCloseTo(level[l] / Math.E, 12);
      expect(acc[l][612]).toBe(0);
    }
  });
});
