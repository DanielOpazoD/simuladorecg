import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, LEADS, type Lead, type Signal } from "../src/engine/types";
import { acquiredAt, teachingComparison, teachingRegion } from "../src/ui/teaching-signal";
import { parseNotes, serializeNotes, signalFingerprint, type TeachingNote } from "../src/ui/teaching-notes";
import { ECHO_SEGMENTS, ECHO_VIEWS, teachingContraction, teachingEchoScenario, wallGeometry } from "../src/ui/teaching-echo";

/** Analytical final samples, not produced by the ECG renderer or generator. */
function fixture(fs = 500, offset = 0): Signal {
  const a = new Float64Array(2 * fs).fill(.7 + offset);
  // J=1.1s; inclusive first ten milliseconds all0.9mV; J+60 is0.8mV.
  a.fill(.9 + offset, Math.round(1.1 * fs), Math.round(1.11 * fs) + 1);
  a[Math.round(1.16 * fs)] = .8 + offset;
  return { fs, duration: 2, leads: Object.fromEntries(LEADS.map(l => [l, a.slice()])) as Record<Lead, Float64Array>,
    events: { atria: [], spikes: [], beats: [{ time: .2, qrs: .1, qt: .3, rr: .8, kind: "normal" }, { time: 1, qrs: .1, qt: .4, rr: .8, kind: "normal" }, { time: 1.8, qrs: .1, qt: .4, rr: .8, kind: "normal" }] },
    truth: { hr: 75, pr: .16, qrs: .1, qt: .4, axis: 60 }, warnings: [] };
}
const note: TeachingNote = { id: "independent", lead: "V2", kind: "box", t0: 1.1, t1: 1.18, v0: .65, v1: .95, text: "Independent coordinates" };

describe("independent final-sample teaching contracts", () => {
  it.each([500, 1000])("measures the analytical plateau at %sHz and preserves acquired coordinates", fs => {
    const s = fixture(fs), snapshot = structuredClone(s), r = teachingRegion(s, "V2", 1, "st")!;
    expect(r.value).toBeCloseTo(.2, 12); expect(r.baseline).toBeCloseTo(.7, 12);
    expect(r.start).toBeCloseTo(1.1, 12); expect(r.end).toBeCloseTo(1.18, 12);
    expect(r.low).toBeCloseTo(.64, 12); expect(r.high).toBeCloseTo(.96, 12);
    expect(acquiredAt(s, "V2", 1.16)).toBeCloseTo(.8, 12);
    expect(s).toEqual(snapshot);
  });
  it("common-mode offset moves the region but cannot change its relative ST level", () => {
    const a = teachingRegion(fixture(), "II", 1, "st")!, b = teachingRegion(fixture(500, -.43), "II", 1, "st")!;
    expect(b.value).toBeCloseTo(a.value!, 12); expect(b.low - a.low).toBeCloseTo(-.43, 12);
    expect(b.baseline! - a.baseline!).toBeCloseTo(-.43, 12);
  });
  it("isolated final-sample change changes only the selected lead observation", () => {
    const a = fixture(); a.leads.V2.fill(.4, 550, 556);
    expect(teachingRegion(a, "V2", 1, "st")!.value).toBeCloseTo(-.3, 12);
    expect(teachingRegion(a, "II", 1, "st")!.value).toBeCloseTo(.2, 12);
  });
  it.each(["overlap", "missing-reference", "nonfinite-ST", "invalid-index"])("does not invent a valid ST region for %s", reason => {
    const a = fixture(); let index = 1;
    if (reason === "overlap") a.events.beats[0].qt = 1;
    if (reason === "missing-reference") a.events.beats[1].time = .01;
    if (reason === "nonfinite-ST") a.leads.V2[560] = NaN;
    if (reason === "invalid-index") index = 999;
    expect(teachingRegion(a, "V2", index, "st")).toBeNull();
  });
  it("rejects mismatched sample clocks and beat calendars from algebraic comparison", () => {
    const a = fixture(), same = fixture(), shifted = fixture(); shifted.events.beats[1].time += .002;
    expect(teachingComparison(a, same).compatible).toBe(true);
    expect(teachingComparison(a, shifted).compatible).toBe(false);
    expect(teachingComparison(a, fixture(1000)).compatible).toBe(false);
    const short = fixture(); short.leads.V6 = short.leads.V6.subarray(0, 999);
    expect(teachingComparison(a, short).compatible).toBe(false);
  });
});

