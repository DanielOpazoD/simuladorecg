import type { Preset } from "./catalog";

/** Clinical display names. Presentation only: the frozen catalog keeps its historical
 * `name`, so saved cases, seeds and evidence stay byte-identical. One nomenclature per
 * family (e.g. «Bloqueo AV de segundo grado Mobitz I / Mobitz II / 2:1»). */
const TITLES: Readonly<Record<string, string>> = {
  af: "Fibrilación auricular con respuesta controlada",
  af_fast: "Fibrilación auricular con respuesta rápida",
  af_slow: "Fibrilación auricular con respuesta lenta",
  flutter: "Flutter auricular con conducción 2:1",
  flutter3: "Flutter auricular con conducción 3:1",
  av1: "Bloqueo AV de primer grado",
  wenckebach: "Bloqueo AV de segundo grado Mobitz I (Wenckebach)",
  mobitz2: "Bloqueo AV de segundo grado Mobitz II",
  av21: "Bloqueo AV de segundo grado 2:1",
  complete: "Bloqueo AV completo con escape de la unión",
  complete_v: "Bloqueo AV completo con escape ventricular",
  lafb: "Bloqueo fascicular anterior izquierdo",
  lpfb: "Bloqueo fascicular posterior izquierdo",
  bifascicular: "Bloqueo bifascicular · BRD + BFAI",
  bifascicular_pr: "Bloqueo bifascicular con BAV de primer grado",
  diffuse: "Descenso difuso del ST con elevación en aVR",
  hyperk: "Hiperpotasemia · ondas T picudas",
  pericarditis: "Pericarditis aguda",
  lateral: "Oclusión de la Cx con lesión lateral",
  posterior: "Oclusión posterior",
};
export const presetTitle = (preset: Pick<Preset, "id" | "name">): string => TITLES[preset.id] ?? preset.name;
