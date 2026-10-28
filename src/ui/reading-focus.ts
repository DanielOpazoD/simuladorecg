import { LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";
import { leadGain } from "../engine/lead-registry";
import type { Layout, Segment } from "../render/ecg";
import { teachingRegion, type TeachingFocus } from "./teaching-signal";

export interface FindingTarget { focus: TeachingFocus | "rhythm"; leads: readonly Lead[]; premature?: boolean }
const targets = new Map<string, FindingTarget>();
function add(focus: FindingTarget["focus"], leads: readonly Lead[], labels: string[]) {
  for (const label of labels) targets.set(label, { focus, leads });
}
// Explicit reading aids, not text classification or a diagnostic detector.
// Unmapped advice stays prose. A changed catalog phrase must be reviewed here.
add("qrs", ["II", "V1", "V5"], ["QRS estrecho y regular", "QRS estrecho a 40–60 lpm", "QRS estrecho", "QRS ancho prematuro", "QRS ancho", "QRS ancho regular", "QRS ancho representativo", "Escape estrecho", "QRS ancho a 30 lpm", "Morfología de BRD", "QRS configurado 115 ms (adulto)", "Morfología BRD", "BRD + HBAI", "Ascenso inicial empastado", "QRS ancho tipo BRI", "QRS intrínseco estrecho", "QRS ancho tipo BRI y eje superior", "Complejos de baja amplitud"]);
add("qrs", ["V1"], ["rSR′ en V1", "QS/rS en V1", "R dominante V1"]);
add("qrs", ["I", "aVL", "V5", "V6"], ["S terminal ancha lateral", "R lateral ancha con muesca"]);
add("qrs", ["V1", "V2", "V3", "V4", "V5", "V6"], ["Progresión de R precordial", "QS o pérdida de R en V1–V3", "Aumento de R anterior", "Voltaje precordial aumentado"]);
add("qrs", ["III", "aVF"], ["Q patológica en III y aVF"]);
add("st", ["II", "III", "aVF"], ["ST↑ II, III y aVF, III >II", "ST↑ II ≥III", "Descenso inferior recíproco"]);
add("st", ["I", "aVL"], ["ST↓ recíproco en I y aVL", "I isoeléctrica o elevada"]);
add("st", ["V1", "V2", "V3", "V4"], ["Elevación ST precordial anterior", "ST↓ V1–V3", "ST↓ ascendente precordial", "ST resuelto o elevación residual leve"]);
add("st", ["I", "aVL", "V5", "V6"], ["ST↑ I, aVL y V5–V6", "ST positivo lateral concordante"]);
add("st", ["V1", "II", "III", "aVF"], ["Elevación ST en V1 e inferiores"]);
add("st", ["aVR"], ["ST↑ en aVR"]);
add("st", LEADS, ["ST↓ en múltiples derivaciones", "Descenso ST", "ST↑ cóncavo difuso"]);
add("st", ["V2", "V3"], ["ST casi isoeléctrico"]);
add("repolarization", ["II", "V1", "V5"], ["Repolarización secundaria", "Repolarización secundaria discordante", "ST-T discordante a la activación integrada representada", "Repolarización dependiente de la fase", "Puede asociar T negativa", "Alteración secundaria ST–T", "T altas y estrechas", "T aplanada"]);
add("repolarization", ["II", "III", "aVF"], ["ST resuelto; T inferior aplanada o negativa"]);
add("repolarization", ["V2", "V3"], ["T bifásica V2–V3", "T negativa V2–V3"]);
add("repolarization", ["V2", "V3", "V4", "V5"], ["T altas y simétricas"]);
add("repolarization", ["I", "aVL", "V5", "V6"], ["Sobrecarga lateral"]);
add("rhythm", ["II", "aVR"], ["P positiva en II, negativa en aVR"]);
add("rhythm", ["II", "V1"], ["PR constante; QRS estrecho", "FC <60 lpm", "Una P antes de cada QRS", "FC >100 lpm", "P sinusal y relación AV 1:1", "Variación cíclica RR", "P de morfología constante", "Ausencia de P organizadas", "RR irregularmente irregular", "Ondas f de baja amplitud", "Irregularidad absoluta", "Frecuencia media elevada", "Sin P organizadas", "RR largo e irregular", "Ondas F continuas", "Frecuencia auricular 300/min", "Respuesta ventricular 150 lpm", "Respuesta ventricular 100 lpm", "P retrógrada cercana al QRS", "P retrógrada negativa en II", "P precoz de morfología diferente", "Pausa no compensadora", "Pausa compensadora", "Un QRS sinusal y una ESV", "Acoplamiento fijo", "Secuencia de tres complejos", "ESV de morfología constante", "Dos QRS anchos consecutivos", "Pausa posterior", "Frecuencia 20–40 lpm", "Frecuencia aproximada 50–110 lpm", "Disociación AV", "Polaridad y amplitud variables", "Envolvente fusiforme", "Ausencia de QRS identificables", "Ondulación irregular continua", "Línea isoeléctrica sin artefactos", "PR >200 ms", "Todas las P conducidas", "PR 160 → 240 → 280 ms", "Cuarta P bloqueada", "RR conducidos 880 → 840 ms", "PR constante", "Una P bloqueada por grupo", "Dos P por cada QRS", "Conducción 3:1 en este caso", "Bradicardia ventricular", "P regulares más rápidas que QRS", "Sin relación PR fija", "Actividad auricular independiente", "PR prolongado", "PR corto", "Espiga antes de P", "Espiga antes de QRS", "Dos espigas por ciclo", "P seguida de QRS estimulado", "Disminución de P"]);
add("rhythm", ["II", "III", "aVF", "V1"], ["Ondas F negativas inferiores y positivas en V1"]);

export const findingTarget = (label: string): FindingTarget | undefined => targets.get(label);
targets.set("QRS ancho prematuro", { focus: "qrs", leads: ["II", "V1", "V5"], premature: true });

export interface SampleWindow { start: number; end: number; low: number; high: number; beat: number | null }
export function sampleExtent(s: Signal, lead: Lead, start: number, end: number): SampleWindow | null {
  if (!Number.isFinite(s.fs) || s.fs <= 0 || ![start, end].every(Number.isFinite)) return null;
  const a = s.leads[lead], lo = Math.round(start * s.fs), hi = Math.round(end * s.fs);
  if (lo < 0 || hi >= a.length || hi <= lo) return null;
  let low = Infinity, high = -Infinity;
  for (let i = lo; i <= hi; i++) { if (!Number.isFinite(a[i])) return null; low = Math.min(low, a[i]); high = Math.max(high, a[i]); }
  return { start: lo / s.fs, end: hi / s.fs, low, high, beat: null };
}

/** Use the time range of the clicked paper cell, never an off-screen first-column beat. */
export function leadWindow(s: Signal, seg: Segment, time = seg.start + seg.duration / 2): SampleWindow | null {
  const end = Math.min(seg.start + seg.duration, (s.leads[seg.lead].length - 1) / s.fs);
  const eligible = s.events.beats.map((b, i) => ({ b, i })).filter(({ b }) =>
    Number.isFinite(b.time) && Number.isFinite(b.qrs) && b.qrs! > 0 && b.time - .2 >= seg.start && b.time + Math.max(.6, b.qt ?? .4) < end);
  // Adjacent source beats choose the viewing window, never the measured limits.
  // Keep it inside the clicked time column and do not invent a second beat.
  const pairs=eligible.slice(0,-1).map((first,i)=>({first,last:eligible[i+1]}))
    .filter(p=>p.last.i===p.first.i+1)
    .sort((a,b)=>Math.min(Math.abs(a.first.b.time-time),Math.abs(a.last.b.time-time))-Math.min(Math.abs(b.first.b.time-time),Math.abs(b.last.b.time-time)));
  const pair=pairs[0];
  const chosen = pair?.first ?? [...eligible].sort((a,b)=>Math.abs(a.b.time-time)-Math.abs(b.b.time-time))[0];
  const last=pair?.last??chosen;
  const previous=chosen?s.events.beats[chosen.i-1]:undefined,next=last?s.events.beats[last.i+1]:undefined;
  const start = chosen ? Math.max(chosen.b.time-.2,previous?previous.time+.01:seg.start) : Math.max(seg.start, Math.min(time - 1, end - 2));
  const stop = last ? Math.min(last.b.time+Math.max(.6,(last.b.qt??.4)+.12),next?next.time-.01:end) : Math.min(end, start + 2);
  const result = sampleExtent(s, seg.lead, start, Math.min(end, stop));
  return result ? { ...result, beat: chosen?.i ?? null } : null;
}

export interface FocusBox extends SampleWindow { lead: Lead; segment: number; x: number; y: number; width: number; height: number; source: string }
/** Read final samples and map only complete windows into their actual displayed cell. */
export function findingBoxes(s: Signal, layout: Layout, c: ECGCase, target: FindingTarget): FocusBox[] {
  const out: FocusBox[] = [];
  layout.segments.forEach((seg, segment) => {
    if (!target.leads.includes(seg.lead)) return;
    let window: SampleWindow | null = null, source = "Fragmento del registro; observa la secuencia, sin límites automáticos de ondas.";
    if (target.focus === "rhythm") {
      window = sampleExtent(s, seg.lead, seg.start + .08, Math.min(seg.start + seg.duration - .08, (s.leads[seg.lead].length - 1) / s.fs));
    } else {
      const candidates = s.events.beats.map((b, beat) => ({ b, beat })).filter(({ b }) => b.time >= seg.start && b.time < seg.start + seg.duration);
      candidates.sort((a, b) => Math.abs(a.b.time - (seg.start + seg.duration / 2)) - Math.abs(b.b.time - (seg.start + seg.duration / 2)));
      for (const { beat } of candidates) {
        if (target.premature && s.events.beats[beat].kind !== "pvc") continue;
        const r = teachingRegion(s, seg.lead, beat, target.focus);
        if (!r || r.start < seg.start || r.end > seg.start + seg.duration) continue;
        const next = s.events.beats[beat + 1];
        if (next && next.time < r.end) continue;
        const sampled = sampleExtent(s, seg.lead, r.start, r.end);
        if (!sampled) continue;
        window = { ...sampled, beat }; source = r.source; break;
      }
    }
    if (!window) return;
    const gain = leadGain(seg.lead, c.view) * seg.polarity;
    const y1 = seg.baseline - window.high * gain, y2 = seg.baseline - window.low * gain;
    const top = Math.max(seg.y + 6, Math.min(y1, y2) - 1), bottom = Math.min(seg.y + seg.height, Math.max(y1, y2) + 1);
    if (bottom <= top) return;
    out.push({ ...window, lead: seg.lead, segment, x: seg.x + (window.start - seg.start) * c.view.speed, y: top,
      width: (window.end - window.start) * c.view.speed, height: bottom - top, source });
  });
  return out;
}
