import { describe, it, expect } from "vitest";
import { measure } from "../src/engine/measure";
import { fixture, BIPHASIC_T, U, NOTCHED_QRS, T } from "./fixtures";
const close = (value: number | null, target: number, tolerance: number) => {
  expect(value).not.toBeNull();
  expect(Math.abs(value! - target)).toBeLessThanOrEqual(tolerance);
};
describe("Independent analytic waveform acceptance", () => {
  it.each([250, 500, 1000])(
    "finds exact landmarks at %s Hz without generator knowledge",
    (fs) => {
      const m = measure(fixture({ fs }));
      close(m.hr, 60, 0.1);
      close(m.pr, 160, 12);
      close(m.qrs, 90, 12);
      close(m.qt, 400, 18);
      expect(m.beats.length).toBeGreaterThanOrEqual(7);
      for (const b of m.beats) {
        close(b.onset % 1, 0.36, 0.01);
        close(b.offset % 1, 0.45, 0.01);
      }
    },
  );
  it("preserves the terminal lobe of a biphasic T", () => {
    const m = measure(fixture({ t: BIPHASIC_T }));
    close(m.qt, 480, 18);
  });
  it("keeps a separated U out of QT", () => {
    close(measure(fixture({ u: U })).qt, 400, 18);
  });
  it("inverted T has the same boundaries", () => {
    const a = measure(fixture()),
      b = measure(fixture({ t: T.map(([t, y]) => [t, -y]) }));
    close(b.qt, a.qt!, 2);
  });
  it("bridges a flat notch inside a wide QRS", () => {
    const m = measure(
      fixture({ qrs: NOTCHED_QRS, t: T.map(([t, y]) => [t + 0.08, y]) }),
    );
    close(m.qrs, 160, 12);
    close(m.qt, 480, 18);
  });
  it("does not invent P, T, or organized activity", () => {
    expect(measure(fixture({ p: [] })).pr).toBeNull();
    expect(measure(fixture({ t: [] })).qt).toBeNull();
    expect(measure(fixture({ noiseOnly: true })).hr).toBeNull();
  });
  it("rejects a stable PR summary with atrioventricular dissociation", () => {
    expect(measure(fixture({ pPeriod: 0.73 })).pr).toBeNull();
  });
  it("is invariant to per-lead DC offsets", () => {
    const a = measure(fixture()),
      b = measure(fixture({ offset: true }));
    close(b.pr, a.pr!, 2);
    close(b.qrs, a.qrs!, 2);
    close(b.qt, a.qt!, 2);
  });
});
