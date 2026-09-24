import { describe, it, expect } from "vitest";
import {
  DEFAULT_CASE,
  cloneCase,
  LEADS,
  normalizeCase,
  type ECGCase,
} from "../src/engine/types";
import { generateEvents } from "../src/engine/rhythm";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { project, axisFromLeads } from "../src/engine/leads";
import { lesionVector, qrsKernels, tVector } from "../src/engine/morphology";
import { PRESETS, fromPreset, presetById } from "../src/presets/catalog";
import { calibrationGeometry, paperLayout } from "../src/render/ecg";
import { encodeCase, decodeCase } from "../src/ui/persistence";
import { createHash } from "node:crypto";
const testCase = (patch: Partial<ECGCase> = {}) =>
  Object.assign(cloneCase(DEFAULT_CASE), patch);
const load = (id: string) => fromPreset(presetById(id)!);
describe("Relaciones eléctricas", () => {
  it("Einthoven y Goldberger exactos incluso con artefactos y filtros", () => {
    const c = testCase({ rhythm: "af", filter: "monitor", notch: 50 });
    c.artifacts = {
      baseline: 0.2,
      muscle: 0.4,
      mains: 0.3,
      loose: 0.3,
      reversed: false,
    };
    const s = synthesize(c, 10);
    for (let i = 0; i < s.leads.I.length; i += 7) {
      const l = s.leads;
      expect(Math.abs(l.III[i] - (l.II[i] - l.I[i]))).toBeLessThan(1e-9);
      expect(l.aVR[i] + (l.I[i] + l.II[i]) / 2).toBeCloseTo(0, 10);
      expect(l.aVL[i] - (l.I[i] - l.II[i] / 2)).toBeCloseTo(0, 10);
      expect(l.aVF[i] - (l.II[i] - l.I[i] / 2)).toBeCloseTo(0, 10);
    }
  });
  it("ST inferior y reciprocidad emergen del vector", () => {
    const c = load("inferior"),
      p = project(lesionVector(c));
    expect(p.III).toBeGreaterThan(p.II);
    expect(p.II).toBeGreaterThan(0);
    expect(p.aVF).toBeGreaterThan(0);
    expect(p.I).toBeLessThan(0);
    expect(p.aVL).toBeLessThan(0);
  });
  it("inversión RA/LA intercambia derivaciones y conserva precordiales", () => {
    const c = testCase(),
      a = synthesize(c, 10);
    c.artifacts.reversed = true;
    const b = synthesize(c, 10);
    for (let i = 0; i < 5000; i += 31) {
      expect(b.leads.I[i]).toBe(-a.leads.I[i]);
      expect(b.leads.II[i]).toBe(a.leads.III[i]);
      expect(b.leads.aVR[i]).toBe(a.leads.aVL[i]);
      expect(b.leads.V3[i]).toBe(a.leads.V3[i]);
    }
  });
  it("rotación de QRS cambia el eje integrado; aVR puede ser positivo", () => {
    for (const axis of [-120, -60, 0, 60, 120]) {
      const c = testCase({ axis });
      const ks = qrsKernels(c, { time: 0, kind: "normal", rr: 1 });
      const vec = ks.reduce(
        (a, k) =>
          a.map((v, j) => v + k.v[j] * k.sigma) as [number, number, number],
        [0, 0, 0] as [number, number, number],
      );
      const p = project(vec);
      expect(axisFromLeads(p.I, p.II)).toBeCloseTo(axis, 1);
      if (axis === -120) expect(p.aVR).toBeGreaterThan(0);
    }
  });
});
describe("Reloj y conducción", () => {
  it("Wenckebach 4:3: PR crecientes, RR decrecientes y pausa corta", () => {
    const e = generateEvents(load("wenckebach"), 6);
    expect(e.atria.slice(0, 4).map((a) => a.conducted)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(e.beats.slice(0, 3).map((b) => Math.round(b.pr! * 1000))).toEqual([
      160, 240, 280,
    ]);
    const rr = e.beats
      .slice(1, 4)
      .map((b, i) => Math.round((b.time - e.beats[i].time) * 1000));
    expect(rr).toEqual([880, 840, 1480]);
  });
  it("BAV completo: variar frecuencia auricular no cambia QRS", () => {
    const c = load("complete");
    const a = generateEvents(c, 10);
    c.atrialRate = 105;
    const b = generateEvents(c, 10);
    expect(a.beats).toEqual(b.beats);
    expect(a.atria.every((p) => !p.conducted)).toBe(true);
    expect(b.atria.length).toBeGreaterThan(a.atria.length);
  });
  it("bigeminismo conserva reloj auricular y compensa RR", () => {
    const e = generateEvents(
      testCase({ hr: 60, variability: 0, ectopy: "bigeminy" }),
      8,
    );
    expect(e.atria[1].time - e.atria[0].time).toBeCloseTo(1, 9);
    expect(e.atria[1].conducted).toBe(false);
    expect(e.beats[2].time - e.beats[0].time).toBeCloseTo(2, 9);
  });
  it("las duplas no producen RR negativos en el límite de frecuencia", () => {
    const e = generateEvents(
      testCase({ hr: 250, coupling: 0.85, ectopy: "couplet" }),
      10,
    );
    for (let i = 1; i < e.beats.length; i++) {
      expect(e.beats[i].time).toBeGreaterThan(e.beats[i - 1].time);
      expect(e.beats[i].rr).toBeGreaterThan(0);
    }
  });
  it("T secundaria ventricular se opone al eje ventricular efectivo", () => {
    const c = testCase();
    const t = project(tVector(c, { time: 0, kind: "pvc", rr: 1 }));
    expect(axisFromLeads(t.I, t.II)).toBeCloseTo(115, 1);
  });
});
describe("Determinismo y catálogo", () => {
  it("FA conserva exactamente muestras y eventos con igual semilla", () => {
    const c = load("af");
    const a = synthesize(c, 10),
      b = synthesize(c, 10);
    expect(a.events).toEqual(b.events);
    for (const l of LEADS) expect(a.leads[l]).toEqual(b.leads[l]);
    c.seed++;
    expect(synthesize(c, 10).leads.II).not.toEqual(a.leads.II);
  });
  it("el prefijo no depende de la duración del buffer", () => {
    const c = load("af");
    const a = synthesize(c, 10),
      b = synthesize(c, 20);
    expect(a.leads.II).toEqual(b.leads.II.slice(0, 5000));
  });
  it("vista y ruido no cambian calendario de activaciones", () => {
    const c = load("pvc"),
      a = synthesize(c, 10);
    c.artifacts.muscle = 0.5;
    c.view.gain = 20;
    c.view.speed = 50;
    expect(synthesize(c, 10).events).toEqual(a.events);
  });
  it.each(
    PRESETS.filter((p) => p.strategy !== "pending").map(
      (p) => [p.id, p] as const,
    ),
  )(
    "%s produce muestras finitas, QRS ordenados y señal determinista",
    (_id, p) => {
      const a = synthesize(fromPreset(p), 10);
      for (const l of LEADS)
        expect(Array.from(a.leads[l]).every(Number.isFinite)).toBe(true);
      for (let i = 1; i < a.events.beats.length; i++)
        expect(a.events.beats[i].time).toBeGreaterThan(
          a.events.beats[i - 1].time,
        );
      const digest = createHash("sha256")
        .update(Buffer.from(a.leads.II.buffer))
        .digest("hex");
      expect(digest).toMatchSnapshot();
    },
  );
});
describe("Medición independiente", () => {
  it("BRD conserva rSR prima en V1 y S terminal lateral en muestras", () => {
    const s = synthesize(load("rbbb"), 10),
      b = s.events.beats.find((b) => b.time > 0.4)!;
    const segment = (lead: "I" | "V1" | "V6", lo: number, hi: number) =>
      Array.from(
        s.leads[lead].slice(
          Math.round((b.time + lo) * 500),
          Math.round((b.time + hi) * 500),
        ),
      );
    expect(Math.max(...segment("V1", 0, 0.03))).toBeGreaterThan(0.02);
    expect(Math.min(...segment("V1", 0.025, 0.09))).toBeLessThan(-0.3);
    expect(Math.max(...segment("V1", 0.09, 0.15))).toBeGreaterThan(0.3);
    expect(Math.min(...segment("I", 0.09, 0.15))).toBeLessThan(-0.15);
    expect(Math.min(...segment("V6", 0.09, 0.15))).toBeLessThan(-0.25);
  });
  it("BRI mantiene predominio negativo en V1 y positivo lateral", () => {
    const s = synthesize(load("lbbb"), 10),
      b = s.events.beats.find((b) => b.time > 0.4)!;
    const cut = (l: "I" | "V1") =>
      Array.from(
        s.leads[l].slice(
          Math.round(b.time * 500),
          Math.round((b.time + 0.16) * 500),
        ),
      );
    expect(Math.min(...cut("V1"))).toBeLessThan(-0.5);
    expect(Math.max(...cut("V1"))).toBeLessThan(0.1);
    expect(Math.max(...cut("I"))).toBeGreaterThan(0.4);
  });
  it("reciprocidad inferior persiste en el trazado filtrado", () => {
    const a = synthesize(load("sinus"), 10),
      b = synthesize(load("inferior"), 10),
      beat = b.events.beats.find((b) => b.time > 0.4)!,
      idx = Math.round((beat.time + 0.125) * 500);
    const delta = (l: "I" | "II" | "III" | "aVL") =>
      b.leads[l][idx] - a.leads[l][idx];
    expect(delta("III")).toBeGreaterThan(delta("II"));
    expect(delta("II")).toBeGreaterThan(0.1);
    expect(delta("I")).toBeLessThan(-0.05);
    expect(delta("aVL")).toBeLessThan(-0.1);
  });
  it("sinusal: FC, PR, QRS y QT dentro de tolerancias de la maqueta", () => {
    const c = load("sinus"),
      s = synthesize(c, 10),
      m = measure(s);
    expect(m.hr).toBeCloseTo(72, 0);
    expect(m.qrs!).toBeGreaterThan(65);
    expect(m.qrs!).toBeLessThan(110);
    expect(m.pr!).toBeGreaterThan(125);
    expect(m.pr!).toBeLessThan(180);
    expect(m.qt!).toBeGreaterThan(320);
    expect(m.qt!).toBeLessThan(430);
  });
  it.each(["rbbb", "lbbb", "vt", "vvi"])(
    "%s conserva QRS ancho medido",
    (id) => {
      const m = measure(synthesize(load(id), 10));
      expect(m.qrs).not.toBeNull();
      expect(m.qrs!).toBeGreaterThanOrEqual(120);
    },
  );
  it.each(["af", "complete"])("%s no inventa un PR estable", (id) => {
    expect(measure(synthesize(load(id), 10)).pr).toBeNull();
  });
  it("FC 250 lpm no se pierde por período refractario", () => {
    expect(
      measure(synthesize(testCase({ hr: 250, variability: 0 }), 10)).hr!,
    ).toBeCloseTo(250, 0);
  });
  it("BRI no cuenta la T como segundo QRS", () => {
    expect(
      Math.abs(measure(synthesize(load("lbbb"), 10)).hr! - 72),
    ).toBeLessThan(2);
  });
  it("las medidas no leen verdad ni eventos", () => {
    const s = synthesize(load("sinus"), 10),
      m = measure(s);
    s.events = { atria: [], beats: [], spikes: [] };
    s.truth = { hr: 1, pr: 999, qrs: 999, qt: 999, axis: 179 };
    expect(measure(s)).toEqual(m);
  });
});
describe("Escalas y persistencia", () => {
  it("pulso de calibración 1mV/200ms =10mm/5mm", () => {
    const p = 96 / 25.4,
      g = calibrationGeometry(25, 10, p);
    expect(g.width).toBeCloseTo(5 * p, 9);
    expect(g.height).toBeCloseTo(10 * p, 9);
  });
  it.each(["3x4", "3x4+1", "3x4+3", "6x2", "12x1"] as const)(
    "formato %s contiene12 derivaciones y10s totales",
    (format) => {
      const c = testCase();
      c.view.format = format;
      const l = paperLayout(c, 1000);
      expect(new Set(l.segments.map((s) => s.lead)).size).toBe(12);
      expect(Math.max(...l.segments.map((s) => s.start + s.duration))).toBe(10);
    },
  );
  it("Cabrera invierte y etiqueta aVR", () => {
    const c = testCase();
    c.view.cabrera = true;
    const p = paperLayout(c, 1000);
    expect(p.segments.find((s) => s.lead === "aVR")?.polarity).toBe(-1);
  });
  it("JSON y URL recuperan el mismo estado", () => {
    const c = load("rbbb");
    c.artifacts.baseline = 0.2;
    expect(decodeCase(encodeCase(c))).toEqual(c);
    expect(normalizeCase(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });
  it("importación rechaza versiones y valores inválidos", () => {
    expect(() => normalizeCase({ version: 2 })).toThrow();
    expect(() =>
      normalizeCase({ ...DEFAULT_CASE, rhythm: "inventado" }),
    ).toThrow();
    expect(() => normalizeCase({ ...DEFAULT_CASE, hr: "NaN" })).toThrow();
  });
});
