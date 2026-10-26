import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import type { ECGCase, Signal } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";
import { modelMetricCards } from "../src/ui/metric-cards";
import { structuredDescription } from "../src/ui/structured-description";
import { descriptionInfoHtml } from "../src/ui/description-info";

const load = (patch: Partial<ECGCase> = {}): ECGCase => ({
  ...fromPreset(presetById("sinus")!), filter: "off", acquisition: "ideal", variability: 0, ...patch,
});
const invert = (c: ECGCase): ECGCase => ({ ...c, artifacts: { ...c.artifacts, reversed: true } });
const circularError = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const cardAxis = (c: ECGCase, s: Signal) => modelMetricCards(c, s).find(card => card.key === "axis")!;

/** Area in the actual frontal output samples, from the local pre-QRS level.
 * Generator events locate a window; no diagnostic detector is being evaluated. */
function sampleAxis(s: Signal) {
  let x = 0, y = 0;
  for (const b of s.events.beats.filter(beat => beat.kind === "normal" && beat.time > 0.5 && beat.time < 8)) {
    const start = Math.ceil(b.time * s.fs), end = Math.floor((b.time + b.qrs!) * s.fs);
    const level = (a: Float64Array) => (a[start - 4] + a[start - 3] + a[start - 2]) / 3;
    const bx = level(s.leads.I), by = level(s.leads.aVF);
    for (let i = start; i < end; i++) { x += s.leads.I[i] - bx; y += s.leads.aVF[i] - by; }
  }
  return Math.atan2(y, x) * 180 / Math.PI;
}

describe("eje basal y referencia de adquisición invertida", () => {
  it.each([[-150, -30], [-90, -90], [-60, -120], [0, 180], [50, 130], [90, 90], [150, 30], [180, 0]])(
    "eje basal %s°: tarjeta y diagrama muestran %s° tras RA/LA", (basal, shown) => {
      const c = invert(load()), signal = synthesize(c, 10);
      signal.truth.axis = basal;
      const before = structuredClone(signal), card = cardAxis(c, signal), description = structuredDescription(c, signal);
      expect(Number.parseFloat(card.value)).toBe(shown);
      expect(card.note).toContain("adquisición invertida");
      expect(description.axis).toBe(shown);
      expect(description.lines.find(line => line.key === "E")!.text).toContain(`Eje del registro ${shown}°`);
      expect(description.axisContext).toContain(`Eje basal del modelo: ${basal}°`);
      const info = descriptionInfoHtml("axis", description.measures, description.axis, description.axisContext);
      expect(info).toContain(`eje del registro con brazos invertidos ${shown}°`);
      expect(info).toContain(`Eje basal del modelo: ${basal}°`);
      expect(signal).toEqual(before);
    },
  );

  it.each([-60, 0, 50, 90])("%s°: la referencia mostrada sigue el cambio de las áreas I/aVF", axis => {
    const c = load({ axis }), reversed = invert(c), a = synthesize(c, 10), b = synthesize(reversed, 10);
    const acquired = sampleAxis(b), displayed = structuredDescription(reversed, b).axis!;
    // The electrode operation negates I and leaves aVF exactly unchanged.
    expect(circularError(acquired, 180 - sampleAxis(a))).toBeLessThan(1e-9);
    // Existing learned-axis/output-grid precision, not clinical accuracy.
    expect(circularError(displayed, acquired)).toBeLessThan(3);
    expect(b.truth.axis).toBe(a.truth.axis);
    expect(b.events).toEqual(a.events);
  });

  it("la descripción identifica la inversión y no la enseña como desviación fisiológica", () => {
    const c = invert(load({ axis: 50 })), signal = synthesize(c, 10), description = structuredDescription(c, signal);
    const line = description.lines.find(row => row.key === "E")!.text;
    expect(line).toContain("brazos invertidos");
    expect(line).not.toMatch(/desviado a la derecha|desviado a la izquierda|\(normal\)/);
    expect(description.summary).toContain("eje del registro");
    expect(description.summary).toContain("inversión de brazos");
  });

  it("un eje indeterminado sigue ausente, nunca se convierte en 180°", () => {
    const c = invert(load()), signal = synthesize(c, 10);
    signal.truth.axis = null;
    const description = structuredDescription(c, signal);
    expect(cardAxis(c, signal).value).toBe("—");
    expect(description.axis).toBeNull();
    expect(description.axisContext).toContain("no determinable");
    const info = descriptionInfoHtml("axis", description.measures, description.axis, description.axisContext);
    expect(info).not.toContain('class="hex-axis"');
  });

  it("Cabrera y el caso sin inversión conservan el eje basal exacto", () => {
    const c = load(), signal = synthesize(c, 10), cabrera = { ...c, view: { ...c.view, cabrera: true } };
    const plain = structuredDescription(c, signal), viewed = structuredDescription(cabrera, signal);
    expect(plain.axis).toBe(signal.truth.axis);
    expect(viewed.axis).toBe(signal.truth.axis);
    expect(viewed.axisContext).toBeUndefined();
    expect(cardAxis(cabrera, signal)).toEqual(cardAxis(c, signal));
    expect(plain.lines.find(line => line.key === "E")!.text).toContain("normal");
  });
});