describe("independent personal-note transport controls", () => {
  it.each(LEADS)("rejects one altered acquired sample in %s", lead => {
    const s = fixture(), saved = serializeNotes(s, [note]), copy = fixture();
    copy.leads[lead][copy.leads[lead].length - 1] += .000001;
    expect(signalFingerprint(copy)).not.toBe(signalFingerprint(s));
    expect(() => parseNotes(saved, copy)).toThrow(/otra señal/);
  });
  it("keeps plain-text markup as data while preserving exact note units", () => {
    const s = fixture(), markup = { ...note, text: '<script>alert("test")</script>' };
    expect(parseNotes(serializeNotes(s, [markup]), s)).toEqual([markup]);
    const bad = JSON.parse(serializeNotes(s, [note])); bad.units.voltage = "paper-pixels";
    expect(() => parseNotes(JSON.stringify(bad), s)).toThrow(/unidades/);
  });
});

describe("independent echo clinical-boundary and kinematic controls", () => {
  it("uses sixteen motion segments and standard long-axis memberships", () => {
    expect(ECHO_SEGMENTS.map(s => s.id)).toEqual(Array.from({length:16}, (_, i) => i + 1));
    expect(new Set(ECHO_VIEWS.A4C.segments)).toEqual(new Set([3,9,14,6,12,16]));
    expect(new Set(ECHO_VIEWS.A2C.segments)).toEqual(new Set([1,7,13,4,10,15]));
    expect(new Set(ECHO_VIEWS.PLAX.segments)).toEqual(new Set([2,8,5,11]));
  });
  it("ST amplitude, phase and acquisition changes cannot imply a new mechanical diagnosis", () => {
    const c = {...structuredClone(DEFAULT_CASE), ischemia:"anterior" as const};
    const reference = teachingEchoScenario(c);
    for (const changes of [{st:0}, {st:3}, {phase:"chronic" as const}, {filter:"aggressive" as const}, {artifacts:{...c.artifacts,muscle:1}}])
      expect(teachingEchoScenario({...c,...changes})).toEqual(reference);
  });
  it("normal is a genuine negative control and unsupported physiology remains unavailable", () => {
    const c = structuredClone(DEFAULT_CASE), normal = teachingEchoScenario(c);
    expect(normal.available).toBe(true); expect(new Set(Object.values(normal.motion))).toEqual(new Set(["normal"]));
    for (const changes of [{rhythm:"af" as const}, {rhythm:"vf" as const}, {conduction:"lbbb" as const}, {ectopy:"pvc" as const}, {ischemia:"wellens_b" as const}, {overload:"lv" as const}])
      expect(teachingEchoScenario({...c,...changes}).available).toBe(false);
  });
  it("illustrated motion separates thickening from akinesis and dyskinesis", () => {
    expect(teachingContraction(.079,1)).toBe(0);
    const normal = wallGeometry("normal",1), hypo = wallGeometry("hypo",1), aki = wallGeometry("aki",1), dys = wallGeometry("dys",1);
    expect(normal.thickness).toBeGreaterThan(hypo.thickness); expect(hypo.thickness).toBeGreaterThan(1);
    expect(aki).toEqual({excursion:0,thickness:1}); expect(dys.thickness).toBeLessThan(1); expect(dys.excursion).toBeLessThan(0);
    expect(teachingContraction(1,1)).toBe(0);
  });
});
