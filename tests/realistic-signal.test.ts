import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { LEADS, type ECGCase, type Signal } from "../src/engine/types";
import { fromPreset, presetById, PRESETS, TEXTBOOK_SEED } from "../src/presets/catalog";
import { usesRealisticBase } from "../src/engine/realistic/engine";
import { samplePatient } from "../src/engine/realistic/shape-model";

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
  it("no toca P ni QRS (fuera del traspaso en J y del soporte de ±40 ms del filtro antialias)", () => {
    // The QRS→ST operator hand-over spans the last 4/56 of the QRS (≈6 ms here).
    expect(maxDiff(zero, full, b.time - 0.25, j - 0.05)).toBeLessThan(1e-12);
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

import { measure } from "../src/engine/measure";
import { modelMetricCards } from "../src/ui/metric-cards";

describe("límites conocidos del analizador congelado sobre la base aprendida", () => {
  // Cota explícita para que el sesgo documentado en docs/fidelidad.md no empeore
  // sin que nadie lo note; las tarjetas usan los valores del modelo.
  it.each([60, 72, 90])("FC %s: FC ±2 lpm, QRS ±20 ms y QT ±50 ms", (hr) => {
    const s = synthesize(load("sinus", { hr }), 10), m = measure(s);
    expect(Math.abs(m.hr! - s.truth.hr)).toBeLessThan(2);
    expect(Math.abs(m.qrs! - s.truth.qrs!)).toBeLessThan(20);
    if (m.qt !== null) expect(Math.abs(m.qt - s.truth.qt!)).toBeLessThan(50);
  });
});

describe("producto", () => {
  it("la adquisición por defecto del producto es realista", () => {
    expect((globalThis as { productAcquisition?: unknown }).productAcquisition).toBe("realistic");
  });
  it("todos los presets se generan con adquisición realista sin valores no finitos", () => {
    for (const p of PRESETS.filter((x) => x.strategy !== "pending")) {
      const s = synthesize({ ...fromPreset(p), acquisition: "realistic" }, 10);
      for (const lead of LEADS) expect(s.leads[lead].every(Number.isFinite), p.id).toBe(true);
    }
  }, 60_000);
  it("el eje de la tarjeta es el que tiene el trazado, no solo el pedido", () => {
    const s = synthesize(load("sinus", { axis: 150, seed: 21 }), 10);
    expect(modelMetricCards(load("sinus", { axis: 150, seed: 21 }), s)[4].value).toBe(`${Math.round(s.truth.axis!)}<small>°</small>`);
  });
  it("bigeminismo: QRS y QTc de las tarjetas describen el latido conducido", () => {
    const c = fromPreset(presetById("bigeminy")!), cards = modelMetricCards(c, synthesize(c, 10));
    expect(cards[2].value).toBe(`${c.qrs}<small>ms</small>`);
  });
});

describe("eje: la tarjeta dice lo que muestra el trazado", () => {
  const traceAxis = (s: Signal) => {
    let i1 = 0, avf = 0;
    for (const b of s.events.beats.filter((x) => x.kind === "normal")) {
      const k0 = Math.ceil(b.time * s.fs), pr = (x: Float64Array) => (x[k0 - 4] + x[k0 - 3] + x[k0 - 2]) / 3;
      const b0 = pr(s.leads.I), b1 = pr(s.leads.aVF);
      for (let k = k0; k < Math.floor((b.time + b.qrs!) * s.fs); k++) {
        i1 += s.leads.I[k] - b0;
        avf += s.leads.aVF[k] - b1;
      }
    }
    return (Math.atan2(avf, i1) * 180) / Math.PI;
  };
  const wrap = (d: number) => Math.abs(((d + 540) % 360) - 180);
  // Contract: the card always states the trace's own axis; the trace follows the
  // control within clinical reading precision (±15°), tighter in the usual range.
  it.each([[180, 15], [-150, 15], [150, 15], [-30, 10], [55, 10], [90, 10]])("eje %s° en 30 semillas (máx. %s°)", (axis, limit) => {
    const misses: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const s = synthesize(load("sinus", { axis, seed: seed * 7 }), 10), measured = traceAxis(s);
      expect(wrap(s.truth.axis! - measured)).toBeLessThan(3);
      misses.push(wrap(measured - axis));
    }
    misses.sort((a, b) => a - b);
    expect(misses[15]).toBeLessThan(3);
    expect(misses[29]).toBeLessThan(limit);
  }, 60_000);
  it("cambiar solo el eje rota a la misma persona", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const a = samplePatient({ seed, axis: 55, pAxis: 55, tAxis: 40, pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: 0 });
      const b = samplePatient({ seed, axis: 150, pAxis: 55, tAxis: 40, pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: 0 });
      expect(Array.from(b.z)).toEqual(Array.from(a.z));
    }
  });
});

