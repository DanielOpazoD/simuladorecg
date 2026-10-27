import { describe, expect, it } from "vitest";
import { LEADS, type Lead, type Signal } from "../src/engine/types";
import { readStDistribution } from "../src/ui/st-distribution";

// Independent measurement fixture: no synthesis, renderer, stMarks or shared
// measurement constants. For a linear ramp and a 100 ms QRS, the inclusive
// PR[-40,-20] mean is at -30 ms; J[0,10] is at +105 ms and J+60 at +160 ms.
// Their differences are therefore slope * 0.135 and slope * 0.190 mV.
const SLOPES: Record<Lead, number> = {
  I: .1, II: .25, III: .15, aVR: -.175, aVL: -.025, aVF: .2,
  V1: -.08, V2: .12, V3: .2, V4: .32, V5: -.16, V6: .04,
};

function fixture(fs = 1000): Signal {
  const leads = {} as Signal["leads"];
  for (const lead of LEADS) leads[lead] = new Float64Array(5 * fs);
  for (let i = 0; i < 5 * fs; i++) {
    const t = i / fs, ramp = t < 2 ? t : 3 * t - 4;
    leads.I[i] = .4 + SLOPES.I * ramp;
    leads.II[i] = -.7 + SLOPES.II * ramp;
    leads.III[i] = leads.II[i] - leads.I[i];
    leads.aVR[i] = -(leads.I[i] + leads.II[i]) / 2;
    leads.aVL[i] = leads.I[i] - leads.II[i] / 2;
    leads.aVF[i] = leads.II[i] - leads.I[i] / 2;
    for (const lead of ["V1", "V2", "V3", "V4", "V5", "V6"] as const)
      leads[lead][i] = .2 + SLOPES[lead] * ramp;
  }
  return {
    fs, duration: 5, leads,
    events: { atria: [], spikes: [], beats: [1, 3].map(time => ({ time, kind: "normal", rr: 2, qrs: .1, qt: .4 })) },
    truth: { hr: 30, pr: null, qrs: 100, qt: 400, axis: null }, warnings: [],
  };
}

const row = (s: Signal, lead: Lead, beat = 0) => readStDistribution(s, beat)!.rows.find(r => r.lead === lead)!;

