import { LEADS, type ECGCase } from "../engine/types";
import { lesionControlEffect } from "../engine/morphology";
import { range, select, toggle } from "./helpers";
/** Applicability of the existing amplitude controls, separate from clinical severity. */
export function amplitudeControlState(c: ECGCase) {
  const organized = c.rhythm !== "vf" && c.rhythm !== "asystole",
    effect = lesionControlEffect(c),
    mutedT = effect === "t" && c.tAmp === 0;
  const note = !organized
    ? "Sin complejos organizados: los controles de T y lesión ST–T no se aplican."
    : mutedT
      ? "Este patrón modifica la T. Reactiva Amplitud de T para ajustar su intensidad."
      : effect === "none"
        ? c.phase === "chronic" && c.ischemia !== "none"
          ? "ST resuelto: el componente primario de lesión está desactivado; se conserva la repolarización basal o secundaria. No genera ondas Q de necrosis."
          : "Sin patrón primario ST–T activo: la intensidad de lesión no se aplica."
        : effect === "t"
          ? "Intensidad: escala la modificación de T de Wellens; 0 conserva la T basal y 2 es el patrón de referencia. No expresa grado de estenosis."
          : "Intensidad: escala el componente primario ST–T; 0 lo retira y 2 es el patrón de referencia. No expresa extensión de necrosis ni gravedad clínica.";
  return { tDisabled: !organized, stDisabled: !organized || effect === "none" || mutedT, note };
}
export function controls(c: ECGCase) {
  const amplitude = amplitudeControlState(c);
  return `<div class="inspector-title"><h2>Parámetros del modelo</h2><span>Modifica la fisiología y observa el ECG</span></div>
 <div class="control-tabs" role="tablist" aria-label="Parámetros"><button role="tab" aria-selected="true" data-panel="base">Fisiología</button><button role="tab" aria-selected="false" data-panel="conduction">Conducción</button><button role="tab" aria-selected="false" data-panel="st">ST y morfología</button><button role="tab" aria-selected="false" data-panel="signal">Señal y papel</button></div>
 <div class="control-panel" data-control-panel="base"><div class="range-grid">
 ${range("hr", c.av === "complete" ? "Frecuencia de escape" : c.av !== "normal" && c.av !== "first" ? "Frecuencia auricular" : "Frecuencia base", 20, 250, 1, c.hr, "lpm")}
 ${range("pr", "Intervalo PR", 80, 400, 5, c.pr, "ms")}${range("qrs", "Duración QRS", 60, 240, 5, c.qrs, "ms")}${range("qtc", "QTc · Fridericia", 260, 650, 5, c.qtc, "ms")}${range("axis", "Eje QRS solicitado", -180, 180, 5, c.axis, "°")}${range("variability", "Variabilidad sinusal RR", 0, 0.3, 0.01, c.variability, "")}
 </div><div class="inline-fields">${range("respiratoryRate", "Frecuencia respiratoria", 6, 40, 1, c.respiratoryRate, "rpm")}${range("atrialRate", "FC auricular independiente", 40, 350, 5, c.atrialRate, "lpm")}</div><p class="control-note">FC auricular independiente: flutter, BAV completo y TV. El QT se adapta a la historia de RR con memoria exponencial de ≈40 s; no responde de golpe a un RR aislado.</p></div>
 <div class="control-panel" data-control-panel="conduction" hidden><div class="field-grid">
 ${select(
   "rhythm",
   "Ritmo",
   [
     ["sinus", "Sinusal"],
     ["af", "Fibrilación auricular"],
     ["flutter", "Flutter auricular"],
     ["junctional", "Ritmo de la unión / TSV"],
     ["idioventricular", "Idioventricular"],
     ["vt", "TV monomórfica"],
     ["torsades", "TV polimórfica"],
     ["vf", "Fibrilación ventricular"],
     ["asystole", "Asistolia"],
     ["paced", "Estimulación"],
   ],
   c.rhythm,
 )}
 ${select(
   "av",
   "Conducción AV",
   [
     ["normal", "Conducción 1:1"],
     ["first", "BAV de primer grado"],
     ["mobitz1", "Wenckebach 4:3"],
     ["mobitz2", "Mobitz II"],
     ["two_one", "Bloqueo 2:1"],
     ["high", "Alto grado 3:1"],
     ["complete", "BAV completo"],
   ],
   c.av,
   c.rhythm !== "sinus",
 )}
 ${select(
   "conduction",
   "Conducción intraventricular",
   [
     ["normal", "Normal"],
     ["rbbb", "BRD completo"],
     ["irbbb", "BRD incompleto"],
     ["lbbb", "BRI completo"],
     ["lafb", "HBAI"],
     ["lpfb", "HBPI"],
     ["rbbb_lafb", "BRD + HBAI"],
     ["rbbb_lpfb", "BRD + HBPI"],
     ["wpw", "Preexcitación"],
   ],
   c.conduction,
   ["vt", "torsades", "idioventricular", "vf", "asystole"].includes(c.rhythm),
 )}
 ${select(
   "ectopy",
   "Ectopia",
   [
     ["none", "Sin ectopia"],
     ["pac", "Auricular aislada"],
     ["pvc", "Ventricular aislada"],
     ["bigeminy", "Bigeminismo"],
     ["trigeminy", "Trigeminismo"],
     ["couplet", "Dupla ventricular"],
   ],
   c.ectopy,
   c.rhythm !== "sinus" || c.av !== "normal",
 )}
 ${select(
   "escape",
   "Escape en BAV completo",
   [
     ["junctional", "De la unión"],
     ["ventricular", "Ventricular"],
   ],
   c.escape,
   c.av !== "complete",
 )}
 ${select(
   "flutterRatio",
   "Conducción del flutter",
   [
     [2, "2:1"],
     [3, "3:1"],
     [4, "4:1"],
   ],
   c.flutterRatio,
   c.rhythm !== "flutter",
 )}
 ${select(
   "pacing",
   "Estimulación capturada",
   [
     ["AAI", "AAI"],
     ["VVI", "VVI"],
     ["DDD", "DDD"],
   ],
   c.pacing,
   c.rhythm !== "paced",
 )}
 ${range("coupling", "Acoplamiento de ectopia", 0.3, 0.85, 0.01, c.coupling, "× RR")}
 </div><p class="control-note">Las combinaciones no implementadas se desactivan. FA + BAV completo es posible clínicamente, pero queda fuera del modelo actual. La estimulación representa captura fija; no simula demanda.</p></div>
 <div class="control-panel" data-control-panel="st" hidden><div class="field-grid">
 ${select(
   "ischemia",
   "Patrón de lesión",
   [
     ["none", "Sin lesión"],
     ["inferior_rca", "Inferior · III > II"],
     ["inferior_lcx", "Inferior · II ≥ III"],
     ["anterior", "Anterior"],
     ["lateral", "Lateral"],
     ["posterior", "Posterior"],
     ["rv", "Ventrículo derecho"],
     ["diffuse", "ST difuso / aVR"],
     ["subendo", "Subendocárdico"],
     ["wellens_a", "Wellens A"],
     ["wellens_b", "Wellens B"],
     ["de_winter", "De Winter"],
     ["pericarditis", "Pericarditis"],
     ["sgarbossa", "BRI con lesión concordante"],
   ],
   c.ischemia,
 )}
 ${select(
   "phase",
   "Fase de repolarización",
   [
     ["hyperacute", "Hiperaguda · T prominente"],
     ["acute", "Aguda · ST"],
     ["evolving", "Evolutiva · T invertida"],
     ["chronic", "ST resuelto"],
   ],
   c.phase,
 )}
 ${select(
   "stShape",
   "Morfología del ST",
   [
     ["plateau", "Meseta"],
     ["concave", "Cóncava"],
     ["convex", "Convexa"],
   ],
   c.stShape,
 )}
 ${select(
   "overload",
   "Sobrecarga",
   [
     ["none", "Ninguna"],
     ["rv_acute", "VD aguda"],
     ["rv_chronic", "VD crónica"],
     ["lv", "Ventrículo izquierdo"],
   ],
   c.overload,
 )}
 ${range("st", "Intensidad de lesión", 0, 8, 0.25, c.st, "escala del patrón", amplitude.stDisabled)}${range("transition", "Rotación precordial", -1, 1, 0.1, c.transition, "")}
 ${range("pAxis", "Eje de P", -180, 180, 5, c.pAxis, "°")}${range("tAxis", "Eje de T", -180, 180, 5, c.tAxis, "°")}${range("pAmp", "Amplitud auricular", 0, 0.5, 0.01, c.pAmp, "mV ref.")}${range("qrsAmp", "Amplitud QRS", 0.1, 3, 0.1, c.qrsAmp, "×")}${range("tAmp", "Amplitud de T", 0, 1, 0.01, c.tAmp, "mV ref.", amplitude.tDisabled)}
 ${toggle("septalQ", "Componente septal", c.septalQ)}</div><p class="control-note" id="amplitude-note">${amplitude.note}</p><p class="control-note">Amplitud de T escala toda la T, incluidas las correcciones locales; 0 la anula. No modifica QRS, ST secundario ni U. Los voltajes de referencia no son amplitudes de una derivación concreta.</p></div>
 <div class="control-panel" data-control-panel="signal" hidden><div class="field-grid">
 ${select(
   "filter",
   "Filtro",
   [
     ["off", "Sin filtro (antialias activo)"],
     ["diagnostic", "Diagnóstico · 0,05–150 Hz"],
     ["monitor", "Monitor · 0,5–40 Hz"],
     ["aggressive", "Paso alto 2 Hz · demostración ST"],
   ],
   c.filter,
 )}
 ${select(
   "mainsFrequency",
   "Frecuencia de la interferencia",
   [
     [50, "Red de 50 Hz"],
     [60, "Red de 60 Hz"],
   ],
   c.mainsFrequency,
 )}
 ${select(
   "notch",
   "Filtro de red",
   [
     [0, "Desactivado"],
     [50, "50 Hz"],
     [60, "60 Hz"],
   ],
   c.notch,
 )}
 ${range("artifacts.baseline", "Deriva de línea base", 0, 1, 0.05, c.artifacts.baseline, "")}${range("artifacts.muscle", "Actividad muscular", 0, 1, 0.05, c.artifacts.muscle, "")}${range("artifacts.mains", "Interferencia de red", 0, 1, 0.05, c.artifacts.mains, "")}${range("artifacts.loose", "Electrodo V2 inestable", 0, 1, 0.05, c.artifacts.loose, "")}
 ${toggle("artifacts.reversed", "Inversión brazo derecho / izquierdo", c.artifacts.reversed)}${toggle("view.cabrera", "Orden de Cabrera (−aVR)", c.view.cabrera)}
 ${select(
   "view.chestGain",
   "Ganancia precordial",
   [
     [2.5, "2,5 mm/mV"],
     [5, "5 mm/mV"],
     [10, "10 mm/mV"],
     [20, "20 mm/mV"],
   ],
   c.view.chestGain,
 )}
 <label class="field"><span>Semilla reproducible</span><input type="number" min="1" max="2147483647" data-key="seed" value="${c.seed}"/></label>
 </div><div class="calibration-area"><div><h3>Calibración física</h3><p>Ajusta esta regla a 50 mm reales. Desactiva «Ajustar al ancho» para aplicar la calibración al papel; conserva el zoom del navegador.</p></div><div class="physical-ruler" style="width:${c.view.pxPerMm * 50}px"><span>50 mm</span></div>${range("view.pxPerMm", "Píxeles por milímetro", 2, 10, 0.01, Number(c.view.pxPerMm.toFixed(2)), "px/mm")}${toggle("view.fit", "Ajustar al ancho", c.view.fit)}</div></div>`;
}
export const leadOptions = (c: ECGCase) =>
  select(
    "view.lead",
    "Derivación",
    LEADS.map((l) => [l, l]),
    c.view.lead,
  );