import { changeCase } from "../src/ui/case-state";
import { normalizeCase } from "../src/engine/types";

describe("ejes naturales de P y T", () => {
  it("los presets parten con ejes naturales y mover el control los fija", () => {
    const c = fromPreset(presetById("sinus")!);
    expect(c.naturalPAxis).toBe(true);
    expect(c.naturalTAxis).toBe(true);
    const moved = changeCase(c, "pAxis", 100);
    expect(moved.naturalPAxis).toBe(false);
    expect(moved.naturalTAxis).toBe(true);
    expect(changeCase(c, "tAxis", -20).naturalTAxis).toBe(false);
  });
  it("un caso guardado antes de esta versión conserva el eje que había cambiado", () => {
    expect(normalizeCase({ version: 1, pAxis: 110 }).naturalPAxis).toBe(false);
    expect(normalizeCase({ version: 1, tAxis: -30 }).naturalTAxis).toBe(false);
    expect(normalizeCase({ version: 1 }).naturalPAxis).toBe(true);
    expect(normalizeCase({ version: 1, pAxis: 55, naturalPAxis: true }).naturalPAxis).toBe(true);
  });
  it("con ejes naturales el control no altera la señal; fijado, sí, y solo la P", () => {
    const c = load("sinus", { hr: 60 });
    const a = synthesize({ ...c, pAxis: 0 }, 10), b = synthesize({ ...c, pAxis: 120 }, 10);
    for (const lead of LEADS) expect(b.leads[lead]).toEqual(a.leads[lead]);
    expect(a.truth.pAxis).toBeDefined();
    const fixed = synthesize({ ...c, pAxis: 120, naturalPAxis: false }, 10), beat = fixed.events.beats[3];
    expect(fixed.truth.pAxis).toBeUndefined();
    // QRS-T only carries the atrial Ta tail, which follows the P wave's gain (µV).
    expect(maxDiff(a, fixed, beat.time + 0.06, beat.time + beat.qt!)).toBeLessThan(0.006);
    expect(maxDiff(a, fixed, beat.time - 0.25, beat.time)).toBeGreaterThan(0.01);
  });
  it("el acoplamiento natural sigue al QRS como en pacientes reales (P 0,14; T 0,25)", () => {
    const base = load("sinus"), p0 = synthesize({ ...base, axis: 20 }, 10).truth, p1 = synthesize({ ...base, axis: 80 }, 10).truth;
    const dP = p1.pAxis! - p0.pAxis!, dT = p1.tAxis! - p0.tAxis!;
    // Rotations of 0,14 and 0,25 × the QRS turn; net-area axes respond less than
    // linearly (non-dipolar residual), so check direction and order of magnitude.
    expect(dP).toBeGreaterThan(1);
    expect(dP).toBeLessThan(15);
    expect(dT).toBeGreaterThan(5);
    expect(dT).toBeLessThan(25);
    expect(dP).toBeLessThan(dT);
  });
});
