import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import type { ECGCase } from "../src/engine/types";
import { fromPreset, patchCase, presetById } from "../src/presets/catalog";
import { realisticPatient } from "../src/engine/realistic/engine";
import { changeCase } from "../src/ui/case-state";

function load(id: string, patch: Partial<ECGCase> = {}): ECGCase {
  return patchCase(fromPreset(presetById(id)!), { filter: "off", variability: 0, ...patch });
}
const wrap = (d: number) => Math.abs(((d + 540) % 360) - 180);

// Own file: the learned-patient cache is module state, so the order of the
// syntheses below must not be shared with other suites.
describe("caché de pacientes aprendidos", () => {
  // As in the interface: the rhythm changes on the same patient (seed, axis and
  // amplitudes kept), and the worker keeps its cache between requests.
  const sinusAt = (seed: number) => changeCase(load("sinus", { seed }), "axis", 50);
  const pacedOf = (c: ECGCase) => changeCase(c, "rhythm", "paced");
  it("un caso sin latidos conducidos no presta su paciente al sinusal con la misma semilla", () => {
    const sinus = sinusAt(5353), paced = pacedOf(sinus);
    // Paced first: its patient keeps the natural axis (no QRS axis control applies).
    synthesize(paced, 10);
    expect(realisticPatient(sinus)).not.toBe(realisticPatient(paced));
    expect(wrap(synthesize(sinus, 10).truth.axis! - sinus.axis)).toBeLessThan(5);
  });
  it("el paciente de un caso sin latidos conducidos no depende del sinusal sintetizado antes", () => {
    const sinus = sinusAt(4343), paced = pacedOf(sinus);
    // The axis control does not apply without conducted beats: any value gives the same patient.
    const own = realisticPatient({ ...paced, axis: paced.axis + 40 }).achievedAxes;
    synthesize(sinus, 10);
    expect(realisticPatient(paced).achievedAxes).toEqual(own);
  });
});

describe("eje QRS medido en el borde del búfer", () => {
  it("un QRS ancho que termina tras el búfer no vuelve NaN el eje", () => {
    for (const [id, patch] of [["lbbb", { pr: 400 }], ["complete", { qrs: 240 }]] as const) {
      const s = synthesize(load(id, patch), 10);
      expect(Number.isFinite(s.truth.axis), id).toBe(true);
    }
  });
  it("el eje es finito a toda frecuencia en bloqueos de rama", () => {
    for (const id of ["lbbb", "rbbb"])
      for (const hr of [50, 75, 84, 100, 109, 118]) {
        const s = synthesize(load(id, { hr }), 30);
        expect(Number.isFinite(s.truth.axis), `${id} ${hr}`).toBe(true);
      }
  });
});
