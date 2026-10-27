import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase, LEADS, type Signal } from "../src/engine/types";
import { parseNotes, serializeNotes, signalFingerprint, teachingCaseIdentity, validateTeachingNotes, type TeachingNote } from "../src/ui/teaching-notes";

function recording(fs = 100): Signal {
  return { fs, duration: 12, leads: Object.fromEntries(LEADS.map((lead, j) => [lead, Float64Array.from({ length: fs * 12 }, (_, i) => j / 10 + Math.sin(i / 7))])) as Signal["leads"],
    events: { beats: [], atria: [], spikes: [] }, truth: { hr: 60, pr: null, qrs: null, qt: null, axis: null }, warnings: [] };
}
const note: TeachingNote = { id: "note-1", lead: "V2", kind: "box", t0: 2.1, t1: 2.4, v0: -0.2, v1: 0.5, text: "ST: observación personal" };

describe("physical-coordinate personal annotations", () => {
  it("round-trips a copy without changing the note, signal or case", () => {
    const signal = recording(), c = cloneCase(DEFAULT_CASE), copy = structuredClone(signal), original = structuredClone(note);
    const decoded = parseNotes(serializeNotes(signal, [note], c), signal, c);
    expect(decoded).toEqual([note]); expect(decoded[0]).not.toBe(note);
    expect(signal).toEqual(copy); expect(note).toEqual(original); expect(c).toEqual(DEFAULT_CASE);
  });
  it("uses recording origin and quantizes only time to the acquired sample lattice", () => {
    const [actual] = validateTeachingNotes([{ ...note, t0: 2.101, t1: 2.399, v0: 0.123456 }], recording(500));
    expect(actual.t0).toBe(2.102); expect(actual.t1).toBe(2.4); expect(actual.v0).toBe(0.123456);
  });
  it("preserves arrow direction and text as data", () => {
    const arrow = { ...note, kind: "arrow", t0: 2.4, t1: 2.1, text: '<script>alert("test")</script>' };
    expect(validateTeachingNotes([arrow], recording())).toEqual([arrow]);
  });
  it.each([
    ["unknown lead", { lead: "V7" }], ["unknown shape", { kind: "diagnosis" }], ["negative origin", { t0: -0.01 }],
    ["beyond acquired samples", { t1: 12 }], ["nonfinite time", { t0: Infinity }], ["nonfinite voltage", { v1: NaN }],
    ["text object", { text: { unsafe: true } }], ["excess text", { text: "a".repeat(161) }], ["control character", { text: "a\u0000b" }],
    ["unsafe id", { id: "<tag>" }], ["extreme voltage", { v1: 101 }],
  ])("rejects %s atomically", (_, patch) => {
    const input = [note, { ...note, id: "note-2", ...patch }];
    expect(() => validateTeachingNotes(input, recording())).toThrow();
    expect(input[0]).toBe(note);
  });
  it("rejects duplicate ids and oversized collections", () => {
    expect(() => validateTeachingNotes([note, note], recording())).toThrow(/únicos/);
    expect(() => validateTeachingNotes(Array.from({ length: 51 }, (_, i) => ({ ...note, id: `n${i}` })), recording())).toThrow(/50/);
  });
  it("rejects invalid or inconsistent sampling metadata", () => {
    const signal = recording(); signal.leads.V6 = new Float64Array(1);
    expect(() => validateTeachingNotes([note], signal)).toThrow(/escala temporal/);
    expect(() => signalFingerprint({ ...recording(), fs: 0 })).toThrow();
  });
});

describe("note-session identity and negative controls", () => {
  it.each(LEADS)("detects one changed sample in %s, including the last sample", lead => {
    const signal = recording(), raw = serializeNotes(signal, [note]);
    signal.leads[lead][signal.leads[lead].length - 1] += 0.0000000001;
    expect(() => parseNotes(raw, signal)).toThrow(/otra señal/);
  });
  it("detects fs, duration, sample-order and polarity changes", () => {
    for (const mutate of [
      (s: Signal) => { s.fs *= 2; }, (s: Signal) => { s.duration -= 1; },
      (s: Signal) => { s.leads.aVR.reverse(); }, (s: Signal) => { s.leads.I = s.leads.I.map(v => -v); },
    ]) {
      const signal = recording(), raw = serializeNotes(signal, [note]); mutate(signal);
      expect(() => parseNotes(raw, signal)).toThrow(/otra señal/);
    }
  });
  it("does not tie acquired coordinates to presentation metadata", () => {
    const signal = recording(), c = cloneCase(DEFAULT_CASE), raw = serializeNotes(signal, [note], c), altered = cloneCase(c);
    altered.view.speed = 50; altered.view.gain = 20; altered.view.palette = "dark"; altered.view.cabrera = true;
    altered.name = "Otro título"; altered.presetId = "custom";
    expect(teachingCaseIdentity(altered)).toBe(teachingCaseIdentity(c));
    expect(parseNotes(raw, signal, altered)).toEqual([note]);
  });
  it("rejects a different model state even when a caller supplies identical samples", () => {
    const signal = recording(), c = cloneCase(DEFAULT_CASE), raw = serializeNotes(signal, [note], c);
    c.st += 1;
    expect(() => parseNotes(raw, signal, c)).toThrow(/mismo modelo/);
    expect(() => parseNotes(raw, signal)).toThrow(/mismo modelo/);
  });
  it.each(["not json", "null", "[]", '{"format":"unknown"}', "x".repeat(80001)])("rejects malformed/incompatible imports", raw => {
    expect(() => parseNotes(raw, recording())).toThrow();
  });
  it("rejects incompatible units and unsupported versions", () => {
    const signal = recording(), parsed = JSON.parse(serializeNotes(signal, [note]));
    parsed.units.voltage = "uV";
    expect(() => parseNotes(JSON.stringify(parsed), signal)).toThrow(/unidades/);
    parsed.units.voltage = "mV-acquired"; parsed.version = 2;
    expect(() => parseNotes(JSON.stringify(parsed), signal)).toThrow(/versión/);
  });
});