describe("ST distribution from one common final-sample event", () => {
  it.each([500, 1000])("matches the independent linear-ramp oracle at %i Hz", fs => {
    const s = fixture(fs), d = readStDistribution(s, 0)!;
    expect(d.beat).toBe(0);
    expect(d.qrsTime).toBe(1);
    expect(d.jTime).toBeCloseTo(1.1, 12);
    expect(d.rows.map(r => r.lead)).toEqual(LEADS);
    for (const r of d.rows) {
      expect(r.j0).toBeCloseTo(SLOPES[r.lead] * .135, 12);
      expect(r.j60).toBeCloseTo(SLOPES[r.lead] * .190, 12);
    }
  });

  it("reads the requested second event without changing beat between leads", () => {
    const d = readStDistribution(fixture(), 1)!;
    expect(d.beat).toBe(1);
    expect(d.qrsTime).toBe(3);
    expect(d.jTime).toBeCloseTo(3.1, 12);
    for (const r of d.rows) {
      expect(r.j0).toBeCloseTo(3 * SLOPES[r.lead] * .135, 12);
      expect(r.j60).toBeCloseTo(3 * SLOPES[r.lead] * .190, 12);
    }
  });

  it("cancels independent constant lead offsets against each local PR baseline", () => {
    const s = fixture(), before = readStDistribution(s, 0)!;
    LEADS.forEach((lead, n) => { s.leads[lead] = s.leads[lead].map(v => v + (n + 1) * .273); });
    const after = readStDistribution(s, 0)!;
    for (let i = 0; i < LEADS.length; i++) {
      expect(after.rows[i].j0).toBeCloseTo(before.rows[i].j0!, 12);
      expect(after.rows[i].j60).toBeCloseTo(before.rows[i].j60!, 12);
    }
  });

  it.each(["j0", "j60"] as const)("retains Einthoven/Goldberger relations for %s when present in the final arrays", metric => {
    const d = readStDistribution(fixture(), 0)!;
    const v = (lead: Lead) => d.rows.find(r => r.lead === lead)![metric]!;
    expect(v("III")).toBeCloseTo(v("II") - v("I"), 12);
    expect(v("aVR")).toBeCloseTo(-(v("I") + v("II")) / 2, 12);
    expect(v("aVL")).toBeCloseTo(v("I") - v("II") / 2, 12);
    expect(v("aVF")).toBeCloseTo(v("II") - v("I") / 2, 12);
  });

  it("reports supplied final samples instead of silently repairing a transformed lead", () => {
    const s = fixture();
    for (let i = 1100; i <= 1180; i++) s.leads.III[i] += .09;
    expect(row(s, "III").j0).toBeCloseTo(SLOPES.III * .135 + .09, 12);
    expect(row(s, "III").j60).toBeCloseTo(SLOPES.III * .190 + .09, 12);
    expect(row(s, "II").j0).toBeCloseTo(SLOPES.II * .135, 12);
  });

  it("uses the chronological middle eligible event, unaffected by ST magnitude", () => {
    const s = fixture();
    s.events.beats = [.7, 2, 3.3].map(time => ({ time, kind: "normal", rr: 1.3, qrs: .1, qt: .4 }));
    const before = readStDistribution(s)!;
    expect(before.beat).toBe(1);
    for (let i = 3400; i <= 3480; i++) s.leads.V6[i] += 8;
    expect(readStDistribution(s)!.beat).toBe(1);
  });

  it("chooses its default from the visible first 10 seconds with a complete zoom window", () => {
    const s = fixture(); s.duration = 65;
    for (const lead of LEADS) s.leads[lead] = Float64Array.from({ length: 65_000 }, (_, i) => SLOPES[lead] * i / 1000);
    s.events.beats = Array.from({ length: 65 }, (_, i) => ({ time: .4 + i, kind: "normal", rr: 1, qrs: .1, qt: .3 }));
    const d = readStDistribution(s)!;
    expect(d.beat).toBe(4); // 0.4 through 8.4 s fit the whole zoom, median is 4.4 s.
    expect(d.qrsTime).toBeCloseTo(4.4, 12);
    expect(d.qrsTime - .21).toBeGreaterThanOrEqual(0);
    expect(d.jTime + .62).toBeLessThanOrEqual(10);
    // An explicitly supplied event retains its meaning over the full signal;
    // it must not be silently replaced with the paper's automatic selection.
    const explicit = readStDistribution(s, 40)!;
    expect(explicit.beat).toBe(40);
    expect(explicit.qrsTime).toBeCloseTo(40.4, 12);
  });

  it("does not mutate samples, event metadata or truth, and does not use truth amplitudes", () => {
    const s = fixture(), copy = structuredClone(s), d = readStDistribution(s, 0);
    expect(s).toEqual(copy);
    s.truth = { hr: 999, pr: -1, qrs: 999, qt: -1, axis: 999 };
    expect(readStDistribution(s, 0)).toEqual(d);
  });
});

