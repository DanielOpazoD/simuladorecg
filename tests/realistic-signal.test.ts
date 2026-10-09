import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { LEADS, type ECGCase, type Signal } from "../src/engine/types";
import { fromPreset, presetById, PRESETS, TEXTBOOK_SEED } from "../src/presets/catalog";
import { usesRealisticBase } from "../src/engine/realistic/engine";

function load(id: string, patch: Partial<ECGCase> = {}): ECGCase {
  return { ...fromPreset(presetById(id)!), filter: "off", variability: 0, ...patch };
}
function maxDiff(a: Signal, b: Signal, start: number, end: number) {
  let max = 0;
  for (const lead of LEADS)
    for (let i = Math.ceil(start * a.fs); i < Math.floor(end * a.fs); i++)
      max = Math.max(max, Math.abs(a.leads[lead][i] - b.leads[lead][i]));
  return max;
}
function peak(s: Signal, start: number, end: number) {
  let max = 0;
  for (const lead of LEADS)
    for (let i = Math.ceil(start * s.fs); i < Math.floor(end * s.fs); i++) max = Math.max(max, Math.abs(s.leads[lead][i]));
  return max;
}

describe("alcance de la base aprendida (F2)", () => {
  it("cubre los ritmos supraventriculares con conducción normal y nada más", () => {
    const learned = PRESETS.filter((p) => p.strategy !== "pending" && usesRealisticBase(fromPreset(p))).map((p) => p.id);
    for (const id of ["sinus", "brady", "tachy", "rsa", "af", "flutter", "junctional", "pac", "av1", "wenckebach", "complete", "longqt"])
      expect(learned).toContain(id);
    for (const id of ["pvc", "vt", "vvi", "rbbb", "lbbb", "wpw", "anterior", "lvh", "hyperk", "complete_v"])
      expect(learned).not.toContain(id);
  });
  it("los presets aprendidos muestran el paciente de libro; la semilla del caso manda", () => {
    expect(fromPreset(presetById("sinus")!).seed).toBe(TEXTBOOK_SEED);
    expect(fromPreset(presetById("wpw")!).seed).not.toBe(TEXTBOOK_SEED);
  });
});

describe("amplitud de T sobre la base aprendida", () => {
  const c = load("sinus", { hr: 60 });
  const zero = synthesize({ ...c, tAmp: 0 }, 10), half = synthesize({ ...c, tAmp: 0.14 }, 10), full = synthesize({ ...c, tAmp: 0.28 }, 10);
  const b = full.events.beats[3], j = b.time + b.qrs!;

  it("escala la repolarización de forma exactamente lineal", () => {
    let response = 0, error = 0;
    for (const lead of LEADS)
      for (let i = 0; i < full.leads[lead].length; i += 3) {
        const delta = full.leads[lead][i] - zero.leads[lead][i];
        response = Math.max(response, Math.abs(delta));
        error = Math.max(error, Math.abs(half.leads[lead][i] - zero.leads[lead][i] - delta / 2));
      }
    expect(response).toBeGreaterThan(0.1);
    expect(error).toBeLessThan(1e-12);
  });
  it("no toca P ni QRS (fuera del soporte de ±40 ms del filtro antialias)", () => {
    expect(maxDiff(zero, full, b.time - 0.25, j - 0.041)).toBeLessThan(1e-12);
  });
  it("con T = 0 solo queda la cola de la onda Ta auricular (µV), no repolarización ventricular", () => {
    const window: [number, number] = [j + 0.1, b.time + b.qt! - 0.01];
    expect(peak(full, ...window)).toBeGreaterThan(0.1);
    expect(peak(zero, ...window)).toBeLessThan(0.005);
  });
});

describe("amplitud de P sobre la base aprendida", () => {
  it("P = 0 elimina por completo la onda P y su repolarización auricular", () => {
    const c = load("sinus", { hr: 60 }), s = synthesize({ ...c, pAmp: 0 }, 10), a = s.events.atria[3];
    expect(peak(s, a.time, a.time + 0.09)).toBeLessThan(1e-12);
  });
  it("duplicar P duplica exactamente la componente auricular", () => {
    const c = load("sinus", { hr: 60 }), base = synthesize({ ...c, pAmp: 0 }, 10);
    const one = synthesize({ ...c, pAmp: 0.15 }, 10), two = synthesize({ ...c, pAmp: 0.3 }, 10);
    let error = 0;
    for (const lead of LEADS)
      for (let i = 0; i < one.leads[lead].length; i += 3)
        error = Math.max(error, Math.abs(two.leads[lead][i] - base.leads[lead][i] - 2 * (one.leads[lead][i] - base.leads[lead][i])));
    expect(error).toBeLessThan(1e-12);
  });
});

