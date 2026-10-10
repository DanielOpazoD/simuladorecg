import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { LEADS, type ECGCase, type Signal } from "../src/engine/types";
import { fromPreset, presetById, PRESETS, TEXTBOOK_AF_SEED, TEXTBOOK_SEED, TEXTBOOK_SEEDS } from "../src/presets/catalog";
import { realisticModelFor, realisticModelsFor } from "../src/engine/realistic/scope";
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

describe("alcance de la base aprendida (F2–F3)", () => {
  it("cubre los ritmos supraventriculares y las clases aprendidas, y nada más", () => {
    const model = Object.fromEntries(PRESETS.filter((p) => p.strategy !== "pending").map((p) => [p.id, realisticModelFor(fromPreset(p))]));
    for (const id of ["sinus", "brady", "tachy", "rsa", "af", "flutter", "junctional", "pac", "av1", "wenckebach", "complete", "longqt"])
      expect(model[id]).toBe("NORM");
    expect([model.lbbb, model.irbbb, model.lafb, model.lvh]).toEqual(["CLBBB", "IRBBB", "LAFB", "LVH"]);
    expect([model.rbbb, model.old_inferior, model.old_anterior]).toEqual(["CRBBB", "IMI", "ASMI"]);
    // Ventricular premature beats ride on the learned sinus base with the learned PVC (F5.3).
    for (const id of ["pvc", "bigeminy", "trigeminy", "couplet"]) {
      expect(model[id]).toBe("NORM");
      expect(realisticModelsFor(fromPreset(presetById(id)!))).toEqual(["NORM", "PVC"]);
    }
    expect(realisticModelFor({ ...fromPreset(presetById("pvc")!), ventricularSource: "rv_apical_pacing" })).toBeNull();
    for (const id of ["vt", "vvi", "lpfb", "bifascicular", "wpw", "anterior", "inferior", "lateral", "sgarbossa", "rv_acute", "hyperk", "complete_v"])
      expect(model[id]).toBeNull();
    // Only the chronic phase of a territory with a learned old-infarction population.
    expect(realisticModelFor({ ...fromPreset(presetById("lateral")!), phase: "chronic" })).toBeNull();
    expect(realisticModelFor({ ...fromPreset(presetById("old_inferior")!), conduction: "lbbb" })).toBeNull();
    // A population is a whole learned beat: modifiers are not stacked across them.
    expect(realisticModelFor({ ...fromPreset(presetById("lbbb")!), overload: "lv" })).toBeNull();
    expect(realisticModelFor({ ...fromPreset(presetById("lvh")!), rhythm: "af" })).toBe("LVH");
  });
  it("los presets aprendidos muestran el paciente de libro de su población; la semilla del caso manda", () => {
    expect(fromPreset(presetById("sinus")!).seed).toBe(TEXTBOOK_SEED);
    for (const [id, code] of [["irbbb", "IRBBB"], ["lafb", "LAFB"], ["lvh", "LVH"], ["lbbb", "CLBBB"], ["rbbb", "CRBBB"], ["old_inferior", "IMI"], ["old_anterior", "ASMI"]] as const)
      expect(fromPreset(presetById(id)!).seed).toBe(TEXTBOOK_SEEDS[code]);
    expect(fromPreset(presetById("wpw")!).seed).not.toBe(TEXTBOOK_SEED);
  });
  it("un modelo de clase sin cargar falla de forma explícita, nunca cae en otra población", async () => {
    const { shapeModel, hasShapeModel } = await import("../src/engine/realistic/shape-model");
    expect(hasShapeModel("CLBBB")).toBe(true); // tests/setup lo precarga
    expect(() => shapeModel("XYZ" as never)).toThrow(/no está cargado/);
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

describe("clases aprendidas (F3): criterios de libro medidos en las muestras", () => {
  const read = (id: string, patch: Partial<ECGCase> = {}) => {
    const s = synthesize(load(id, patch), 10), b = s.events.beats[3], q = b.qrs!;
    const qrs = (l: (typeof LEADS)[number]) => Array.from(s.leads[l].slice(Math.round(b.time * s.fs), Math.round((b.time + q) * s.fs)));
    const st60 = (l: (typeof LEADS)[number]) => s.leads[l][Math.round((b.time + q + 0.06) * s.fs)];
    return { s, qrs, st60, max: (l: (typeof LEADS)[number]) => Math.max(...qrs(l)), min: (l: (typeof LEADS)[number]) => Math.min(...qrs(l)) };
  };
  it("BRI: QS/rS en V1, R lateral sin S y ST-T discordante", () => {
    const r = read("lbbb");
    expect(-r.min("V1")).toBeGreaterThan(3 * r.max("V1"));
    for (const l of ["I", "V6"] as const) expect(r.max(l)).toBeGreaterThan(4 * -r.min(l));
    for (const l of ["V1", "V2"] as const) expect(r.st60(l)).toBeGreaterThan(0.1);
    for (const l of ["I", "V6"] as const) expect(r.st60(l)).toBeLessThan(-0.1);
  });
  it("BRD incompleto: r' terminal en V1 tras una S o una muesca (rSr', rR')", () => {
    const v1 = read("irbbb").qrs("V1"), half = Math.floor(v1.length / 2);
    const rPrime = Math.max(...v1.slice(half)), at = half + v1.slice(half).indexOf(rPrime);
    const r = Math.max(...v1.slice(0, Math.floor(at * 0.7))), rAt = v1.indexOf(r);
    const dip = Math.min(...v1.slice(rAt, at));
    expect(r).toBeGreaterThan(0.05); // r inicial
    expect(rPrime).toBeGreaterThan(0.1);
    expect(Math.min(r, rPrime) - dip).toBeGreaterThan(0.1); // S o muesca entre ambas
  });
  it("BRD completo: rsR' en V1 y S terminal ancha en I y V6", () => {
    const r = read("rbbb"), v1 = r.qrs("V1"), s = v1.indexOf(Math.min(...v1));
    expect(Math.min(...v1)).toBeLessThan(-0.1);
    expect(Math.max(...v1.slice(s))).toBeGreaterThan(2 * -Math.min(...v1));
    for (const l of ["I", "V6"] as const) {
      const x = r.qrs(l), tail = x.slice(Math.round(x.length * 0.6));
      expect(tail.filter((v) => v < -0.05).length / 500).toBeGreaterThanOrEqual(0.03); // ≥ 30 ms
    }
  });
  it("Infarto inferior antiguo: Q patológica en III y aVF", () => {
    const r = read("old_inferior");
    // aVF: Q ≥ 30 ms desde el nivel de inicio del QRS; III: QS (sin R previa).
    const avf = r.qrs("aVF").map((v, _, x) => v - x[0]), qEnd = avf.findIndex((v, i) => i > avf.indexOf(Math.min(...avf)) && v >= 0);
    expect(Math.min(...avf)).toBeLessThan(-0.1);
    expect(qEnd / 500).toBeGreaterThanOrEqual(0.03);
    const iii = r.qrs("III"), deepest = iii.indexOf(Math.min(...iii));
    expect(iii[deepest]).toBeLessThan(-0.3);
    expect(Math.max(...iii.slice(0, deepest))).toBeLessThan(0.1);
  });
  it("Infarto anteroseptal antiguo: QS o sin R en V1–V2", () => {
    const r = read("old_anterior");
    for (const l of ["V1", "V2"] as const) expect(r.max(l)).toBeLessThan(0.1 * -r.min(l) + 0.05);
  });
  it("HBAI: eje ≤ −45°, qR en aVL y rS inferior con S III > S II", () => {
    const r = read("lafb"), avl = r.qrs("aVL");
    expect(r.s.truth.axis!).toBeLessThanOrEqual(-45);
    expect(Math.min(...avl.slice(0, 10))).toBeLessThan(-0.05);
    expect(r.max("aVL")).toBeGreaterThan(0.5);
    for (const l of ["II", "III", "aVF"] as const) expect(-r.min(l)).toBeGreaterThan(2 * r.max(l));
    expect(-r.min("III")).toBeGreaterThan(-r.min("II"));
  });
  it("HVI: Sokolow-Lyon ≥ 3,5 mV y sobrecarga lateral", () => {
    const r = read("lvh");
    expect(-r.min("V1") + Math.max(r.max("V5"), r.max("V6"))).toBeGreaterThanOrEqual(3.5);
    for (const l of ["V5", "V6"] as const) expect(r.st60(l)).toBeLessThan(-0.05);
  });
  it.each(["lbbb", "rbbb", "irbbb", "lvh"])("%s: la ST-T secundaria sigue la ganancia del QRS (ST/QRS constante)", (id) => {
    // Without P there is no atrial Ta, so the ventricular trace is exactly linear.
    const one = synthesize(load(id, { pAmp: 0 }), 10), two = synthesize(load(id, { pAmp: 0, qrsAmp: 2 }), 10);
    let err = 0, peak = 0;
    for (const l of LEADS)
      for (let i = 0; i < one.leads[l].length; i++) {
        err = Math.max(err, Math.abs(two.leads[l][i] - 2 * one.leads[l][i]));
        peak = Math.max(peak, Math.abs(one.leads[l][i]));
      }
    expect(peak).toBeGreaterThan(1);
    expect(err).toBeLessThan(1e-9);
  });
  it("HBAI conserva una T primaria: la ganancia del QRS no toca la ST-T", () => {
    const one = read("lafb", { pAmp: 0 }), two = read("lafb", { pAmp: 0, qrsAmp: 2 });
    // Only the decaying removal of the inherited atrial Ta (µV, scaled with the QRS
    // template it sits on) differs; a secondary class would double ST60.
    for (const l of ["I", "V2", "V5"] as const) expect(Math.abs(two.st60(l) - one.st60(l))).toBeLessThan(0.01);
  });
});

describe("clases aprendidas (F3): el analizador congelado mide el paciente de libro", () => {
  it.each(["lbbb", "rbbb", "irbbb", "lafb", "lvh", "old_inferior", "old_anterior"])("%s: QRS medido a ±10 ms del programado y QT medible", async (id) => {
    const { analyzeSamples } = await import("../src/engine/sample-analysis");
    // As the user sees it: the preset with realistic acquisition (seeded, deterministic).
    const c = { ...fromPreset(presetById(id)!), acquisition: "realistic" as const }, s = synthesize(c, 10);
    const m = analyzeSamples({ fs: s.fs, leads: s.leads });
    expect(m.evidence.qrs.status).toBe("usable");
    expect(Math.abs(m.qrs! - c.qrs)).toBeLessThanOrEqual(10);
    expect(m.qt).not.toBeNull();
  });
});

describe("F3.2: alcance del infarto antiguo y textos de la interfaz", () => {
  it("la fase crónica no descarta otros modificadores: con sobrecarga sigue en núcleos", () => {
    const old = fromPreset(presetById("old_inferior")!);
    for (const overload of ["lv", "rv_acute", "rv_chronic"] as const) expect(realisticModelFor({ ...old, overload })).toBeNull();
    expect(realisticModelFor({ ...old, phase: "acute" })).toBeNull();
    expect(realisticModelFor({ ...old, ischemia: "inferior_lcx" })).toBe("IMI");
  });
  it("los presets de infarto antiguo conservan una lesión visible si se pasan a fase aguda", () => {
    for (const id of ["old_inferior", "old_anterior"]) expect(fromPreset(presetById(id)!).st).toBeGreaterThan(0);
  });
  it("los controles describen el infarto antiguo aprendido y la base regional real", async () => {
    const { controls } = await import("../src/ui/controls");
    const { regionalActivationControls } = await import("../src/ui/regional-activation");
    expect(controls(fromPreset(presetById("old_inferior")!))).toMatch(/Infarto antiguo aprendido de pacientes reales/);
    expect(controls({ ...fromPreset(presetById("lateral")!), phase: "chronic" })).toMatch(/no genera ondas Q/);
    expect(regionalActivationControls(fromPreset(presetById("rbbb")!))).toMatch(/Latido aprendido \(PTB-XL\)/);
    expect(regionalActivationControls(fromPreset(presetById("bifascicular")!))).toMatch(/Plantilla histórica/);
  });
  it("un caso crónico inferior o anterior fuera de sus presets avisa del cambio de trazado", async () => {
    const { caseContext } = await import("../src/presets/case-context");
    const warn = /infarto antiguo aprendido de pacientes reales/;
    expect(caseContext({ ...fromPreset(presetById("inferior")!), phase: "chronic" }).warnings.join(" ")).toMatch(warn);
    expect(caseContext(fromPreset(presetById("old_inferior")!)).warnings.join(" ")).not.toMatch(warn);
  });
});

describe("F5.1: ondas f y RR de la FA aprendidos de PTB-XL", () => {
  it("cada paciente tiene su propio CV de RR y su frecuencia dominante, deterministas por semilla", async () => {
    const { afPatient } = await import("../src/engine/realistic/atrial-fibrillation");
    const cvs = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const p = afPatient(seed);
      expect(p.rrCv).toBeGreaterThanOrEqual(0.08);
      expect(p.rrCv).toBeLessThanOrEqual(0.4);
      expect(p.dominantHz).toBeGreaterThanOrEqual(3);
      expect(p.dominantHz).toBeLessThanOrEqual(12);
      expect(p.fir.every(Number.isFinite)).toBe(true);
      cvs.add(Math.round(p.rrCv * 1000));
    }
    expect(cvs.size).toBeGreaterThan(20);
    expect(afPatient(7)).toEqual(afPatient(7));
  });
  it("las ondas f del paciente de libro se ven en V1 entre latidos (3–12 Hz, decenas de µV)", () => {
    const s = synthesize(load("af"), 10), beats = s.events.beats;
    let sumSq = 0, n = 0;
    for (let k = 1; k < beats.length; k++) {
      const a = beats[k - 1].time + beats[k - 1].qt! + 0.04, b = beats[k].time - 0.06;
      for (let i = Math.ceil(a * s.fs); i < Math.floor(b * s.fs); i++) { sumSq += s.leads.V1[i] ** 2; n++; }
    }
    expect(n).toBeGreaterThan(200);
    const rms = Math.sqrt(sumSq / n) * 1000;
    expect(rms).toBeGreaterThan(8);
    expect(rms).toBeLessThan(150);
  });
  it("sin base aprendida (núcleos) la FA conserva sus ondas f históricas", () => {
    const c = load("af"), learned = synthesize(c, 4), kernels = synthesize(c, 4, { learnedBase: false });
    expect(Array.from(learned.leads.V1)).not.toEqual(Array.from(kernels.leads.V1));
    expect(kernels.leads.V1.every(Number.isFinite)).toBe(true);
  });
  it("los presets de FA muestran su paciente de libro", () => {
    for (const id of ["af", "af_fast", "af_slow"]) expect(fromPreset(presetById(id)!).seed).toBe(TEXTBOOK_AF_SEED);
  });
});

describe("F5.3: extrasístoles ventriculares aprendidas de PTB-XL", () => {
  const pvcBeats = (seed: number) => {
    const s = synthesize(load("pvc", { seed }), 10);
    return { s, beats: s.events.beats.filter((b) => b.kind === "pvc") };
  };
  it("cada paciente conserva su ancho de QRS y su amplitud (no la mediana de la población)", () => {
    const widths = new Set<number>(), sizes: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { s, beats } = pvcBeats(seed), b = beats[1];
      expect(b.qrs!).toBeGreaterThanOrEqual(0.1);
      expect(b.qrs!).toBeLessThanOrEqual(0.2);
      widths.add(Math.round(b.qrs! * 1000));
      let peak = 0;
      for (const l of LEADS) for (let i = Math.round(b.time * s.fs); i < Math.round((b.time + b.qrs!) * s.fs); i++) peak = Math.max(peak, Math.abs(s.leads[l][i]));
      sizes.push(peak);
    }
    expect(widths.size).toBeGreaterThan(6);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const cv = Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length) / mean;
    expect(cv).toBeGreaterThan(0.15);
  });
  it("una fuente ventricular elegida vuelve a los núcleos con su ancho mínimo", () => {
    const s = synthesize(load("pvc", { ventricularSource: "representative_pvc" }), 10);
    expect(s.events.beats.find((b) => b.kind === "pvc")!.qrs).toBeCloseTo(0.15, 9);
  });
  it("el laboratorio de activación muestra la extrasístole aprendida, con su ancho", async () => {
    const { sampleActivation } = await import("../src/ui/activation-model");
    const c = fromPreset(presetById("pvc")!), b = synthesize(c, 10).events.beats.find((x) => x.kind === "pvc")!;
    const t = sampleActivation(c, b);
    expect(t.timing.label).toBe("Extrasístole aprendida (PTB-XL)");
    expect(t.durationMs).toBeCloseTo(b.qrs! * 1000, 6);
    expect(Math.max(...t.xyz.map((v) => Math.hypot(...v)))).toBeGreaterThan(0.3);
  });
});
