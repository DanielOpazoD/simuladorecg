import { describe, expect, it } from "vitest";
import { practicePanelHtml } from "../src/ui/practice-panel";
import { createPractice } from "../src/ui/practice-session";

const feedback = {
  observations: ["FC ventricular estimada"],
  limitations: ["Sin validación clínica"],
  leads: "II y aVR",
  cue: "Comprueba la actividad P",
  referenceCurrent: true,
};

describe("practice panel presentation", () => {
  it.each([true, false])("keeps references concealed until answering (signal ready: %s)", ready => {
    const html = practicePanelHtml(createPractice([0, 0]), ready, null);
    expect(html).toContain("¿Qué patrón representa este ejercicio?");
    expect(html.match(/data-answer=/g)).toHaveLength(4);
    expect(html.match(/ disabled /g)?.length ?? 0).toBe(ready ? 0 : 4);
    expect(html).toContain('data-action="end-quiz"');
    expect(html).toContain("Las referencias se muestran al contestar.");
    expect(html).not.toContain('class="practice-feedback"');
    expect(html).not.toContain('data-action="quiz"');
  });

  it.each(["sinus", "af"])("reveals only configured reference and observed feedback after %s", answer => {
    const state = createPractice([0, 0]);
    state.answer = answer;
    const html = practicePanelHtml(state, true, feedback);
    expect(html).toContain(answer === "sinus" ? "Coincide con el caso configurado" : "Compara los rasgos del ejercicio");
    expect(html.match(/ disabled /g)).toHaveLength(4);
    expect(html.match(/class="correct"/g)).toHaveLength(1);
    expect(html.match(/class="incorrect"/g)?.length ?? 0).toBe(answer === "sinus" ? 0 : 1);
    expect(html).toContain("FC ventricular estimada");
    expect(html).toContain('role="status"');
    expect(html).toContain("Etiqueta configurada, no diagnóstico automático.");
    expect(html).toContain("no mide precisión clínica.");
    expect(html).toContain('data-action="quiz"');
    if (answer === "af") expect(html).toContain("Elegiste Fibrilación auricular.");
  });

  it("escapes every feedback field and preset label without mutating inputs", () => {
    const state = createPractice([0, 0]);
    state.preset = { ...state.preset, name: "<img src=x>" };
    state.choices = state.choices.map(p => ({ ...p, name: "<script>&" }));
    state.answer = state.preset.id;
    const unsafe = { ...feedback, observations: ["<script>"], limitations: ["<b>&"], leads: "<svg>", cue: "<img>" };
    const before = structuredClone({ state, unsafe });
    const html = practicePanelHtml(state, true, unsafe);
    for (const literal of ["<script>", "<img", "<svg>", "<b>"])
      expect(html).not.toContain(literal);
    for (const escaped of ["&lt;script&gt;", "&lt;img", "&lt;svg&gt;", "&lt;b&gt;&amp;"])
      expect(html).toContain(escaped);
    expect({ state, unsafe }).toEqual(before);
  });
});