describe("ST distribution missing data is not a zero or a different beat", () => {
  it.each([-1, 2, 99, .5, Number.NaN, Infinity])("rejects explicit invalid event %s without falling back", beat => {
    expect(readStDistribution(fixture(), beat)).toBeNull();
  });

  it.each([0, -100, Number.NaN, Infinity])("rejects invalid sampling rate %s", fs => {
    const s = fixture(); s.fs = fs;
    expect(readStDistribution(s, 0)).toBeNull();
  });

  it.each([undefined, 0, -.1, Number.NaN, Infinity])("rejects absent/invalid QRS duration %s", qrs => {
    const s = fixture(); s.events.beats[0].qrs = qrs;
    expect(readStDistribution(s, 0)).toBeNull();
  });

  it.each([Number.NaN, Infinity, -.1])("rejects invalid event onset %s", time => {
    const s = fixture(); s.events.beats[0].time = time;
    expect(readStDistribution(s, 0)).toBeNull();
  });

  it("rejects a truncated PR or ST window, even with otherwise valid alternate beats", () => {
    const a = fixture(); a.events.beats[0].time = .03;
    expect(readStDistribution(a, 0)).toBeNull();
    const b = fixture(); b.events.beats[1].time = 4.9;
    expect(readStDistribution(b, 1)).toBeNull();
  });

  it("rejects PR overlapping known previous repolarization", () => {
    const s = fixture();
    s.events.beats.unshift({ time: .7, kind: "normal", rr: .7, qrs: .1, qt: .3 });
    expect(readStDistribution(s, 1)).toBeNull();
  });

  it("does not invent prior QT support when the previous event has none", () => {
    const s = fixture();
    s.events.beats.unshift({ time: .7, kind: "normal", rr: .7, qrs: .1 });
    expect(readStDistribution(s, 1)?.beat).toBe(1);
  });

  it("rejects ST support reaching the next QRS onset", () => {
    const s = fixture(); s.events.beats[1].time = 1.18;
    expect(readStDistribution(s, 0)).toBeNull();
  });

  it("retains the global I sample-length boundary regardless of duration metadata", () => {
    const s = fixture(); s.leads.I = s.leads.I.slice(0, 1180); s.duration = 999;
    expect(readStDistribution(s, 0)).toBeNull();
  });

  it("accepts an ST window whose endpoint is exactly the final available sample", () => {
    const s = fixture();
    for (const lead of LEADS) s.leads[lead] = s.leads[lead].slice(0, 1181);
    // Event onset=1 s, QRS=100 ms, ST support=80 ms => sample1180 exists.
    // Binary addition of 1 + .1 + .08 must not fabricate a truncated window.
    const d = readStDistribution(s, 0);
    expect(d).not.toBeNull();
    expect(d!.rows.find(r => r.lead === "II")!.j60).toBeCloseTo(SLOPES.II * .190, 12);
  });

  it("marks a missing or short non-reference lead unavailable without losing valid leads", () => {
    const s = fixture();
    delete (s.leads as Partial<Signal["leads"]>).V2;
    s.leads.V3 = s.leads.V3.slice(0, 1100);
    for (const lead of ["V2", "V3"] as const) expect(row(s, lead)).toMatchObject({ j0: null, j60: null });
    expect(row(s, "II").j0).toBeCloseTo(SLOPES.II * .135, 12);
  });

  it.each([Number.NaN, Infinity])("marks both values unavailable for a nonfinite PR sample (%s)", value => {
    const s = fixture(); s.leads.V2[970] = value;
    expect(row(s, "V2")).toMatchObject({ j0: null, j60: null });
    expect(row(s, "I").j0).toBeCloseTo(SLOPES.I * .135, 12);
  });

  it("does not lose a valid J+60 value when J mean contains NaN", () => {
    const s = fixture(); s.leads.V2[1105] = Number.NaN;
    expect(row(s, "V2").j0).toBeNull();
    expect(row(s, "V2").j60).toBeCloseTo(SLOPES.V2 * .190, 12);
  });

  it("does not lose a valid J mean when only J+60 is NaN", () => {
    const s = fixture(); s.leads.V2[1160] = Number.NaN;
    expect(row(s, "V2").j0).toBeCloseTo(SLOPES.V2 * .135, 12);
    expect(row(s, "V2").j60).toBeNull();
  });

  it("ignores nonfinite samples outside the requested measurement windows", () => {
    const s = fixture(); s.leads.V2[800] = Number.NaN; s.leads.V2[1140] = Number.NaN;
    expect(row(s, "V2").j0).toBeCloseTo(SLOPES.V2 * .135, 12);
    expect(row(s, "V2").j60).toBeCloseTo(SLOPES.V2 * .190, 12);
  });

  it("uses a point sample for J+60 and an inclusive mean for J[0,10]", () => {
    const s = fixture();
    s.leads.V2[1160] += .3;
    s.leads.V2[1161] += 8;
    s.leads.V2[1100] += .11;
    expect(row(s, "V2").j60).toBeCloseTo(SLOPES.V2 * .190 + .3, 12);
    expect(row(s, "V2").j0).toBeCloseTo(SLOPES.V2 * .135 + .01, 12);
  });
});
