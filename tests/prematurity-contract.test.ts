import { describe, expect, it } from "vitest";
import {
  assertRepresentableEvents,
  ModelScopeError,
  tWaveSupport,
} from "../src/engine/constraints";
import { generateEvents } from "../src/engine/rhythm";
import { assignRepolarization } from "../src/engine/repolarization";
import { synthesize } from "../src/engine/signal";
import {
  cloneCase,
  DEFAULT_CASE,
  normalizeCase,
  type ECGCase,
  type EventSeries,
} from "../src/engine/types";
import { fromPreset, PRESETS } from "../src/presets/catalog";

const testCase = (patch: Partial<ECGCase> = {}) =>
  normalizeCase({ ...cloneCase(DEFAULT_CASE), ...patch });
const schedule = (c: ECGCase, duration = 10) => {
  const events = generateEvents(c, duration);
  assignRepolarization(c, events.beats);
  return events;
};
const pair = (
  interval: number,
  qt = 0.4,
  kind: "normal" | "pvc" = "pvc",
): EventSeries => ({
  atria: [],
  spikes: [],
  beats: [
    { time: 0, kind: "normal", rr: 1, qt },
    { time: interval, kind, rr: interval, qt },
  ],
});

describe("Declared domain of the additive event model", () => {
  it.each([
    [
      "PVC",
      { hr: 150, ectopy: "pvc", coupling: 0.3 },
      120,
      "premature-before-t",
    ],
    [
      "PAC",
      { hr: 150, ectopy: "pac", coupling: 0.3 },
      104,
      "premature-before-t",
    ],
    [
      "couplet",
      { hr: 250, ectopy: "couplet", coupling: 0.3 },
      72,
      "qrs-overlap",
    ],
  ] as const)(
    "identifies the unsupported %s schedule without changing it",
    (_name, patch, minimum, code) => {
      const c = testCase({ ...patch, variability: 0 }),
        events = schedule(c),
        originalCase = structuredClone(c),
        originalEvents = structuredClone(events);
      expect(
        Math.min(...events.beats.slice(1).map((b) => b.rr)) * 1000,
      ).toBeCloseTo(minimum, 6);
      let failure: unknown;
      try {
        assertRepresentableEvents(c, events);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(ModelScopeError);
      expect((failure as ModelScopeError).code).toBe(code);
      expect((failure as Error).message).toMatch(
        /^Fuera del alcance del modelo:/,
      );
      expect(() => synthesize(c, 10)).toThrow(ModelScopeError);
      expect(c).toEqual(originalCase);
      expect(events).toEqual(originalEvents);
    },
  );

  it("uses the preceding QRS support, allowing a boundary touch but not overlap", () => {
    const c = testCase({ qrs: 90 });
    expect(() =>
      assertRepresentableEvents(c, pair(0.09, 0.4, "normal")),
    ).not.toThrow();
    expect(() =>
      assertRepresentableEvents(c, pair(0.089, 0.4, "normal")),
    ).toThrow(ModelScopeError);
    expect(() =>
      assertRepresentableEvents(c, pair(0.1, 0.4, "normal")),
    ).not.toThrow();
    c.qrs = 110;
    expect(() =>
      assertRepresentableEvents(c, pair(0.1, 0.4, "normal")),
    ).toThrow(ModelScopeError);
  });

  it("defines its ectopy boundary by the same T support as synthesis", () => {
    const c = testCase({ qrs: 90 }),
      boundary = tWaveSupport(c, 0.09, 0.4).start;
    expect(() => assertRepresentableEvents(c, pair(boundary - 0.001))).toThrow(
      ModelScopeError,
    );
    expect(() => assertRepresentableEvents(c, pair(boundary))).not.toThrow();
    expect(() =>
      assertRepresentableEvents(c, pair(boundary + 0.001)),
    ).not.toThrow();
    c.electrolyte = "hyperkalemia";
    expect(tWaveSupport(c, 0.09, 0.4)).toEqual({ start: 0.27, duration: 0.13 });
    expect(() => assertRepresentableEvents(c, pair(0.26))).toThrow(
      ModelScopeError,
    );
    expect(() => assertRepresentableEvents(c, pair(0.27))).not.toThrow();
  });

  it("does not impose a universal RR minimum or equate QT with refractoriness", () => {
    const c = testCase({ qrs: 90 });
    expect(() => assertRepresentableEvents(c, pair(0.2, 0.3))).not.toThrow();
    expect(() => assertRepresentableEvents(c, pair(0.2, 0.5))).toThrow(
      ModelScopeError,
    );
    // This supported overlap with T does not establish biological plausibility.
    expect(() => assertRepresentableEvents(c, pair(0.3, 0.5))).not.toThrow();
  });

  it("associates a premature conducted atrial event, not an independent P or a spike", () => {
    const c = testCase({ qrs: 90 }),
      events = pair(0.2, 0.5, "normal");
    events.spikes = [0.1, 0.195];
    events.atria = [{ time: 0.1, kind: "ectopic", conducted: false }];
    expect(() => assertRepresentableEvents(c, events)).not.toThrow();
    events.atria = [{ time: 0.1, kind: "sinus", conducted: true, pr: 0.1 }];
    expect(() => assertRepresentableEvents(c, events)).not.toThrow();
    events.atria = [{ time: 0.1, kind: "ectopic", conducted: true, pr: 0.1 }];
    expect(() => assertRepresentableEvents(c, events)).toThrow(ModelScopeError);
  });

  it("checks source timing independently of rounded display/sample positions", () => {
    const c = testCase({ qrs: 90 }),
      boundary = tWaveSupport(c, 0.09, 0.4).start,
      early = pair(boundary - 0.0001),
      late = pair(boundary + 0.0001);
    for (const fs of [250, 500, 1000]) {
      // At all these rates the two event times round to the same sample.
      expect(Math.round(early.beats[1].time * fs)).toBe(
        Math.round(late.beats[1].time * fs),
      );
    }
    expect(() => assertRepresentableEvents(c, early)).toThrow(ModelScopeError);
    expect(() => assertRepresentableEvents(c, late)).not.toThrow();
  });

  it("requires assigned QT rather than inventing a recovery time", () => {
    const c = testCase(),
      events = pair(0.2);
    delete events.beats[0].qt;
    expect(() => assertRepresentableEvents(c, events)).toThrow(
      "repolarización calculada",
    );
  });

  it("keeps all 61 existing defaults within the documented model domain", () => {
    const active = PRESETS.filter((p) => p.strategy !== "pending");
    expect(active).toHaveLength(61);
    for (const preset of active) {
      const c = fromPreset(preset);
      expect(
        () => assertRepresentableEvents(c, schedule(c, 69.1)),
        preset.id,
      ).not.toThrow();
    }
  });

  it("preserves a valid prefix and never removes premature beats to pass validation", () => {
    const c = testCase({
        ectopy: "pvc",
        hr: 72,
        coupling: 0.58,
        variability: 0,
      }),
      short = schedule(c, 10),
      long = schedule(c, 20),
      original = structuredClone(short);
    assertRepresentableEvents(c, short);
    assertRepresentableEvents(c, long);
    expect(short.beats.some((b) => b.kind === "pvc")).toBe(true);
    expect(short).toEqual(original);
    expect(short.beats).toEqual(long.beats.filter((b) => b.time < 10));
    expect(short.atria).toEqual(long.atria.slice(0, short.atria.length));
  });
});
