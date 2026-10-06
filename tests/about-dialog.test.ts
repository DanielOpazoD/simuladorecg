import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/presets/catalog";
import { aboutDialogHtml } from "../src/ui/about-dialog";

describe("about dialog content", () => {
  it("retains the educational and measurement limitations", () => {
    const html = aboutDialogHtml([]);
    for (const text of [
      "Las pruebas técnicas no constituyen validación clínica.",
      "No utiliza trazados grabados ni imágenes de pacientes.",
      "PR/QT pueden no ser estimables.",
      "sin sustituir las medidas por valores del generador.",
      "la etiqueta del caso no demuestra una arteria ocluida.",
      "Las fases son estados paramétricos y no una cronología de un paciente.",
      "V7–V9 y V3R–V4R; marcapasos a demanda;",
    ])
      expect(html).toContain(text);
  });

  it("renders each preset with its existing strategy and limitation in order", () => {
    const html = aboutDialogHtml(PRESETS);
    const rows = [...html.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)];
    expect(rows).toHaveLength(PRESETS.length);
    expect(rows.map((row) => row.slice(1))).toEqual(PRESETS.map((preset) => [
      preset.name,
      { pending: "Pendiente", local: "Aproximado · ajuste local", vectorial: "Aproximado · vectorial" }[preset.strategy],
      preset.limitation,
    ]));
  });

  it("retains references as HTTPS links opening with noopener", () => {
    const html = aboutDialogHtml([]);
    const links = [...html.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener">/g)];
    expect(links).toHaveLength(9);
    expect(links.every((link) => link[1].startsWith("https://"))).toBe(true);
    expect(html).toContain("https://physionet.org/content/ecgsyn/1.0.0/");
    expect(html).toContain("Quinta Definición Universal de Infarto (2026)");
  });

  it("keeps the table structure without inventing rows for an empty catalog", () => {
    const html = aboutDialogHtml([]);
    expect(html).toContain("<th>Patrón</th><th>Estado / estrategia</th><th>Límite</th>");
    expect(html).toContain("<tbody></tbody>");
  });
});
