import { cloneCase, type ECGCase, type Signal } from "../engine/types";
import { leadGain } from "../engine/lead-registry";
import { renderPaper, type Layout, type Segment } from "../render/ecg";
import { caseReading } from "../presets/case-context";
import { pngWithDpi } from "./persistence";
import { validateTeachingNotes, type TeachingNote } from "./teaching-notes";

export interface ProjectedTeachingNote {
  x0: number; y0: number; x1: number; y1: number;
  left: number; top: number; width: number; height: number;
}

/** Millimetres in the paper's coordinate system. Null means wholly unrepresentable. */
export function projectTeachingNote(note: TeachingNote, segment: Segment, view: ECGCase["view"]): ProjectedTeachingNote | null {
  if (note.lead !== segment.lead || ![note.t0, note.t1, note.v0, note.v1, view.speed, view.gain, view.chestGain].every(Number.isFinite) ||
      view.speed <= 0 || view.gain <= 0 || view.chestGain <= 0) return null;
  const times = [note.t0, note.t1];
  if (times.some(t => t < segment.start || t > segment.start + segment.duration)) return null;
  const gain = leadGain(note.lead, view) * segment.polarity;
  const x0 = segment.x + (note.t0 - segment.start) * view.speed, x1 = segment.x + (note.t1 - segment.start) * view.speed;
  const y0 = segment.baseline - note.v0 * gain, y1 = segment.baseline - note.v1 * gain;
  if ([y0, y1].some(y => y < segment.y || y > segment.y + segment.height)) return null;
  return { x0, y0, x1, y1, left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

/** Caller supplies the renderer's mm transform. Unfilled contours preserve the ECG ink. */
export function drawTeachingNotes(ctx: CanvasRenderingContext2D, layout: Layout, view: ECGCase["view"], notes: readonly TeachingNote[], labels?: readonly number[]): void {
  ctx.save();
  ctx.strokeStyle = "#6948a5"; ctx.fillStyle = "#6948a5"; ctx.lineWidth = 0.4;
  ctx.font = "600 2.5px ui-monospace,monospace";
  for (const [index, note] of notes.entries()) {
    const label = labels?.[index] ?? index + 1;
    const matches = layout.segments.map(segment => ({ segment, point: projectTeachingNote(note, segment, view) })).filter(x => x.point !== null);
    if (!matches.length) { ctx.restore(); throw new Error(`La anotación ${label} (${note.lead}) no cabe en esta lámina. Ajusta sus coordenadas antes de exportar.`); }
    for (const { segment, point } of matches) {
      const p = point!;
      ctx.beginPath();
      if (note.kind === "box") ctx.rect(p.left, p.top, p.width, p.height);
      else if (note.kind === "interval") {
        const y = p.y0;
        ctx.moveTo(p.x0, y); ctx.lineTo(p.x1, y);
        ctx.moveTo(p.x0, y - 0.8); ctx.lineTo(p.x0, y + 0.8);
        ctx.moveTo(p.x1, y - 0.8); ctx.lineTo(p.x1, y + 0.8);
      } else if (note.kind === "arrow") {
        ctx.moveTo(p.x0, p.y0); ctx.lineTo(p.x1, p.y1);
        const angle = Math.atan2(p.y1 - p.y0, p.x1 - p.x0), size = 1.4;
        ctx.moveTo(p.x1 - size * Math.cos(angle - 0.5), p.y1 - size * Math.sin(angle - 0.5));
        ctx.lineTo(p.x1, p.y1); ctx.lineTo(p.x1 - size * Math.cos(angle + 0.5), p.y1 - size * Math.sin(angle + 0.5));
      } else ctx.arc(p.x0, p.y0, 0.6, 0, 2 * Math.PI);
      ctx.stroke();
      // Keep only a compact index near the mark; prose is printed outside the tracing.
      ctx.fillText(String(label), Math.min(segment.x + segment.width - 3, p.left + 0.7), Math.max(segment.y + 3, p.top - 1));
    }
  }
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []; let line = "";
  // Character wrapping also bounds long words and user-supplied markup; canvas treats it as text.
  for (const char of text) {
    if (char === "\n" || (line && ctx.measureText(line + char).width > maxWidth)) { lines.push(line); line = ""; }
    if (char !== "\n") line += char;
  }
  lines.push(line); return lines;
}

/** Full simultaneous 10 s sheet plus personal comments; clean standard export is unchanged. */
export async function buildTeachingPng(signal: Signal, c: ECGCase, notes: readonly TeachingNote[]): Promise<Blob> {
  const valid = validateTeachingNotes(notes, signal);
  if (signal.leads.I.length < Math.ceil(10 * signal.fs)) throw new Error("La lámina anotada necesita un registro completo de 10 segundos.");
  if (valid.some(n => Math.max(n.t0, n.t1) >= 10)) throw new Error("La lámina muestra los primeros 10 segundos. Hay anotaciones posteriores; expórtalas como JSON o sitúalas dentro de ese intervalo.");
  const copy = cloneCase(c), paper = document.createElement("canvas"), output = document.createElement("canvas"), px = 300 / 25.4;
  copy.view.mode = "paper"; copy.view.format = "12x1"; copy.view.timing = "simultaneous"; copy.view.palette = "paper"; copy.view.grid = true;
  const layout = renderPaper(paper, signal, copy, 1000, { pxPerMm: px, ratio: 1, displayName: caseReading(c).title });
  const paperCtx = paper.getContext("2d"); if (!paperCtx) throw new Error("No se puede dibujar la lámina anotada.");
  paperCtx.setTransform(px, 0, 0, px, 0, 0);
  drawTeachingNotes(paperCtx, layout, copy.view, valid);
  const ctx = output.getContext("2d"); if (!ctx) throw new Error("No se puede preparar la imagen anotada.");
  ctx.font = "3px ui-monospace,monospace";
  const rows = valid.flatMap((note, i) => wrapText(ctx, `${i + 1}. ${note.lead} · ${note.t0.toFixed(3)}–${note.t1.toFixed(3)} s · ${note.text || "Sin comentario"}`, layout.widthMm - 12));
  const footerMm = 18 + Math.max(1, rows.length) * 4.5;
  output.width = paper.width; output.height = paper.height + Math.ceil(footerMm * px);
  ctx.fillStyle = "#fffdfd"; ctx.fillRect(0, 0, output.width, output.height); ctx.drawImage(paper, 0, 0);
  ctx.setTransform(px, 0, 0, px, 0, 0); ctx.fillStyle = "#352c42";
  ctx.font = "600 3.4px ui-monospace,monospace";
  const top = paper.height / px;
  ctx.fillText("ANOTACIONES PERSONALES · no son medidas ni diagnósticos automáticos", 6, top + 6, layout.widthMm - 12);
  ctx.font = "3px ui-monospace,monospace";
  if (!rows.length) rows.push("Sin anotaciones personales.");
  rows.forEach((line, i) => ctx.fillText(line, 6, top + 12 + i * 4.5));
  const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo codificar el PNG anotado.")), "image/png"));
  return pngWithDpi(blob, 300);
}
