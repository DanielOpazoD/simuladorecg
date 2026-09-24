import { describe, it, expect } from "vitest";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { auditMeasurement } from "../src/engine/analysis/model-audit";
import { referenceInWindow } from "../src/engine/reference";
import { adaptRR, assignRepolarization } from "../src/engine/repolarization";
import { antialias } from "../src/engine/filter";
import { DEFAULT_CASE, cloneCase, type Beat } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";
import { paperLayout } from "../src/render/ecg";
import { changeCase } from "../src/ui/case-state";
import { fixture } from "./fixtures";
const load = (id: string) => fromPreset(presetById(id)!);
const delta = (a: number | null, b: number) => {
  expect(a).not.toBeNull();
  return Math.abs(a! - b);
};

describe("Repolarization and signal-chain acceptance", () => {
  it("responds gradually to a rate step, reaching 95% after 120 s", () => {
    let rr = 1;
    for (let second = 0; second < 120; second++) rr = adaptRR(rr, 0.5, 1);
    expect(rr).toBeCloseTo(0.525, 10);
    expect(adaptRR(1, 0.4, 0.4)).toBeGreaterThan(0.99);
  });
  it("does not collapse QT after a single premature interval", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.hr = 60;
    const beats: Beat[] = [
      { time: 1, rr: 1, kind: "normal" },
      { time: 1.4, rr: 0.4, kind: "pvc" },
      { time: 3, rr: 1.6, kind: "normal" },
    ];
    assignRepolarization(c, beats);
    expect(beats[0].qt).toBeCloseTo(0.41, 9);
    expect(Math.abs(beats[1].qt! - beats[0].qt!)).toBeLessThan(0.005);
    expect(beats.every((b) => b.qt! >= b.qrs! + 0.12)).toBe(true);
  });
  it.each([
    [40, 410],
    [60, 410],
    [72, 410],
    [40, 650],
  ])("measures isolated T at HR %s / QTc %s within 15 ms", (hr, qtc) => {
    const c = cloneCase(DEFAULT_CASE);
    Object.assign(c, { hr, qtc, variability: 0 });
    const s = synthesize(c, 10),
      m = measure(s);
    expect(delta(m.qt, s.truth.qt!)).toBeLessThanOrEqual(15);
    expect(m.evidence.qt.status).toBe("usable");
  });
  it("preserves J elevation and diagnostic ST relative to the local PR baseline", () => {
    const c = load("inferior");
    c.variability = 0;
    c.filter = "off";
    const a = synthesize(c, 10);
    c.filter = "diagnostic";
    const b = synthesize(c, 10);
    const beat = a.events.beats[2],
      index = (time: number) => Math.round(time * a.fs);
    const st = (s: typeof a, time: number) =>
      s.leads.II[index(time)] - s.leads.II[index(beat.time - 0.03)];
    expect(st(b, beat.time + beat.qrs!)).toBeGreaterThan(0.13);
    expect(
      Math.abs(
        st(a, beat.time + beat.qrs! + 0.06) -
          st(b, beat.time + beat.qrs! + 0.06),
      ),
    ).toBeLessThan(0.015);
  });
  it("starts de Winter depression at J, then rises", () => {
    const c = load("de_winter");
    c.variability = 0;
    const s = synthesize(c, 10),
      b = s.events.beats[2];
    const value = (t: number) =>
      s.leads.V2[Math.round(t * s.fs)] -
      s.leads.V2[Math.round((b.time - 0.03) * s.fs)];
    const j = value(b.time + b.qrs!),
      later = value(b.time + b.qrs! + 0.06);
    expect(j).toBeLessThan(-0.08);
    expect(later).toBeGreaterThan(j);
  });
  it("keeps the normal V1 P small and biphasic", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.filter = "off";
    c.variability = 0;
    const s = synthesize(c, 10),
      a = s.events.atria[2],
      values = s.leads.V1.slice(
        Math.round(a.time * 500),
        Math.round((a.time + 0.095) * 500),
      );
    expect(Math.max(...values)).toBeGreaterThan(0.02);
    expect(Math.min(...values)).toBeLessThan(-0.02);
    expect(Math.min(...values)).toBeGreaterThan(-0.07);
  });
  it("suppresses frequencies above output Nyquist without shifting the waveform", () => {
    const amplitude = (f: number) => {
      const x = Float64Array.from({ length: 3000 }, (_, i) =>
          Math.sin((2 * Math.PI * f * i) / 1000),
        ),
        y = antialias(x, 1000);
      let power = 0;
      for (let i = 500; i < 2500; i++) power += y[i] ** 2;
      return Math.sqrt(power / 1000);
    };
    expect(amplitude(100)).toBeGreaterThan(0.99);
    expect(amplitude(150)).toBeGreaterThan(0.9);
    expect(amplitude(260)).toBeLessThan(0.001);
    const x = new Float64Array(1000);
    x[500] = 1;
    const y = antialias(x, 1000);
    expect(Array.from(y).indexOf(Math.max(...y))).toBe(500);
  });
  it("configures the interference frequency independently from the notch", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.mainsFrequency = 50;
    c.artifacts.mains = 1;
    c.notch = 60;
    const wrong = synthesize(c, 10);
    c.notch = 50;
    const right = synthesize(c, 10);
    const power = (s: typeof right) => {
      let re = 0,
        im = 0;
      for (let i = 0; i < 5000; i++) {
        re += s.leads.II[i] * Math.cos((2 * Math.PI * 50 * i) / 500);
        im += s.leads.II[i] * Math.sin((2 * Math.PI * 50 * i) / 500);
      }
      return re * re + im * im;
    };
    expect(power(right)).toBeLessThan(power(wrong) * 0.03);
  });
});

