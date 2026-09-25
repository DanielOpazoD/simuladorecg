from pathlib import Path

def write(p,s):
    Path(p).parent.mkdir(parents=True,exist_ok=True)
    Path(p).write_text(s)
def replace(p,a,b):
    s=Path(p).read_text(); assert a in s,(p,a[:100]); Path(p).write_text(s.replace(a,b))

write('src/ui/practice-feedback.ts', '''import type { ECGCase, Lead, Measurement, Signal } from "../engine/types";
import { caseContext } from "../presets/case-context";

/** Curriculum, not a classifier. Contrasts are questions to inspect, never
 * automatically inferred findings. Only the existing fourteen exercises are used. */
export const PRACTICE = {
  sinus: { alternatives: ["af", "av1", "flutter"], leads: "II y aVR", cue: "Comprueba la actividad P y su relación con cada QRS; regularidad aislada no demuestra origen sinusal." },
  af: { alternatives: ["flutter", "sinus", "bigeminy"], leads: "II y V1; tira larga", cue: "Compara la variación de RR y busca actividad auricular organizada. Distingue irregularidad variable de un patrón alternante repetido." },
  flutter: { alternatives: ["af", "sinus", "vt"], leads: "II, III, aVF y V1", cue: "Busca actividad auricular repetitiva entre QRS. La frecuencia ventricular por sí sola no distingue flutter de otras taquicardias." },
  wenckebach: { alternatives: ["av1", "complete", "af"], leads: "II; tira larga", cue: "Sigue cada P y compara los PR consecutivos y la pausa. Un PR mediano no demuestra la secuencia de Wenckebach." },
  complete: { alternatives: ["wenckebach", "av1", "vt"], leads: "II y V1; tira larga", cue: "Sigue por separado los ciclos auriculares y ventriculares. Una coincidencia P-QRS aislada no demuestra conducción AV." },
  rbbb: { alternatives: ["lbbb", "vt", "vvi"], leads: "V1, I y V6", cue: "Compara las fuerzas terminales de V1 con I/V6; un QRS ancho aislado no identifica una rama." },
  lbbb: { alternatives: ["rbbb", "vvi", "anterior"], leads: "V1, I, aVL y V6", cue: "Revisa morfología ventricular y cambios secundarios antes de atribuir el ST a lesión primaria. Busca espigas para contrastar estimulación." },
  inferior: { alternatives: ["anterior", "wellens_b", "sinus"], leads: "II, III, aVF, I y aVL", cue: "Compara el nivel del ST entre inferiores y derivaciones opuestas. El territorio observado no demuestra una arteria culpable." },
  vt: { alternatives: ["vvi", "lbbb", "flutter"], leads: "II, V1 y V6; tira larga", cue: "Relaciona anchura, regularidad, actividad auricular y espigas. No toda taquicardia de QRS ancho queda identificada por la anchura." },
  bigeminy: { alternatives: ["af", "wenckebach", "vt"], leads: "II y V1; tira larga", cue: "Busca alternancia repetida de complejos y acoplamiento. Contrasta esa repetición con irregularidad variable o bloqueo auricular." },
  av1: { alternatives: ["sinus", "wenckebach", "complete"], leads: "II", cue: "Comprueba si cada P conduce y compara PR de varios latidos. No confundas un PR prolongado fijo con PR progresivos o disociación." },
  anterior: { alternatives: ["inferior", "lbbb", "wellens_b"], leads: "V1-V4 e inferiores", cue: "Compara distribución de ST/T y QRS. La forma regional orienta la lectura; no asigna por sí sola arteria, oclusión ni tratamiento." },
  vvi: { alternatives: ["lbbb", "vt", "complete"], leads: "II, V1 y V6", cue: "Busca espigas y su relación con el QRS; distingue la estimulación de una morfología ancha sin estímulo visible." },
  wellens_b: { alternatives: ["anterior", "lbbb", "sinus"], leads: "V2-V4", cue: "Compara polaridad y forma de T con ST y QRS. La imagen de T invertida no establece el síndrome clínico ni su anatomía." },
} as const;
export type PracticeId = keyof typeof PRACTICE;
export const PRACTICE_IDS = Object.keys(PRACTICE) as PracticeId[];
export function practiceQuestion(random: readonly number[]) {
  const index = (n: number, size: number) => (Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0) % size;
  const id = PRACTICE_IDS[index(random[0], PRACTICE_IDS.length)];
  const choices: PracticeId[] = [...PRACTICE[id].alternatives];
  choices.splice(index(random[1], 4), 0, id);
  return { id, choices };
}
const median = (a: number[]) => { const v = [...a].sort((x,y)=>x-y); return (v[Math.floor((v.length-1)/2)] + v[Math.floor(v.length/2)])/2; };
const number = (n: number, decimals = 0) => n.toFixed(decimals).replace(".", ",");
export const ST_READING_MARGIN_MV = 0.02; // Fixture readability, NOT ischemia threshold.
const ST_LEADS: readonly Lead[] = ["I", "II", "III", "aVL", "aVF", "V1", "V2", "V3", "V4"];

/** Uses only sampled values + measured QRS boundaries; no events/truth/parameters
 * are allowed to supply timing. Baseline: measured onset -35 to -20 ms.
 * ST*: measured offset +60 ms. J* may be biased by the heuristic delineator. */
export function sampledST(s: Pick<Signal, "fs" | "leads">, m: Measurement): Partial<Record<Lead, number>> | null {
  if (!Number.isFinite(s.fs) || s.fs <= 0 || m.evidence.qrs.status !== "usable") return null;
  const rows: Record<string, number[]> = Object.fromEntries(ST_LEADS.map(l=>[l,[]]));
  for (const b of m.beats) {
    if (![b.onset,b.offset,b.noise].every(Number.isFinite) || b.offset <= b.onset || b.noise > .02) continue;
    const lo=Math.round((b.onset-.035)*s.fs), hi=Math.round((b.onset-.020)*s.fs), j=Math.round((b.offset+.060)*s.fs);
    if (lo < 0 || hi <= lo) continue;
    const row: number[]=[];
    for (const lead of ST_LEADS) {
      const a=s.leads[lead];
      if (!a || j >= a.length) break;
      const baseline=Array.from(a.slice(lo,hi));
      if (!baseline.every(Number.isFinite) || !Number.isFinite(a[j]) || Math.max(...baseline)-Math.min(...baseline) > .02) break;
      row.push(a[j]-median(baseline));
    }
    if (row.length===ST_LEADS.length) ST_LEADS.forEach((l,i)=>rows[l].push(row[i]));
  }
  if (rows.I.length < 3) return null;
  return Object.fromEntries(ST_LEADS.map(l=>[l,median(rows[l])]));
}
export function practiceFeedback(id: PracticeId, c: ECGCase, s: Pick<Signal,"fs"|"leads"> | null, m: Measurement | null) {
  const lesson=PRACTICE[id], context=caseContext(c);
  const observations: string[]=[];
  const limitations=[...context.warnings];
  const clean=!c.artifacts.reversed && Object.values(c.artifacts).every(v=>v===false || v===0) && (c.filter==="off" || c.filter==="diagnostic");
  const referenceCurrent=context.preset?.id===id;
  if (!referenceCurrent || !clean || !s || !m) {
    observations.push("Lectura cuantitativa retirada: adquisición modificada, referencia distinta o señal no disponible. Examina el trazado; no se completan datos desde el preset.");
  } else {
    for (const [key,label,unit] of [["hr","FC ventricular","lpm"],["pr","PR","ms"],["qrs","QRS","ms"]] as const) {
      const value=m[key], evidence=m.evidence[key];
      if (value!==null && Number.isFinite(value) && evidence.status!=="unavailable")
        observations.push(`${label} estimado: ${number(value)} ${unit} (${evidence.status==="review" ? "revisar límites" : "consistencia interna"}; n=${evidence.count}).`);
    }
    if (id==="inferior" || id==="anterior") {
      const st=sampledST(s,m);
      if (!st) limitations.push("ST no estimable con los límites actuales: se requiere QRS consistente y ≥3 ventanas basales estables. No se utilizan los tiempos del generador.");
      else {
        const leads: Lead[]=id==="inferior" ? ["II","III","aVF","I","aVL"] : ["V1","V2","V3","V4","II","III","aVF"];
        observations.push("ST* en J*+60 ms respecto de PR local: " + leads.map(l=>`${l} ${number(st[l]!,3)} mV`).join("; ") + ".");
        if (id==="inferior") {
          const difference=st.III!-st.II!;
          observations.push(Math.abs(difference)>ST_READING_MARGIN_MV
            ? `En estas muestras: ST* ${difference>0 ? "III > II" : "II > III"}.`
            : "Diferencia ST* II/III no concluyente con el margen de lectura de 0,02 mV.");
          if (Math.abs(st.I!)>ST_READING_MARGIN_MV) observations.push(`En I, ST* ${st.I!>0 ? "positivo" : "negativo"} respecto de PR local.`);
        }
        limitations.push("J* es el final QRS estimado, no un punto adjudicado. Los 0,02 mV son un margen de lectura, no un umbral diagnóstico. ST* no confirma ni excluye oclusión.");
      }
    }
    if (!observations.length) observations.push("No hay medidas suficientemente disponibles. Usa la comparación visual y los calibres; no se sustituyen por valores configurados.");
  }
  return { observations, limitations, cue: lesson.cue, leads: lesson.leads, referenceCurrent };
}
''')
p='src/main.ts'
replace(p,'import { TraceSession } from "./ui/trace-session";','import { TraceSession } from "./ui/trace-session";\nimport { practiceQuestion, practiceFeedback, type PracticeId } from "./ui/practice-feedback";')
start=Path(p).read_text().index('function renderQuiz()');end=Path(p).read_text().index('document.addEventListener("click", async (e) =>',start)
s=Path(p).read_text();write(p,s[:start]+'''function renderQuiz() {
  const panel = $("#quiz-panel");
  panel.hidden = !quiz;
  if (!quiz) return;
  const q = quiz, feedback = q.answer ? practiceFeedback(q.preset.id as PracticeId, c, session.signal, session.measurement) : null;
  panel.innerHTML = `<div class="quiz-top"><strong>${q.answer ? (q.answer === q.preset.id ? "Coincide con el caso configurado" : "Compara los rasgos del ejercicio") : "¿Qué patrón representa este ejercicio?"}</strong><button data-action="end-quiz">Salir de práctica</button></div><div class="quiz-choices">${q.choices.map((p) => `<button data-answer="${p.id}" ${q.answer || !session.canExport ? "disabled" : ""} class="${q.answer && p.id === q.preset.id ? "correct" : q.answer === p.id ? "incorrect" : ""}">${esc(p.name)}</button>`).join("")}</div>${feedback ? `<div class="practice-feedback" role="status"><section><h3>Observaciones y estimaciones</h3><ul>${feedback.observations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section><section><h3>Referencia del ejercicio</h3><p><strong>${esc(q.preset.name)}</strong> · Etiqueta configurada, no diagnóstico automático.</p><p>${q.answer !== q.preset.id ? `Elegiste ${esc(presetById(q.answer!)?.name || "otra alternativa")}. ` : ""}Revisa ${esc(feedback.leads)}. ${esc(feedback.cue)}</p></section></div><div class="practice-limits">${feedback.limitations.map(x=>`<p>${esc(x)}</p>`).join("")}<p>Modelo aproximado. La puntuación compara tu opción con el ejercicio, no mide precisión clínica.</p></div>${btn("quiz", "Siguiente caso", "chevron", "primary")}` : `<p>Responde después de observar el ECG. Las referencias se muestran al contestar.</p>`}`;
}
function startQuiz() {
  const rng = new Uint32Array(2);
  crypto.getRandomValues(rng);
  const question = practiceQuestion(Array.from(rng));
  quiz = { preset: presetById(question.id)!, choices: question.choices.map(id=>presetById(id)!), answer: null };
  selectPreset(question.id);
  renderQuiz();
  renderInfo();
  $("#quiz-panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
''' + s[end:])
replace(p,'    renderMetrics();\n    renderInfo();','    renderMetrics();\n    renderQuiz();\n    renderInfo();')
replace(p,'  session.invalidate();\n  showUnavailableSignal','  session.invalidate();\n  renderQuiz();\n  showUnavailableSignal')
replace(p,'  if (answer && quiz && !quiz.answer) {','  if (answer && quiz && !quiz.answer && session.canExport && quiz.choices.some(p=>p.id===answer.dataset.answer)) {')
replace(p,'  c = changeCase(c, key, value);','  if (quiz && !key.startsWith("view.")) { quiz = null; renderQuiz(); renderInfo(); }\n  c = changeCase(c, key, value);')
replace(p,'      c = next;\n      renderCatalog();','      c = next;\n      quiz = null;\n      renderQuiz();\n      renderCatalog();')
replace(p,'  if (!key.startsWith("view.")) renderCatalog();','  if (!key.startsWith("view.")) { renderCatalog(); renderInfo(); }')
p='src/style.css';write(p,Path(p).read_text()+'''
/* P8: separate observed estimates from the configured exercise reference. */
.practice-feedback { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.practice-feedback h3 { font-size: 13px; margin: 12px 0 6px; }
.practice-feedback p, .practice-feedback li, .practice-limits p { font-size: 12px; line-height: 1.55; }
.practice-feedback ul { padding-left: 18px; margin: 6px 0; }
.practice-limits { color: var(--muted); }
@media (max-width: 700px) { .practice-feedback { grid-template-columns: 1fr; gap: 0; } }
''')
write('docs/p8-practice-feedback.md','''# P8 · Feedback de los catorce ejercicios existentes

La pregunta evalúa la coincidencia con el caso configurado, no un diagnóstico
inferido del ECG. Se mantienen los mismos 14 presets; tres distractores por
familia sustituyen el orden por longitud del identificador. Los contrastes son
instrucciones de inspección, no hallazgos automáticamente atribuidos al paciente.

## Contratos

- Antes de contestar no se expone el feedback ni la referencia. Sin señal vigente
  no se puede contestar. Editar fisiología/filtro/artefactos o cargar otro hash
  termina el ejercicio; cambiar vista conserva la pregunta.
- Observaciones y referencia aparecen separadas. FC/PR/QRS provienen de medidas
  estimadas y su calidad; no se rellenan con parámetros del generador. La auditoría
  del producto puede retirar esas medidas antes de este feedback.
- En inferior/anterior, ST* se calcula sobre muestras con límites QRS medidos:
  PR local entre inicio estimado -35 y -20 ms; J* = final estimado; lectura J*+60 ms.
  Se requiere QRS usable, tres latidos y basal estable (rango ≤0,02 mV), sin ruido
  configurado, inversión ni filtros distintos de apagado/diagnóstico. Se publica
  la mediana por derivación. No se pasan events/truth al lector de ST*.
- El margen 0,02 mV solo decide si el orden II/III o signo I del ejercicio puede
  describirse. No es umbral de isquemia. La comparación no identifica arteria,
  OMI ni tratamiento. J* puede tener el sesgo conocido del delineador.
- Con adquisición alterada o límites insuficientes se retira esa lectura. Las
  advertencias P2 siguen visibles tras contestar; no se ocultan simplificaciones.

## Aceptación

Tests con muestras sintéticas conocidas en I/II/III/aVL/aVF/V1–V4, señal real del
simulador y medición analítica. Alterar las muestras cambia el orden observado;
NaN, basal inestable, ruido/inversión o QRS no usable retiran ST*. Conservación de
muestras en doce canales y getters prohibidos para events/truth. El navegador
prueba una pregunta real, feedback tras responder y salida al editar fisiología.
Las pruebas del feedback no validan por sí solas el generador ni el analizador.

Base pedagógica: guía original §3.5 y enfoque-clinico.md (observación ≠ inferencia).
La revisión clínica aportada §7/§9.5 inspira la comparación de rasgos, no se adopta
su propuesta de clasificador, angiografía simulada o reglas automáticas OMI.
''')
write('tests/practice-feedback.test.ts', '''import { describe, expect, it } from "vitest";
import { LEADS, type Measurement, type Signal } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { auditMeasurement } from "../src/engine/analysis/model-audit";
import { PRACTICE, PRACTICE_IDS, practiceQuestion, practiceFeedback, sampledST } from "../src/ui/practice-feedback";
const c=fromPreset(presetById("inferior")!), signal=synthesize(c,10), measured=auditMeasurement(signal,measure(signal));
function fixture() {
  const s={fs:500,leads:Object.fromEntries(LEADS.map(l=>[l,new Float64Array(2500).fill(.03)]))} as Pick<Signal,"fs"|"leads">;
  const m=structuredClone(measured);
  m.evidence.qrs.status="usable";
  m.beats=[1,2,3].map(onset=>({...measured.beats[0],onset,offset:onset+.1,noise:0}));
  for(const b of m.beats) for(const l of LEADS) {
    const values: Partial<Record<typeof l,number>>={I:-.12,II:.14,III:.26,aVR:-.01,aVL:-.19,aVF:.20};
    s.leads[l][Math.round((b.offset+.06)*s.fs)]=.03+(values[l]??.2);
  }
  return {s,m};
}
describe("Practice evidence, not diagnostic classification",()=>{
  it("keeps the fourteen existing exercises and four distinct curated choices",()=>{
    expect(PRACTICE_IDS).toEqual(["sinus","af","flutter","wenckebach","complete","rbbb","lbbb","inferior","vt","bigeminy","av1","anterior","vvi","wellens_b"]);
    PRACTICE_IDS.forEach((id,i)=>{
      expect(presetById(id)?.strategy).not.toBe("pending");
      for(let position=0;position<4;position++){
        const q=practiceQuestion([i,position]);expect(q.id).toBe(id);
        expect(q.choices[position]).toBe(id);expect(new Set(q.choices).size).toBe(4);
        q.choices.forEach(option=>expect(PRACTICE_IDS).toContain(option));
      }
      expect(PRACTICE[id].leads.length).toBeGreaterThan(1);
    });
    expect(practiceQuestion([NaN,Infinity])).toEqual(practiceQuestion([0,0]));
  });
  it("reads calibrated samples using measured boundaries, independently of events/truth",()=>{
    const {s,m}=fixture();
    const guarded=new Proxy(s,{get(target,key,receiver){if(key==='events'||key==='truth')throw Error('forbidden reference');return Reflect.get(target,key,receiver);}});
    const st=sampledST(guarded,m)!;
    expect(st.II).toBeCloseTo(.14,12);expect(st.III).toBeCloseTo(.26,12);expect(st.I).toBeCloseTo(-.12,12);
    expect(practiceFeedback('inferior',c,guarded,m).observations.join(' ')).toContain('ST* III > II');
    for(const b of m.beats){s.leads.II[Math.round((b.offset+.06)*s.fs)]=.5; s.leads.I[Math.round((b.offset+.06)*s.fs)]=.2;}
    const text=practiceFeedback('inferior',c,guarded,m).observations.join(' ');
    expect(text).toContain('ST* II > III');expect(text).toContain('ST* positivo');
  });
  it.each(['review','unavailable'] as const)("abstains from ST when QRS is %s",status=>{
    const {s,m}=fixture();m.evidence.qrs.status=status;expect(sampledST(s,m)).toBeNull();
    expect(practiceFeedback('inferior',c,s,m).observations.join(' ')).not.toContain('ST* en');
  });
  it.each(['nan','short','baseline','few'])("rejects inadequate ST windows: %s",kind=>{
    const {s,m}=fixture();
    if(kind==='nan')for(const b of m.beats)s.leads.V1[Math.round((b.offset+.06)*s.fs)]=NaN;
    if(kind==='short')s.leads.V2=new Float64Array(3);
    if(kind==='baseline')for(const b of m.beats)s.leads.II[Math.round((b.onset-.03)*s.fs)]=1;
    if(kind==='few')m.beats=m.beats.slice(0,2);
    expect(sampledST(s,m)).toBeNull();
  });
  it.each(['reversed','muscle','filter','different'])("withdraws observational claims for %s",kind=>{
    const changed=structuredClone(c);
    if(kind==='reversed')changed.artifacts.reversed=true;
    if(kind==='muscle')changed.artifacts.muscle=.1;
    if(kind==='filter')changed.filter='monitor';
    if(kind==='different')changed.hr=110;
    const result=practiceFeedback('inferior',changed,signal,measured);
    expect(result.observations.join(' ')).toContain('retirada');
    expect(result.observations.join(' ')).not.toMatch(/III > II|ST\* en/);
  });
  it("does not replace unavailable values with configured intervals",()=>{
    const m=structuredClone(measured);m.hr=m.pr=m.qrs=null;
    for(const key of ['hr','pr','qrs'] as const)m.evidence[key].status='unavailable';
    const text=practiceFeedback('inferior',c,signal,m).observations.join(' ');
    expect(text).toContain('No hay medidas');expect(text).not.toMatch(/160|90 ms|72 lpm/);
  });
  it("does not alter the case, estimated values or twelve sampled leads",()=>{
    const copy=structuredClone(signal),before=structuredClone(c),values=structuredClone(measured);
    const result=practiceFeedback('inferior',c,signal,measured);
    expect(result.observations.join(' ')).toContain('ST* III > II');
    expect(result.limitations.join(' ')).toMatch(/no confirma ni excluye/);
    for(const lead of LEADS)expect(signal.leads[lead]).toEqual(copy.leads[lead]);
    expect(c).toEqual(before);expect(measured).toEqual(values);
  });
  it("retains specific P2 limitations in wide-QRS exercises",()=>{
    const c=fromPreset(presetById('lbbb')!);
    const f=practiceFeedback('lbbb',c,null,null);
    expect(f.limitations.join(' ')).toMatch(/no está calibrada/);
    expect(f.cue).toMatch(/secundarios/);
  });
});
''')
p='tests/browser-fidelity.mjs'
replace(p," await select('inferior');await phase('hyperacute');\n await page.locator('[data-action=\"export\"]').click();const download",''' // P8: exercise identity is hidden before answer; feedback follows live state.
 await page.locator('[data-action="quiz"]').first().click();await ready();
 assert.equal(await page.locator('#case-title').innerText(),'Interpreta este ECG');
 assert.equal(await page.locator('.practice-feedback').count(),0);
 assert.equal(await page.locator('#quiz-panel [data-answer]').count(),4);
 await page.locator('#quiz-panel [data-answer]').first().click();
 assert.match(await page.locator('.practice-feedback').innerText(),/Observaciones y estimaciones/);
 assert.match(await page.locator('.practice-feedback').innerText(),/Referencia del ejercicio/);
 assert.match(await page.locator('.practice-feedback').innerText(),/no diagnóstico automático/);
 await page.locator('#quiz-panel').screenshot({path:path.join(out,'p8-feedback.png')});
 await page.locator('[data-key="view.gain"]').selectOption('5');
 assert.equal(await page.locator('#quiz-panel').isVisible(),true);
 await page.locator('[data-panel="base"]').click();
 await page.locator('[data-key="hr"]').evaluate(el=>{el.value=Number(el.value)===80?'90':'80';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.locator('#quiz-panel').isVisible(),false);await ready();
 checks.push('P8: real question, separate reference/estimates, view retained and physiology exits practice');
 await select('inferior');await phase('hyperacute');
 await page.locator('[data-action="export"]').click();const download''')
