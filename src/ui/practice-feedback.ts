import type { ECGCase, Lead, Measurement, Signal } from "../engine/types";
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