describe("Independent analysis versus simulator audit", () => {
  it("audits the same 10 seconds, never replaces estimates with references", () => {
    const s = synthesize(load("sinus"), 65),
      raw = measure(s),
      m = auditMeasurement(s, raw),
      ref = referenceInWindow(s);
    expect(m.qrs).toBe(raw.qrs);
    expect(m.qrs).not.toBe(ref.qrs);
    expect(delta(m.hr, ref.hr)).toBeLessThan(0.2);
    expect(raw.rejected).toBeUndefined();
  });
  it.each(["hyperk", "complete_v"])(
    "retains the recovered ventricular count in %s",
    (id) => {
      const s = synthesize(load(id), 10),
        raw = measure(s),
        m = auditMeasurement(s, raw);
      expect(m.hr).toBe(raw.hr);
      expect(delta(m.hr, referenceInWindow(s).hr)).toBeLessThan(2);
      expect(m.rejected?.hr).toBeUndefined();
    },
  );
  it.each(["wpw", "aai", "vvi"])(
    "does not present intervals from a rejected QRS in %s",
    (id) => {
      const s = synthesize(load(id), 10),
        raw = measure(s);
      raw.beats[0].onset -= 0.06;
      raw.beats[0].offset -= 0.06;
      const m = auditMeasurement(s, raw);
      expect(m.qrs).toBeNull();
      expect(m.qt).toBeNull();
      expect(m.pr).toBeNull();
      expect(m.axis).toBeNull();
    },
  );
  it("does not label P trustworthy if the preceding T cannot be separated", () => {
    const m = measure(fixture({ t: [] }));
    expect(m.evidence.pr.status).not.toBe("usable");
  });
  it("retains a measurable AF heart rate without assigning PR or QTc", () => {
    const s = synthesize(load("af"), 10),
      m = auditMeasurement(s, measure(s));
    expect(m.hr).not.toBeNull();
    expect(delta(m.hr, referenceInWindow(s).hr)).toBeLessThan(4);
    expect(m.pr).toBeNull();
    expect(m.qtc.fridericia).toBeNull();
  });
});

describe("Display timing and pure control transitions", () => {
  it("switches between a common segment time and sequential recording", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.view.timing = "simultaneous";
    const simultaneous = paperLayout(c, 1000);
    expect(simultaneous.segments.every((s) => s.start === 0)).toBe(true);
    c.view.timing = "sequential";
    expect(
      new Set(paperLayout(c, 1000).segments.map((s) => s.start)).size,
    ).toBe(4);
  });
  it("preserves the physiological case when only display settings change", () => {
    const c = cloneCase(DEFAULT_CASE),
      updated = changeCase(c, "view.gain", 20);
    expect(c.view.gain).toBe(10);
    expect(updated.presetId).toBe("sinus");
    expect(updated.view.chestGain).toBe(20);
    const block = changeCase(c, "conduction", "rbbb");
    expect(block.qrs).toBe(150);
    expect(block.presetId).toBe("custom");
  });
});
