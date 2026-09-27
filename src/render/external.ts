import { LEADS, type Measurement } from '../engine/types';
import type { ExternalECG } from '../io/external-ecg';

export interface ExternalView { start: number; offset: number; seconds: number; range: number; marks: boolean }
/** Read-only shared scales: no filtering, voltage normalization, interpolation or fabricated leads. */
export function renderExternal(canvas: HTMLCanvasElement, record: ExternalECG, m: Measurement | null, view: ExternalView, width: number) {
  if (![2,5,10].includes(view.seconds) || ![1,2,4,8,16].includes(view.range) || !Number.isFinite(width) ||
      !Number.isFinite(view.offset) || view.offset < 0 || view.offset + view.seconds > 10 ||
      !Number.isFinite(view.start) || view.start < 0 || Math.round((view.start + 10) * record.fs) > record.samples)
    throw Error('Vista fuera de la señal o escala no válida.');
  const w = Math.max(1000, Math.min(1600, Math.round(width))), h = 850, margin = 28, gap = 30;
  const cell = (w - 2 * margin - gap) / 2, row = 116, plotWidth = cell - 40, plotHeight = 82;
  const scaleX = plotWidth / view.seconds, scaleY = plotHeight / (2 * view.range);
  const startSample = Math.round((view.start + view.offset) * record.fs), count = Math.round(view.seconds * record.fs);
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Canvas no disponible.');
  ctx.scale(dpr, dpr); ctx.fillStyle = '#fffdfc'; ctx.fillRect(0, 0, w, h);
  const text = (s: string, x: number, y: number, size = 12) => { ctx.fillStyle = '#253c46'; ctx.font = `${size}px system-ui`; ctx.fillText(s, x, y); };
  text('ECG digital importado · doce derivaciones', margin, 28, 20);
  text(`Escala declarada · ${record.fs} Hz · ±${view.range} mV · ${view.seconds} s por panel · sin normalización`, margin, 51);
  text(view.marks && m ? 'Marcas multiderivación: QRS (inicio/final), T (final). Candidatos automáticos, no anotaciones clínicas.' : 'Señales originales en mV; sin corrección de línea basal ni filtros de visualización.', margin, 70);
  let clipped = 0;
  LEADS.forEach((lead, index) => {
    const col = index < 6 ? 0 : 1, r = index % 6, x = margin + col * (cell + gap) + 30, y = 96 + row * r, zero = y + plotHeight / 2;
    ctx.strokeStyle = '#efd8da'; ctx.lineWidth = .6;
    for (let t = 0; t <= view.seconds + 1e-8; t += view.seconds <= 2 ? .2 : 1) {
      ctx.beginPath(); ctx.moveTo(x + t * scaleX, y); ctx.lineTo(x + t * scaleX, y + plotHeight); ctx.stroke();
    }
    for (const mv of [-view.range, -view.range / 2, 0, view.range / 2, view.range]) {
      ctx.beginPath(); ctx.moveTo(x, zero - mv * scaleY); ctx.lineTo(x + plotWidth, zero - mv * scaleY); ctx.stroke();
    }
    text(lead, x - 30, zero + 4); text(`+${view.range}`, x, y - 5, 9);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, plotWidth, plotHeight); ctx.clip();
    ctx.strokeStyle = '#233e4a'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const mv = record.leads[lead][startSample + k];
      if (Math.abs(mv) > view.range) clipped++;
      const px = x + k / record.fs * scaleX, py = zero - mv * scaleY;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (view.marks && m) for (const beat of m.beats) {
      for (const [time, label, color] of [[beat.onset, 'Q', '#437598'], [beat.offset, 'J', '#437598'], [beat.tEnd, 'T', '#a14b66']] as const) {
        if (time === null || time < view.offset || time >= view.offset + view.seconds) continue;
        const px = x + (time - view.offset) * scaleX;
        ctx.strokeStyle = color; ctx.lineWidth = .8; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + plotHeight); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = '10px system-ui'; ctx.fillText(label, px + 2, y + 11);
      }
    }
    ctx.restore();
    for (let t = 0; t <= view.seconds + 1e-8; t += view.seconds / 4) text((view.start + view.offset + t).toFixed(2), x + t * scaleX - 7, y + plotHeight + 15, 10);
  });
  text(`Tiempo absoluto del registro (s) · análisis: ${view.start.toFixed(3)}–${(view.start + 10).toFixed(3)} s${m ? '' : ' · pendiente/no disponible'}`, margin, 817);
  text(`Uso exploratorio. Sin validación clínica. No es papel calibrado de impresión.${clipped ? ` ${clipped} muestras fuera del rango visible.` : ''}`, margin, 839);
  canvas.setAttribute('aria-label', `Doce derivaciones importadas, escala compartida ±${view.range} mV; ${view.seconds} segundos por panel. Sin normalización.`);
  return { clipped, width: w, height: h, startSample, samplesPerLead: count, seconds: view.seconds, rangeMv: view.range };
}
