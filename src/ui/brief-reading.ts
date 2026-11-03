import type { StructuredDescription } from "./structured-description";
import { esc } from "./helpers";

type Line = StructuredDescription["lines"][number];
const ST_BUTTON = `<button type="button" class="st-reference" data-action="st-reference" aria-label="Referencia del ST"><sup>1</sup></button>`;
const NORMAL_ST = "ST sin desniveles destacados.", NORMAL_T = "Onda T sin alteraciones destacadas.", NORMAL_Q = "Sin ondas Q patológicas.";
const GROUPED = "ST–T sin alteraciones destacadas ni ondas Q patológicas.";
const compactKey = (l: Line) => l.key.replace(/\s+/g, "");

/** Rhythm row without the literal rate clause already shown in the header; AV, ectopy and the atrial rate stay. */
const rhythmPhrase = (text: string) => text.replace(/, frecuencia (?:ventricular )?\d+ lpm/, "");

/** Intervals row: exact numeric PR/QRS/QTc segments are dropped (header), PR ranges keep only their
 * qualifier, every other segment is kept as received. */
function intervalsPhrase(text: string): string {
  const dot = text.endsWith(".") ? "." : "", body = dot ? text.slice(0, -1) : text;
  const kept = body.split(" · ").flatMap((seg) => {
    if (/^(?:PR|QRS|QTc) \d+ ms$/.test(seg)) return [];
    const m = /^PR \d+–\d+ ms \((progresivo|variable)\)$/.exec(seg);
    return [m ? `PR ${m[1]}` : seg];
  });
  return kept.length ? kept.join(" · ") + dot : "";
}

/** Axis row: a normal axis is silent, deviations keep the received wording without the figure,
 * the reversed-arms context stays without its figure and unrecognised text is kept whole. */
function axisPhrase(text: string): string {
  const m = /^Eje QRS [-−]?\d+° \((normal|desviado a la izquierda|desviado a la derecha|extremo)\)\.$/.exec(text);
  if (m) return m[1] === "normal" ? "" : `Eje QRS ${m[1]}.`;
  return text.replace(/^Eje del registro [-−]?\d+° \(brazos invertidos\)\.$/, "Eje del registro (brazos invertidos).");
}

/** One prose paragraph from the structured description: same order and wording, only the figures the
 * header already shows are removed and the three normal ST/T/Q sentences fold into one. Pure
 * presentation: d is read, never changed. Empty string when nothing remains. */
export function briefReadingHtml(d: StructuredDescription, omitRows: readonly string[] = []): string {
  const omitted = new Set(omitRows.map((k) => k.replace(/\s+/g, "")));
  const hasStReference = d.lines.some((l) => compactKey(l) === "Ref.ST");
  const normal = (key: string, text: string) => !omitted.has(key) && d.lines.some((l) => compactKey(l) === key && l.text === text);
  const grouped = normal("ST", NORMAL_ST) && normal("T", NORMAL_T) && normal("Q", NORMAL_Q);
  const parts: string[] = [];
  for (const l of d.lines) {
    const k = compactKey(l);
    if (k === "A" || k === "Ref.ST" || omitted.has(k)) continue;
    const phrase = k === "B·C" ? rhythmPhrase(l.text) : k === "D" ? intervalsPhrase(l.text) : k === "E" ? axisPhrase(l.text)
      : grouped && ((k === "T" && l.text === NORMAL_T) || (k === "Q" && l.text === NORMAL_Q)) ? "" : grouped && k === "ST" && l.text === NORMAL_ST ? GROUPED : l.text;
    if (!phrase) continue;
    parts.push(esc(phrase) + (l.info === "st" && hasStReference ? ST_BUTTON : ""));
  }
  return parts.length ? `<p class="reading-prose">${parts.join(" ")}</p>` : "";
}
