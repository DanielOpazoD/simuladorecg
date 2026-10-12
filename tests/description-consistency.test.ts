import { describe, expect, it } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { structuredDescription } from "../src/ui/structured-description";
import { modelMetricCards } from "../src/ui/metric-cards";

const number = (html: string) => Number(html.replace(/<[^>]+>/g, " ").match(/-?\d+(?:[.,]\d+)?/)![0].replace(",", "."));

describe("descripción estructurada y tarjetas", () => {
  for (const id of ["sinus", "bigeminy", "trigeminy", "pvc"])
    it(`${id}: el QTc de la descripción es el de la tarjeta (latidos dominantes)`, () => {
      const c = fromPreset(presetById(id)!), s = synthesize(c, 10);
      const card = modelMetricCards(c, s).find((x) => x.key === "qt")!;
      const line = structuredDescription(c, s).lines.map((l) => l.text).join(" ");
      const described = Number(line.match(/QTc (\d+) ms/)![1]);
      expect(Math.abs(described - number(card.value)), `${line} | ${card.value}`).toBeLessThanOrEqual(2);
    });
});
