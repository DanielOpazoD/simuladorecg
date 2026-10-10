import { expect, it } from "vitest";
import { fromPreset, presetById } from "../src/presets/catalog";
import { withInterfaceView } from "../src/ui/case-state";

it("un caso cargado no queda con ajustes de vista que la interfaz ya no expone", () => {
  const c = fromPreset(presetById("sinus")!);
  const loaded = { ...c, view: { ...c.view, fit: false, cabrera: true, timing: "simultaneous" as const, gain: 5, chestGain: 20 } };
  const v = withInterfaceView(loaded).view;
  expect(v).toMatchObject({ fit: true, cabrera: false, timing: "sequential", gain: 5, chestGain: 5 });
  expect(loaded.view.fit).toBe(false);
});
