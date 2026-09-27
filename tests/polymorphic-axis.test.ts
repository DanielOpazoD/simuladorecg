import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { auditMeasurement } from "../src/engine/analysis/model-audit";
import { referenceInWindow } from "../src/engine/reference";
import { fromPreset, presetById } from "../src/presets/catalog";

describe("Polymorphic ventricular axis reference", () => {
  it("does not publish a single synthetic axis for torsades", () => {
    const signal = synthesize(fromPreset(presetById("torsades")!), 10);
    expect(signal.truth.axis).toBeNull();
    expect(referenceInWindow(signal, 0, 10).axis).toBeNull();
  });

  it("withdraws an otherwise usable global axis when its model reference is absent", () => {
    const signal = synthesize(fromPreset(presetById("sinus")!), 10);
    const raw = measure(signal);
    expect(raw.axis).not.toBeNull();
    expect(raw.evidence.axis.status).not.toBe("unavailable");
    const withoutGlobalAxis = { ...signal, truth: { ...signal.truth, axis: null } };
    const audited = auditMeasurement(withoutGlobalAxis, raw);
    expect(audited.axis).toBeNull();
    expect(audited.evidence.axis.status).toBe("unavailable");
    expect(audited.evidence.axis.reason).toContain("eje ventricular global estable");
    expect(audited.rejected?.axis).toBe(raw.axis);
  });

  it("does not manufacture an axis-specific reason when a stronger detection failure already withdrew it", () => {
    const signal = synthesize(fromPreset(presetById("torsades")!), 10);
    const raw = measure(signal);
    const audited = auditMeasurement(signal, raw);
    expect(audited.axis).toBeNull();
    expect(audited.evidence.axis.status).toBe("unavailable");
    expect(audited.rejected?.axis).toBe(raw.axis);
  });

  it.each(["sinus", "vt", "vvi", "complete_v"] as const)(
    "preserves the existing global axis reference for %s",
    (id) => {
      const signal = synthesize(fromPreset(presetById(id)!), 10);
      expect(signal.truth.axis).not.toBeNull();
    },
  );
});
