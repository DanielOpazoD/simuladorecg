import { describe, expect, it } from "vitest";
import { addAtrial, addVentricular } from "../src/engine/realistic/beat";
import { realisticPatient, RealisticTrack } from "../src/engine/realistic/engine";
import { reconstruct, transform } from "../src/engine/realistic/shape-model";
import { fromPreset, presetById } from "../src/presets/catalog";

const buffers = (fs: number) => Array.from({ length: 8 }, () => new Float64Array(2 * fs));

describe("unión PR–QRS de las plantillas aprendidas", () => {
  // An analytic constant-level fixture makes any one-sample duplication visible
  // without a detector, noise, filtering or a learned fiducial as its oracle.
  const p = realisticPatient(fromPreset(presetById("sinus")!));
  const level = Float64Array.from({ length: 8 }, (_, l) => -(l + 1) * 0.01);
  const flat = new Float64Array(p.model.dim);
  for (let i = 0; i < flat.length; i++) flat[i] = level[i % 8];

  it.each([500, 1000])("un único nivel en la frontera, a %s Hz", (fs) => {
    const acc = buffers(fs), onset = 0.5;
    addAtrial(acc, fs, 0.25, 100, 150, flat, p, level);
    addVentricular(acc, fs, onset, 100, 300, flat, p, 1);
    for (let l = 0; l < 8; l++) {
      expect(acc[l][onset * fs - 1]).toBeCloseTo(level[l], 12);
      expect(acc[l][onset * fs]).toBeCloseTo(level[l], 12);
      expect(acc[l][onset * fs + 1]).toBeCloseTo(level[l], 12);
    }
  });

  it.each([500, 1000])("los soportes no se solapan aunque el QRS no caiga en la rejilla (%s Hz)", (fs) => {
    for (const start of [0.25, 0.250001, 0.25025, 0.2505, 0.250999, 0.417]) {
      const acc = buffers(fs), onset = start + 0.25, firstQrs = Math.ceil(onset * fs);
      addAtrial(acc, fs, start, 100, 150, flat, p, level);
      for (let l = 0; l < 8; l++) {
        expect(acc[l][firstQrs - 1], `última muestra PR, ${start}, ${l}`).toBeCloseTo(level[l], 12);
        expect(acc[l].subarray(firstQrs).every((v) => v === 0), `soporte auricular, ${start}, ${l}`).toBe(true);
      }
    }
  });

  it("la frontera conserva la Ta escalada con la P, incluso con amplitud cero", () => {
    for (const gain of [0, 0.5, 1, 2]) {
      const acc = buffers(1000), target = level.map(v => v * gain);
      addAtrial(acc, 1000, 0.25, 100, 150, flat, p, target);
      addVentricular(acc, 1000, 0.5, 100, 300, flat, p, gain);
      for (let l = 0; l < 8; l++) expect(acc[l][500], `ganancia P ${gain}, ${l}`).toBeCloseTo(target[l], 12);
    }
  });

  it.each([0, 2])("una muestra PR recuperada por redondeo conserva el destino (ganancia %s)", (gain) => {
    // The calendar's QRS is just beyond sample 211. Rebuilding elapsed time
    // from the pre-P lead-in yields 283.00000000000006 ms for 283 ms of phases:
    // that last conducted sample must not become an unscaled blocked-P tail.
    const start = 0.008, pr = 0.20300000000000001, onset = start + pr;
    expect(onset).toBe(0.21100000000000002);
    const acc = buffers(1000), target = level.map(v => v * gain);
    addAtrial(acc, 1000, start, 100, pr * 1000 - 100, flat, p, target, onset);
    for (let l = 0; l < 8; l++) {
      expect(acc[l][211], `última muestra conducida, ${l}`).toBeCloseTo(target[l], 12);
      expect(acc[l].subarray(212).every(v => v === 0), `inicio ventricular, ${l}`).toBe(true);
    }
  });

  it("una P bloqueada conserva su Ta y su decaimiento, sin recortarla como una P conducida", () => {
    const acc = buffers(1000);
    addAtrial(acc, 1000, 0.25, 100, 150, flat, p);
    for (let l = 0; l < 8; l++) {
      expect(acc[l][500]).toBeCloseTo(level[l], 12);
      expect(acc[l][580]).toBeCloseTo(level[l] / Math.E, 12);
      expect(acc[l][901]).toBe(0);
    }
  });

  it("las ocho poblaciones conservan el nivel ventricular una sola vez (32 pacientes)", () => {
    for (const id of ["sinus", "lbbb", "rbbb", "irbbb", "lafb", "lvh", "old_inferior", "old_anterior"])
      for (const seed of [1, 13, 157, 12066]) {
        const patient = realisticPatient({ ...fromPreset(presetById(id)!), seed });
        const x = transform(patient.model, reconstruct(patient.model, patient.z), patient.ops);
        const o = patient.model.phases.qrs.offset * 8, target = x.slice(o, o + 8);
        const acc = buffers(1000);
        addAtrial(acc, 1000, 0.25, 100, 150, x, patient, target);
        addVentricular(acc, 1000, 0.5, 100, 300, x, patient, 1);
        for (let l = 0; l < 8; l++) expect(acc[l][500], `${id}, ${seed}, ${l}`).toBeCloseTo(target[l], 12);
      }
  });

  it("el calendario cede al QRS su primera muestra sin añadir una cola auricular", () => {
    const c = fromPreset(presetById("sinus")!);
    for (const time of [0.22, 0.220001, 0.2205, 0.417])
      for (const pr of [0.12, 0.16, 0.26, 0.31000000000000005]) {
        const track = new RealisticTrack(c, 2000, 1000), onset = time + pr;
        track.prepare([{ time: onset, kind: "normal", pr, rr: 1, qrs: 0.09, qt: 0.4 }]);
        track.addAtrial({ time, pr, conducted: true, kind: "sinus" });
        for (const lead of track.acc) expect(lead.subarray(Math.ceil(onset * 1000)).every((v) => v === 0)).toBe(true);
      }
  });
});