describe("controles y paciente", () => {
  it("el eje QRS pedido se cumple en el trazado (área neta I/aVF, promedio de latidos)", () => {
    for (const axis of [-20, 30, 75]) {
      const s = synthesize(load("sinus", { axis }), 10);
      let i1 = 0, avf = 0;
      for (const b of s.events.beats.slice(1, -1))
        for (let k = Math.ceil(b.time * s.fs); k < Math.floor((b.time + b.qrs!) * s.fs); k++) {
          i1 += s.leads.I[k];
          avf += s.leads.aVF[k];
        }
      // The template honors the axis exactly; the trace adds beat jitter,
      // respiratory rotation and the atrial Ta tail inside the QRS window, which
      // move the net-area axis a few degrees (clinical reading: ±10–15°).
      expect(Math.abs((Math.atan2(avf, i1) * 180) / Math.PI - axis)).toBeLessThan(8);
    }
  });
  it("misma semilla y caso: señal idéntica; otra semilla: otra persona", () => {
    const c = load("sinus"), a = synthesize(c, 10), b = synthesize(c, 10), d = synthesize({ ...c, seed: 7 }, 10);
    for (const lead of LEADS) expect(b.leads[lead]).toEqual(a.leads[lead]);
    expect(maxDiff(a, d, 0, 10)).toBeGreaterThan(0.05);
  });
  it("conserva Einthoven y Goldberger muestra a muestra", () => {
    const s = synthesize(load("sinus"), 10);
    for (let i = 0; i < s.leads.I.length; i += 7) {
      const a = s.leads.I[i], b = s.leads.II[i];
      expect(Math.abs(s.leads.III[i] - (b - a))).toBeLessThan(1e-12);
      expect(Math.abs(s.leads.aVR[i] + (a + b) / 2)).toBeLessThan(1e-12);
    }
  });
  it("no hay escalones: el latido conducido es continuo de P a la línea TP", () => {
    const s = synthesize(load("sinus", { hr: 60 }), 10);
    for (const lead of LEADS) {
      const x = s.leads[lead];
      for (const b of s.events.beats.slice(1, -1)) {
        const qrs = [Math.floor(b.time * s.fs) - 2, Math.ceil((b.time + b.qrs!) * s.fs) + 2];
        for (let i = Math.floor((b.time - 0.25) * s.fs); i < Math.floor((b.time + b.qt! + 0.15) * s.fs); i++)
          if (i < qrs[0] || i > qrs[1]) expect(Math.abs(x[i + 1] - x[i])).toBeLessThan(0.03);
      }
    }
  });
});

describe("adquisición realista", () => {
  const c = { ...load("sinus", { hr: 60 }), filter: "diagnostic" as const, acquisition: "realistic" as const };
  const s = synthesize(c, 10);
  it("cuantiza a 1 µV como un registrador de 1000 cuentas/mV", () => {
    for (const lead of LEADS) for (let i = 0; i < 400; i++) expect(Math.abs(s.leads[lead][i] * 1000 - Math.round(s.leads[lead][i] * 1000))).toBeLessThan(1e-9);
  });
  it("añade un piso de ruido de reposo con la estructura medida por electrodos", () => {
    const ideal = synthesize({ ...c, acquisition: "ideal" }, 10);
    const noise = (lead: "I" | "II" | "V2") => Array.from(s.leads[lead], (v, i) => v - ideal.leads[lead][i]);
    const rms = (x: number[]) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length) * 1000;
    // Deriva respiratoria y ruido muscular: decenas de µV en total, nunca cero.
    for (const lead of ["I", "II", "V2"] as const) {
      expect(rms(noise(lead))).toBeGreaterThan(3);
      expect(rms(noise(lead))).toBeLessThan(200);
    }
  });
});
