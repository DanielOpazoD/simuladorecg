import { esc } from "../src/ui/helpers";
import { presetTitle } from "../src/presets/nomenclature";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/presets/catalog";
import { aboutDialogHtml, keyboardHelpHtml } from "../src/ui/about-dialog";

describe("about dialog content", () => {
  it("offers the same keyboard help folded in the guide and alone", () => {
    const html = aboutDialogHtml([]);
    expect(html).toContain(`<details class="keyboard-help"><summary>Atajos de teclado</summary>${keyboardHelpHtml()}</details>`);
    expect(html).not.toContain('class="keyboard-help" open');
  });

  it("documents only trace-scoped keys and the actual scale cycles", () => {
    const html = keyboardHelpHtml();
    for (const key of ["M", "P", "R", "V", "G", "C", "Espacio", "Flechas", "Mayús + flechas", "?"])
      expect(html).toContain(`<kbd>${key}</kbd>`);
    expect(html).toContain("12,5 / 25 / 50 mm/s");
    expect(html).toContain("2,5 / 5 / 10 / 20 mm/mV");
    expect(html).toContain("No se activan al escribir en campos ni dentro de un diálogo.");
    expect(html).not.toContain("Siguiente caso");
  });
  it("retains the educational and measurement limitations", () => {
    const html = aboutDialogHtml([]);
    for (const text of [
      "Las pruebas técnicas no constituyen validación clínica.",
      "No utiliza trazados grabados ni imágenes de pacientes.",
      "PR/QT pueden no ser estimables.",
      "sin sustituir las medidas por valores del generador.",
      "la etiqueta del caso no demuestra una arteria ocluida.",
      "Las fases son estados paramétricos y no una cronología de un paciente.",
      "V7–V9 y V3R–V4R; captura/fusión en TV;",
      "VVI a demanda y secuencias programadas de flutter son modelos idealizados.",
      "La pérdida total de captura VVI solo se representa sin escape intrínseco;",
    ])
      expect(html).toContain(text);
  });

  it("renders each preset with its existing strategy and limitation in order", () => {
    const html = aboutDialogHtml(PRESETS);
    const rows = [...html.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)];
    expect(rows).toHaveLength(PRESETS.length);
    expect(rows.map((row) => row.slice(1))).toEqual(PRESETS.map((preset) => [
      esc(presetTitle(preset)),
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
