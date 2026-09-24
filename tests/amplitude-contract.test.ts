import { describe, expect, it } from "vitest";
import { lesionControlEffect, tVector } from "../src/engine/morphology";
import { synthesize } from "../src/engine/signal";
import { LEADS, type ECGCase, type Signal } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";

function load(id: string): ECGCase {
  const c = fromPreset(presetById(id)!);
  Object.assign(c, { filter: "off", hr: 60, variability: 0 });
  return c;
}

function maxDifference(a: Signal, b: Signal, start = 0, end = 10): number {
  let max = 0;
  for (const lead of LEADS)
    for (let i = Math.ceil(start * a.fs); i < Math.floor(end * a.fs); i++)
      max = Math.max(max, Math.abs(a.leads[lead][i] - b.leads[lead][i]));
  return max;
}

describe("T amplitude is a scale of the entire T component", () => {
  it.each([
    "sinus",
    "rbbb",
    "lbbb",
    "rv_acute",
    "rv_chronic",
    "lvh",
    "vvi",
    "hyperk",
  ])("zero removes every vector component in %s", (id) => {
    const c = load(id);
    c.tAmp = 0;
    const kind = id === "vvi" ? "paced" : "normal";
    expect(tVector(c, { time: 1, rr: 1, kind })).toEqual([0, 0, 0]);
  });

  it.each([
    "sinus",
    "rbbb",
    "rv_acute",
    "rv_chronic",
    "lvh",
    "wellens_a",
    "wellens_b",
    "de_winter",
  ])("leaves no T samples in the isolated terminal T window of %s", (id) => {
    const c = load(id);
    c.tAmp = 0;
    const s = synthesize(c, 10),
      b = s.events.beats[3];
    // Beyond QRS and the local de Winter ST correction, including FIR support.
    // These cases have no secondary ST component; T=0 is not a claim that
    // ST elevation, a U wave, or artifact must disappear in other cases.
    const start = Math.max(b.time + b.qrs! + 0.1, b.time + b.qt! - 0.1),
      end = b.time + b.qt! - 0.02;
    expect(end - start).toBeGreaterThan(0.025);
    for (const lead of LEADS) {
      let max = 0;
      for (let i = Math.ceil(start * s.fs); i <= Math.floor(end * s.fs); i++)
        max = Math.max(max, Math.abs(s.leads[lead][i]));
      expect(max).toBeLessThan(1e-12);
    }
  });

  it.each([
    "sinus",
    "rbbb",
    "lbbb",
    "rv_acute",
    "lvh",
    "vvi",
    "wellens_a",
    "wellens_b",
    "de_winter",
  ])(
    "scales T linearly while preserving the other sampled components in %s",
    (id) => {
      const c = load(id);
      c.tAmp = 0;
      const zero = synthesize(c, 10);
      c.tAmp = 0.14;
      const half = synthesize(c, 10);
      c.tAmp = 0.28;
      const full = synthesize(c, 10),
        b = full.events.beats[3];
      let response = 0,
        error = 0;
      for (const lead of LEADS)
        for (let i = 0; i < full.leads[lead].length; i += 7) {
          const delta = full.leads[lead][i] - zero.leads[lead][i];
          response = Math.max(response, Math.abs(delta));
          error = Math.max(
            error,
            Math.abs(half.leads[lead][i] - zero.leads[lead][i] - delta / 2),
          );
        }
      expect(response).toBeGreaterThan(0.05);
      expect(error).toBeLessThan(1e-12);
      // QRS and early ST precede T; the 40 ms centered antialias support is
      // accounted for by using the beginning of ST, not its transition to T.
      expect(
        maxDifference(zero, full, b.time - 0.05, b.time + b.qrs! + 0.012),
      ).toBeLessThan(1e-12);
    },
  );

  it("does not couple T amplitude to the QRS amplitude control", () => {
    const c = load("wellens_b");
    c.qrsAmp = 0.1;
    const low = synthesize(c, 10);
    c.qrsAmp = 2.5;
    const high = synthesize(c, 10),
      b = low.events.beats[3];
    expect(maxDifference(low, high, b.time, b.time + b.qrs!)).toBeGreaterThan(
      0.5,
    );
    expect(maxDifference(low, high, b.time + 0.2, b.time + b.qt!)).toBeLessThan(
      1e-12,
    );
  });
});

describe("Lesion intensity changes the supported regional repolarization", () => {
  it.each(["wellens_a", "wellens_b", "de_winter"])(
    "restores baseline at zero, preserves QRS, and changes continuously in %s",
    (id) => {
      const c = load(id);
      c.st = 0;
      const zero = synthesize(c, 10),
        baseline = synthesize({ ...c, ischemia: "none" }, 10);
      expect(maxDifference(zero, baseline)).toBeLessThan(1e-12);
      c.st = 1;
      const half = synthesize(c, 10);
      c.st = 2;
      const full = synthesize(c, 10),
        b = full.events.beats[3];
      let response = 0,
        error = 0;
      for (const lead of LEADS)
        for (let i = 0; i < full.leads[lead].length; i += 7) {
          const delta = full.leads[lead][i] - zero.leads[lead][i];
          response = Math.max(response, Math.abs(delta));
          error = Math.max(
            error,
            Math.abs(half.leads[lead][i] - zero.leads[lead][i] - delta / 2),
          );
        }
      expect(response).toBeGreaterThan(0.1);
      expect(error).toBeLessThan(1e-12);
      // de Winter ST starts in the last 12 ms of QRS. Compare the unaffected
      // core, leaving a further 40 ms for the antialias impulse response.
      expect(
        maxDifference(zero, full, b.time - 0.08, b.time + b.qrs! - 0.054),
      ).toBeLessThan(1e-12);
    },
  );

  it.each(["wellens_a", "wellens_b", "de_winter"])(
    "removes local repolarization corrections in the resolved phase of %s",
    (id) => {
      const c = load(id);
      c.phase = "chronic";
      c.st = 8;
      expect(lesionControlEffect(c)).toBe("none");
      expect(
        maxDifference(
          synthesize(c, 10),
          synthesize({ ...c, ischemia: "none" }, 10),
        ),
      ).toBeLessThan(1e-12);
    },
  );

  it.each(["hyperacute", "evolving"] as const)(
    "restores basal T at intensity zero in the %s phase",
    (phase) => {
      const c = load("inferior");
      c.phase = phase;
      c.st = 0;
      expect(lesionControlEffect(c)).toBe("st-t");
      expect(
        maxDifference(
          synthesize(c, 10),
          synthesize({ ...c, ischemia: "none" }, 10),
        ),
      ).toBeLessThan(1e-12);
    },
  );

  it("describes the components controlled by intensity, including inactive states", () => {
    expect(lesionControlEffect(load("sinus"))).toBe("none");
    expect(lesionControlEffect(load("inferior"))).toBe("st");
    expect(lesionControlEffect(load("wellens_a"))).toBe("t");
    expect(lesionControlEffect(load("wellens_b"))).toBe("t");
    expect(lesionControlEffect(load("de_winter"))).toBe("st-t");
    const c = load("posterior");
    c.phase = "chronic";
    expect(lesionControlEffect(c)).toBe("none");
  });
});
