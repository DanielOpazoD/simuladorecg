import { isVviDemand, isVviNoncapture, vviScopeDescription } from "../engine/vvi-demand";
import { rhythmControlState } from './rhythm-controls';
import { regionalActivationState } from "../engine/regional-activation";
import { regionalActivationControls } from "./regional-activation";
import { isNatural, LEADS, type ECGCase, type NaturalControl } from "../engine/types";
import { lesionControlEffect, tVector } from "../engine/morphology";
import { range, select, toggle } from "./helpers";
import { learnedSecondaryRepolarization, noConductedBeats, realisticModelFor } from "../engine/realistic/scope";
import { learnedIschemiaArtery } from "../engine/realistic/ischemia";

/** On the learned base, P and T follow the patient until their slider is moved. */
function learnedNatural(c: ECGCase, wave: "p" | "t") {
  const model = realisticModelFor(c);
  if (!model) return false;
  return wave === "p" ? c.naturalPAxis !== false : c.naturalTAxis !== false || learnedSecondaryRepolarization(model);
}
/** F2.3: on the learned normal base, an untouched control shows the patient's own
 * value; the first move fixes it. */
function naturalLabel(c: ECGCase, control: NaturalControl, label: string) {
  return realisticModelFor(c) === "NORM" && !noConductedBeats(c) && isNatural(c, control) ? `${label} (natural del paciente)` : label;
}
/** Chronic phase of a territory with a learned old-infarction population. */
const oldInfarction = (c: ECGCase) => {
  const model = realisticModelFor(c);
  return model === "IMI" || model === "ASMI";
};
/** Acute occlusion learned from STAFF III (F4) on the learned base. */
const learnedLesion = (c: ECGCase) => realisticModelFor(c) === "NORM" && learnedIschemiaArtery(c) !== null;
const ARTERY_NAME = { LAD: "descendente anterior", RCA: "coronaria derecha", LCX: "circunfleja" } as const;
/** Learned populations whose whole ST-T is secondary (it follows the QRS gain). */
const learnedSecondary = (c: ECGCase) => {
  const model = realisticModelFor(c);
  return model !== null && learnedSecondaryRepolarization(model);
};
/** Applicability of the existing amplitude controls, separate from clinical severity. */
export function amplitudeControlState(c: ECGCase) {
  const organized = c.rhythm !== "vf" && c.rhythm !== "asystole" && !isVviNoncapture(c),
    effect = lesionControlEffect(c),
    mutedT = effect === "t" && c.tAmp === 0;
  const note = !organized
    ? "Sin complejos organizados: los controles de T y lesión ST–T no se aplican."
    : learnedSecondary(c)
      ? "ST–T secundaria del paciente (aprendida de ECG reales): sigue la amplitud del QRS; la amplitud de T no se aplica."
    : learnedLesion(c)
      ? `Lesión aguda aprendida de oclusiones con balón (STAFF III, ${ARTERY_NAME[learnedIschemiaArtery(c)!]}): intensidad 2 es el cambio del paciente, 0 lo retira; la morfología del ST es la del paciente.`
    : mutedT
      ? "Este patrón modifica la T. Reactiva Amplitud de T para ajustar su intensidad."
      : effect === "none"
        ? c.phase === "chronic" && c.ischemia !== "none"
          ? oldInfarction(c)
            ? "Infarto antiguo aprendido de pacientes reales (PTB-XL): ondas Q y repolarización del paciente; la intensidad de lesión no se aplica."
            : "ST resuelto: el componente primario de lesión está desactivado; se conserva la repolarización basal o secundaria. En este territorio o combinación no genera ondas Q de necrosis."
          : "Sin patrón primario ST–T activo: la intensidad de lesión no se aplica."
        : effect === "t"
          ? "Intensidad: escala la modificación de T de Wellens; 0 conserva la T basal y 2 es el patrón de referencia. No expresa grado de estenosis."
          : "Intensidad: escala el componente primario ST–T; 0 lo retira y 2 es el patrón de referencia. No expresa extensión de necrosis ni gravedad clínica.";
  return { tDisabled: !organized || learnedSecondary(c), stDisabled: !organized || effect === "none" || mutedT, note };
}
/** Applicability of this model's primary-T direction control, not clinical impossibility. */
export function tAxisControlState(c: ECGCase) {
  const rhythm = rhythmControlState(c);
  if (rhythm.noOrganizedBeats) return {disabled: true, reason: "Control inactivo: no hay T organizada."};
  if (c.tAmp === 0) return {disabled: true, reason: "Control inactivo: T anulada. El eje se conserva."};
  if (rhythm.qrsAxisDisabled || c.conduction === "lbbb" || c.conduction.includes("rbbb"))
    return {disabled: true, reason: "Control inactivo. Derivado del QRS; valor conservado para T primaria."};
  if (c.conduction === "wpw")
    return {disabled: true, reason: "Control inactivo. La T secundaria sigue la activación QRS con delta; el eje se conserva para T primaria."};
  if (c.overload !== "none")
    return {disabled: true, reason: "Control inactivo: dirección fijada por la sobrecarga."};
  // Probe the actual primary-vector rule instead of duplicating cancellation
  // factors for every ischemic/electrolyte combination in the interface.
  const beat = {time: 0, rr: 1, kind: "normal" as const};
  const first = tVector({...c, tAxis: 0}, beat), second = tVector({...c, tAxis: 90}, beat);
  if (first.every((value, i) => value === second[i]))
    return {disabled: true, reason: "Control inactivo: este patrón no usa el eje solicitado."};
  return {disabled: false, reason: "Ajusta la T primaria; la T secundaria sigue el QRS."};
}

export function controls(c: ECGCase) {
  const amplitude = amplitudeControlState(c), rhythm = rhythmControlState(c), tAxis = tAxisControlState(c);
  const inactiveConduction: string[] = [];
  const contextualSelect = (...args: Parameters<typeof select>) => {
    const html = select(...args);
    if (args[4]) { inactiveConduction.push(html); return ""; }
    return html;
  };
  const contextualRange = (...args: Parameters<typeof range>) => {
    const html = range(...args);
    if (args[7]) { inactiveConduction.push(html); return ""; }
    return html;
  };
  return `<div class="inspector-title"><h2>Ajustar el caso</h2><span>Valores programados del modelo, no mediciones del trazado.</span></div>
 <div class="control-tabs" role="tablist" aria-label="Parámetros"><button role="tab" aria-selected="true" data-panel="base">Intervalos</button><button role="tab" aria-selected="false" data-panel="conduction">Conducción</button><button role="tab" aria-selected="false" data-panel="st">ST y ondas</button><button role="tab" aria-selected="false" data-panel="signal">Señal y papel</button></div>
 <div class="control-panel" data-control-panel="base"><div class="range-grid">
 ${range("hr", rhythm.baseRateLabel, 20, 250, 1, c.hr, "lpm", rhythm.baseRateDisabled)}
 ${range("pr", naturalLabel(c, "pr", "Intervalo PR"), 80, 400, 5, c.pr, "ms", rhythm.prDisabled)}${range("qrs", naturalLabel(c, "qrs", "Duración QRS"), regionalActivationState(c).active ? regionalActivationState(c).minimumQrsMs : 60, 240, 5, c.qrs, "ms", rhythm.noOrganizedBeats)}${range("qtc", naturalLabel(c, "qtc", "QTc · Fridericia"), 260, 650, 5, c.qtc, "ms", rhythm.noOrganizedBeats)}${range("axis", naturalLabel(c, "axis", "Eje QRS solicitado"), -180, 180, 5, c.axis, "°", rhythm.qrsAxisDisabled)}${range("variability", "Variabilidad sinusal RR", 0, 0.3, 0.01, c.variability, "", rhythm.variabilityDisabled)}
 </div><div class="inline-fields">${range("respiratoryRate", "Frecuencia respiratoria", 6, 40, 1, c.respiratoryRate, "rpm")}${range("atrialRate", "FC auricular independiente", 40, 350, 5, c.atrialRate, "lpm", rhythm.atrialRateDisabled)}</div><p class="control-note">Los controles atenuados no actúan en el ritmo seleccionado; conservan su valor para otros ritmos. FC auricular independiente: flutter, BAV completo y TV. El QT se adapta a la historia de RR con memoria exponencial de ≈40 s; no responde de golpe a un RR aislado.</p></div>
 <div class="control-panel" data-control-panel="conduction" hidden><div class="field-grid">
 ${contextualSelect(
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
 ${contextualSelect(
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
 ${contextualSelect(
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
   rhythm.conductionDisabled,
 )}
 ${contextualSelect(
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
 ${contextualSelect(
   "escape",
   "Escape en BAV completo",
   [
     ["junctional", "De la unión"],
     ["ventricular", "Ventricular"],
   ],
   c.escape,
   rhythm.escapeDisabled,
 )}
 ${contextualSelect("flutterPattern", "Secuencia docente del flutter",
   [["fixed", "Relación fija"], ["2-3", "Alterna 2:1 / 3:1"], ["3-4", "Alterna 3:1 / 4:1"]],
   c.flutterPattern ?? "fixed", c.rhythm !== "flutter")}
 ${contextualSelect(
   "flutterRatio",
   "Conducción del flutter",
   [
     [2, "2:1"],
     [3, "3:1"],
     [4, "4:1"],
   ],
   c.flutterRatio,
   c.rhythm !== "flutter" || (c.flutterPattern ?? "fixed") !== "fixed",
 )}
 ${contextualSelect(
   "pacing",
   "Modo de estimulación",
   [
     ["AAI", "AAI"],
     ["VVI", "VVI"],
     ["DDD", "DDD"],
   ],
   c.pacing,
   c.rhythm !== "paced",
 )}
 ${contextualSelect("pacingBehavior", "Comportamiento VVI", [["fixed","Captura fija histórica"],["demand","Demanda · sensado ideal"],["demand-no-capture","Sin captura ni escape · experimental"]], c.pacingBehavior ?? "fixed", c.rhythm !== "paced" || c.pacing !== "VVI")}
 ${contextualRange("intrinsicRate", "Actividad ventricular intrínseca", 0, 150, 1, c.intrinsicRate ?? 0, "lpm · 0 ausente", !isVviDemand(c))}
 ${contextualRange("coupling", "Acoplamiento de ectopia", 0.3, 0.85, 0.01, c.coupling, "× RR", rhythm.couplingDisabled)}
 </div>${inactiveConduction.length ? `<details class="inactive-controls" data-control-details="conduction"><summary>Controles sin efecto en este ritmo (${inactiveConduction.length})</summary><p class="control-note">Se conservan los valores para otros ritmos. Esta lista describe los límites del modelo, no combinaciones clínicamente imposibles.</p><div class="field-grid">${inactiveConduction.join("")}</div></details>` : ""}<p class="control-note">Las secuencias variables del flutter son ejemplos con retraso AV constante; no simulan Wenckebach multinivel ni respuesta a fármacos. Las combinaciones no implementadas se desactivan. FA + BAV completo es posible clínicamente, pero queda fuera del modelo actual. ${isVviDemand(c) ? vviScopeDescription(c) : "La estimulación fija representa captura periódica. El modo de demanda optativo solo está disponible en VVI."}</p><section id="regional-activation-controls" aria-label="Activación regional experimental">${regionalActivationControls(c)}</section></div>
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
     ["chronic", "Crónica · ST resuelto / infarto antiguo"],
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
   learnedLesion(c),
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
 ${range("st", "Intensidad de lesión", 0, 8, 0.25, c.st, "escala del patrón", amplitude.stDisabled)}${range("transition", "Rotación precordial", -1, 1, 0.1, c.transition, "", rhythm.noOrganizedBeats)}
 ${range("pAxis", learnedNatural(c, "p") ? "Eje de P (natural del paciente)" : "Eje de P", -180, 180, 5, c.pAxis, "°", rhythm.pAxisDisabled)}<div class="t-axis-control">${range("tAxis", learnedNatural(c, "t") ? "Eje de T (natural del paciente)" : "Eje de T", -180, 180, 5, c.tAxis, "°", tAxis.disabled, "t-axis-note")}<p class="control-note" id="t-axis-note">${tAxis.reason}</p></div>${range("pAmp", naturalLabel(c, "pAmp", "Amplitud de P"), 0, 0.5, 0.01, c.pAmp, "mV ref.", rhythm.pAmplitudeDisabled)}${range("qrsAmp", naturalLabel(c, "qrsAmp", "Amplitud QRS"), 0.1, 3, 0.1, c.qrsAmp, "×", rhythm.noOrganizedBeats)}${range("tAmp", naturalLabel(c, "tAmp", "Amplitud de T"), 0, 1, 0.01, c.tAmp, "mV ref.", amplitude.tDisabled)}
 ${toggle("septalQ", "Componente septal", c.septalQ)}</div><p class="control-note" id="amplitude-note">${amplitude.note}</p><p class="control-note">Amplitud de P ajusta las ondas P programadas, no las ondas de FA/flutter. En ritmo de la unión la dirección retrógrada es fija. Los controles atenuados conservan su valor.</p><p class="control-note">Amplitud de T escala toda la T, incluidas las correcciones locales; 0 la anula. No modifica QRS, el ST primario/secundario ni U. Los voltajes de referencia no son amplitudes de una derivación concreta.</p><p class="control-note" id="secondary-repolarization-note">T secundaria: la dirección sigue la activación QRS, no el control Eje de T; la sobrecarga actúa a través del QRS. ${c.rhythm === "torsades" ? "En torsades el modelo no añade un segmento ST separable." : "El ST secundario sigue esa misma fuente QRS, independientemente de Amplitud de T."} ST/T son aproximados y no validan criterios ST/QRS. El ST de lesión primaria es un componente distinto.</p></div>
 <div class="control-panel" data-control-panel="signal" hidden><div class="field-grid">
 ${select(
   "filter",
   "Filtro",
   [
     ["off", "Sin filtro (antialias activo)"],
     ["diagnostic", "Diagnóstico · 0,05–150 Hz"],
     ["monitor", "Monitor · 0,5–40 Hz · fase cero"],
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
 ${select(
   "acquisition",
   "Adquisición",
   [
     ["realistic", "Realista: ruido de reposo medido"],
     ["ideal", "Ideal: sin ruido de fondo"],
   ],
   c.acquisition ?? "realistic",
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
