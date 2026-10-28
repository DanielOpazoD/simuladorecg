import { monitorClock } from './monitor-clock';
import { traceSampleIndices } from './trace-samples';
import { caliperMeasurement } from "./caliper-geometry";
import { stMarks } from "./st-lens";
import { orderedLeads, displayPolarity, leadGain } from "../engine/lead-registry";
import {
  LEADS,
  type ECGCase,
  type Signal,
  type Lead,
  type Measurement,
} from "../engine/types";
export interface Segment {
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
  start: number;
  duration: number;
  lead: Lead;
  polarity: number;
  /** Clear space above samples for the reading labels, in calibrated mm. */
  labelBandMm?: number;
}
export interface Layout {
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
  segments: Segment[];
  mode: "paper" | "monitor" | "rhythm";
  /** Paper only: the largest deflection (mm) the row height was sized for. */
  amplitudeMm?: number;
  /** Per-row positive/negative sample extents in calibrated millimetres. */
  rowExtents?: { above: number; below: number }[];
}
export interface Caliper {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  segment: number;
}
export const palettes = {
  paper: {
    bg: "#fffdfd",
    fine: "#f4e3e6",
    bold: "#dfb7bf",
    trace: "#22353c",
    text: "#514950",
    ghost: "#a3abb3",
    sdst: "#c2183a",
    sdstFill: "rgba(194, 24, 58, 0.16)",
    idst: "#1f5fa8",
    idstFill: "rgba(31, 95, 168, 0.16)",
  },
  dark: {
    bg: "#081811",
    fine: "#133125",
    bold: "#244333",
    trace: "#70ef9c",
    text: "#97b9a4",
    ghost: "#4f6b5c",
    sdst: "#ff6b86",
    sdstFill: "rgba(255, 107, 134, 0.22)",
    idst: "#7fb4ff",
    idstFill: "rgba(127, 180, 255, 0.22)",
  },
};
export function calibrationGeometry(
  speed: number,
  gain: number,
  pxPerMm: number,
) {
  return { width: 0.2 * speed * pxPerMm, height: gain * pxPerMm };
}
export function paperLayout(
  c: ECGCase,
  availableWidth: number,
  pxOverride?: number,
  amplitudeMm = 0,
  rowExtents?: { above: number; below: number }[],
): Layout {
  const f = c.view.format,
    cols = f === "6x2" ? 2 : f === "12x1" ? 1 : 4,
    rows = 12 / cols,
    extra = f === "3x4+1" ? 1 : f === "3x4+3" ? 3 : 0;
  const segDuration = 10 / cols,
    colWidth = 1 + c.view.speed * segDuration,
    rowHeight = Math.max(
      32,
      (24 * Math.max(c.view.gain, c.view.chestGain)) / 10,
      // Reserve 6 mm for the lead label, then 3 mm clearance on either
      // side of the signal envelope. Labels never cover an extreme sample.
      amplitudeMm * 2 + 12,
    ),
    widthMm = 22 + c.view.speed * 10 + (cols - 1),
    rowSizes = Array.from({length: rows + extra}, (_, i) => {
      const extent = rowExtents?.[i];
      // Only the first three rows carry the large PR/QRS/QT brackets. Other
      // rows still reserve 8 mm for lead, J/ST and wave labels. Low-voltage
      // rows no longer receive extra minimum-height padding.
      const band = extent && i >= 3 ? 8 : 9, clearance = band + 1;
      const height = extent ? Math.max(band+11, extent.above + extent.below + clearance) : rowHeight;
      return {height, band, offset: extent ? band + extent.above + (height - extent.above - extent.below - clearance) / 2 : height * .5 + 3};
    }),
    rowY = rowSizes.map((_, i) => 18 + rowSizes.slice(0, i).reduce((sum, r) => sum + r.height, 0)),
    heightMm = 18 + rowSizes.reduce((sum, r) => sum + r.height, 0) + 8;
  const pxPerMm =
    pxOverride ??
    (c.view.fit
      ? Math.min(c.view.pxPerMm, Math.max(960, availableWidth) / widthMm)
      : c.view.pxPerMm);
  const leads = orderedLeads(c.view.cabrera);
  const segments: Segment[] = [];
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const lead = leads[col * rows + row],
        x = 16 + col * colWidth,
        y = rowY[row];
      segments.push({
        x,
        y,
        width: c.view.speed * segDuration,
        height: rowSizes[row].height,
        labelBandMm: rowSizes[row].band,
        baseline: y + rowSizes[row].offset,
        start: c.view.timing === "simultaneous" ? 0 : col * segDuration,
        duration: segDuration,
        lead,
        polarity: displayPolarity(lead, c.view.cabrera),
      });
    }
  for (let row = 0; row < extra; row++) {
    const y = rowY[rows + row];
    segments.push({
      x: 16,
      y,
      // The strip spans its 10 s of trace, not the blank margin after it.
      width: c.view.speed * 10,
      height: rowSizes[rows + row].height,
      labelBandMm: rowSizes[rows + row].band,
      baseline: y + rowSizes[rows + row].offset,
      start: 0,
      duration: 10,
      lead: (["II", "V1", "V5"] as Lead[])[row],
      polarity: 1,
    });
  }
  return { widthMm, heightMm, pxPerMm, segments, mode: "paper", amplitudeMm, ...(rowExtents ? {rowExtents} : {}) };
}

/** Size only the displayed windows, without altering or resampling their signal.
 * Rows share a baseline across columns; the label band and calibration stay clear. */
export function paperRowExtents(c: ECGCase, s: Signal, previous?: Signal) {
  const provisional = paperLayout(c, 1000), ys = [...new Set(provisional.segments.map(seg => seg.y))];
  return ys.map(y => {
    let above = 0, below = 0;
    for (const seg of provisional.segments.filter(seg => seg.y === y)) {
      const gain = leadGain(seg.lead, c.view);
      above = Math.max(above, gain); // the 1 mV calibration pulse
      for (const signal of previous ? [s, previous] : [s]) {
        const values = signal.leads[seg.lead], from = Math.max(0, Math.floor(seg.start * signal.fs));
        const to = Math.min(values.length - 1, Math.ceil((seg.start + seg.duration) * signal.fs));
        for (let i = from; i <= to; i++) {
          const mm = values[i] * gain * seg.polarity;
          if (!Number.isFinite(mm)) continue;
          above = Math.max(above, mm); below = Math.max(below, -mm);
        }
      }
    }
    return {above, below};
  });
}
function grid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: typeof palettes.paper,
  show: boolean,
) {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  if (!show) return;
  for (const major of [false, true]) {
    ctx.beginPath();
    ctx.strokeStyle = major ? p.bold : p.fine;
    ctx.lineWidth = major ? 0.17 : 0.075;
    const step = major ? 5 : 1;
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
}
function setup(canvas: HTMLCanvasElement, layout: Layout, ratio: number) {
  const w = layout.widthMm * layout.pxPerMm,
    h = layout.heightMm * layout.pxPerMm;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(layout.pxPerMm * ratio, 0, 0, layout.pxPerMm * ratio, 0, 0);
  return ctx;
}
/** Ordered min/max per pixel bucket preserves extrema without changing the signal. */
function trace(
  ctx: CanvasRenderingContext2D,
  s: Signal,
  seg: Segment,
  c: ECGCase,
  pxPerMm: number,
  range?: [number, number],
) {
  const a = s.leads[seg.lead],
    gain = leadGain(seg.lead, c.view),
    scale = c.view.speed;
  const from = range?.[0] ?? seg.start,
    to = range?.[1] ?? seg.start + seg.duration;
  ctx.beginPath();
  let first = true;
  const point = (i: number) => {
    const x = seg.x + (i / s.fs - seg.start) * scale,
      y = seg.baseline - a[i] * gain * seg.polarity;
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else ctx.lineTo(x, y);
  };
  traceSampleIndices(a, s.fs, from, to, scale * pxPerMm, point);
  ctx.stroke();
}
function pulse(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  speed: number,
  gain: number,
) {
  const w = 0.2 * speed;
  ctx.beginPath();
  ctx.moveTo(x - 0.8, base);
  ctx.lineTo(x, base);
  ctx.lineTo(x, base - gain);
  ctx.lineTo(x + w, base - gain);
  ctx.lineTo(x + w, base);
  ctx.lineTo(x + w + 0.8, base);
  ctx.stroke();
}
/** Shrinks the paper scale so the whole sheet, rhythm strip included, fits the
 * visible height, never below `minWidthPx` of paper width (readability floor). */
export const heightFittedPxPerMm = (layout: Layout, maxHeightPx: number, minWidthPx = 760) =>
  Math.min(layout.pxPerMm, Math.max(minWidthPx / layout.widthMm, maxHeightPx / layout.heightMm));
/** The workspace supplies title and calibration; remove the 16 mm editorial band.
 * Row heights, sample windows and calibrated units stay unchanged. */
function workspacePaper(layout: Layout, compact = false): Layout {
  return compact ? {...layout, heightMm: layout.heightMm - 16,
    segments: layout.segments.map(s => ({...s, y: s.y - 16, baseline: s.baseline - 16}))} : layout;
}
/** Reserve an empty paper sheet; the new signal may require taller rows. */
export function renderPaperSkeleton(
  canvas: HTMLCanvasElement,
  c: ECGCase,
  availableWidth: number,
  maxHeight?: number,
  /** The previous trace's amplitude; a 2 mV deflection before the first one. */
  amplitudeMm = 2 * Math.max(c.view.gain, c.view.chestGain),
  rowExtents?: Layout["rowExtents"],
  compactHeader = false,
): Layout {
  const natural = workspacePaper(paperLayout(c, availableWidth, undefined, amplitudeMm, rowExtents), compactHeader),
    layout = maxHeight && c.view.fit
      ? {...natural, pxPerMm: heightFittedPxPerMm(natural, maxHeight)}
      : natural,
    ctx = setup(canvas, layout, Math.min(2, window.devicePixelRatio || 1));
  grid(ctx, layout.widthMm, layout.heightMm, palettes[c.view.palette], c.view.grid);
  return layout;
}
export function renderPaper(
  canvas: HTMLCanvasElement,
  s: Signal,
  c: ECGCase,
  availableWidth: number,
  options: {
    pxPerMm?: number;
    ratio?: number;
    annotations?: boolean;
    measurement?: Measurement;
    selectedBeat?: number;
    hideName?: boolean;
    displayName?: string;
    /** The interactive workspace already supplies the technical context outside the paper. */
    compactHeader?: boolean;
    /** Shared envelopes for comparing independent ECGs at identical row baselines. */
    rowExtents?: Layout["rowExtents"];
    /** OMI lens: the same patient's previous ECG, drawn in grey behind the trace. */
    previous?: Signal;
    /** OMI lens: J point (end of the generated QRS) and ST from J to J+80 ms against
     * the PR segment, red when elevated (SDST) and blue when depressed (IDST). */
    stLens?: boolean;
    /** Caption of a derived trace (e.g. the lesion alone). */
    traceNote?: string;
    /** Visible height (px) the whole sheet should fit in; see `heightFittedPxPerMm`. */
    maxHeight?: number;
  } = {},
): Layout {
  let amplitude = 0;
  for (const lead of LEADS) {
    const gain = leadGain(lead, c.view);
    for (let i = 0; i < Math.min(s.fs * 10, s.leads[lead].length); i++)
      amplitude = Math.max(amplitude, Math.abs(s.leads[lead][i]) * gain);
  }
  const ratio = options.ratio ?? Math.min(2, window.devicePixelRatio || 1);
  const extents = options.rowExtents ?? paperRowExtents(c, s, options.previous);
  const natural = workspacePaper(paperLayout(c, availableWidth, options.pxPerMm, amplitude, extents), options.compactHeader),
    layout =
      options.maxHeight && options.pxPerMm === undefined && c.view.fit
        ? {...natural, pxPerMm: heightFittedPxPerMm(natural, options.maxHeight)}
        : natural,
    ctx = setup(
      canvas,
      layout,
      ratio,
    ),
    palette = palettes[c.view.palette];
  grid(ctx, layout.widthMm, layout.heightMm, palette, c.view.grid);
  // Editorial bands stay inside the existing non-signal margins. The same
  // millimetre typography is used on screen and in the 300 dpi export.
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, layout.widthMm, options.compactHeader ? 2 : 16);
  ctx.fillRect(0, layout.heightMm - 8, layout.widthMm, 8);
  ctx.fillStyle = palette.text;
  ctx.font = "600 3.8px ui-monospace, monospace";
  if (!options.compactHeader) ctx.fillText(
    "ECG LAB  /  " +
      (options.hideName ? "CASO DE PRÁCTICA" : (options.displayName ?? c.name).toUpperCase()),
    5,
    6,
    layout.widthMm - 10,
  );
  ctx.font = "500 3px ui-monospace, monospace";
  if (!options.compactHeader) ctx.fillText(
    `${c.view.speed} mm/s  ·  ${c.view.gain} mm/mV${c.view.chestGain !== c.view.gain ? " / precordiales " + c.view.chestGain + " mm/mV" : ""}`,
    5,
    layout.heightMm - 4.8,
    layout.widthMm - 10,
  );
  ctx.font = "2.7px ui-monospace, monospace";
  const acquisitionNote = options.compactHeader
    ? [c.filter === "aggressive" ? "Filtro de demostración: modifica el ST" : c.filter === "monitor" ? "Filtro de monitor" : c.filter === "off" ? "Sin filtro diagnóstico" : "", c.notch ? `notch ${c.notch} Hz` : ""].filter(Boolean).join(" · ")
    : `${filterLabel(c)}  ·  señal sintética${c.acquisition === "ideal" ? " · sin ruido de adquisición añadido" : ""}`;
  if (acquisitionNote) ctx.fillText(
    acquisitionNote,
    5,
    options.compactHeader ? layout.heightMm - 4.8 : 14.5,
    layout.widthMm - 10,
  );
  ctx.strokeStyle = palette.trace;
  // Fitting the sheet to the height shrinks the scale, not the pen: keep the unfitted stroke in px.
  ctx.lineWidth = (0.29 * natural.pxPerMm) / layout.pxPerMm;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const doneRows = new Set<number>();
  for (const seg of layout.segments) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(seg.x - 1, seg.y, seg.width + 1, seg.height);
    ctx.clip();
    if (options.previous) {
      ctx.strokeStyle = palette.ghost;
      trace(ctx, options.previous, seg, c, layout.pxPerMm * ratio);
      ctx.strokeStyle = palette.trace;
    }
    if (options.stLens) drawStLens(ctx, s, seg, c, palette);
    trace(
      ctx,
      s,
      seg,
      c,
      layout.pxPerMm * ratio,
    );
    ctx.restore();
    ctx.fillStyle = palette.text;
    ctx.font = "600 3.5px ui-monospace,monospace";
    ctx.fillText(
      (seg.polarity < 0 ? "−" : "") + seg.lead,
      seg.x + 1,
      seg.y + 5,
    );
    if (!doneRows.has(seg.y)) {
      pulse(
        ctx,
        2,
        seg.baseline,
        c.view.speed,
        leadGain(seg.lead, c.view),
      );
      doneRows.add(seg.y);
    }
    if (seg.x > layout.segments[0].x) {
      // A short boundary marker identifies the new lead even in simultaneous
      // acquisition; no separator crosses or joins the sampled waveform.
      ctx.strokeStyle = palette.bold;
      ctx.beginPath();
      ctx.moveTo(seg.x - 0.5, seg.y + 1);
      ctx.lineTo(seg.x - 0.5, seg.y + 5);
      ctx.stroke();
      ctx.strokeStyle = palette.trace;
    }
  }
  ctx.font = "2.7px ui-monospace,monospace";
  ctx.fillStyle = palette.text;
  const recordNote = options.compactHeader ? "" : "Registro de 10 s · " +
      (c.view.timing === "simultaneous"
        ? "segmentos simultáneos"
        : "columnas secuenciales") +
      " · " +
      (c.view.cabrera ? "orden de Cabrera" : "orden estándar");
  if (recordNote || options.traceNote) ctx.fillText(
    [recordNote,options.traceNote].filter(Boolean).join(" · "),
    5,
    layout.heightMm - 1.3,
    layout.widthMm - 10,
  );
  if (options.annotations && options.measurement)
    drawAnnotations(
      ctx,
      layout,
      options.measurement,
      c,
      options.selectedBeat ?? 0,
    );
  return layout;
}
/** OMI lens marks on one segment: a tick at each J point and the ST segment, filled
 * against its PR level when it deviates by at least 0.5 mm. */
function drawStLens(ctx: CanvasRenderingContext2D, s: Signal, seg: Segment, c: ECGCase, palette: (typeof palettes)["paper"]) {
  const a = s.leads[seg.lead], gain = leadGain(seg.lead, c.view) * seg.polarity, scale = c.view.speed;
  const X = (t: number) => seg.x + (t - seg.start) * scale, Y = (v: number) => seg.baseline - v * gain;
  const marks = stMarks(s, seg.lead, seg.start, seg.start + seg.duration);
  // The caller's pen (height-fitted stroke width) must survive the overlay.
  ctx.save();
  marks.forEach((m, k) => {
    const i0 = Math.round(m.jTime * s.fs), i1 = Math.round(m.endTime * s.fs);
    const kind = seg.polarity < 0 && m.kind ? m.kind === 'SDST' ? 'IDST' : 'SDST' : m.kind;
    if (kind) {
      ctx.fillStyle = kind === "SDST" ? palette.sdstFill : palette.idstFill;
      ctx.beginPath();
      ctx.moveTo(X(m.jTime), Y(m.prLevel));
      for (let i = i0; i <= i1; i++) ctx.lineTo(X(i / s.fs), Y(a[i]));
      ctx.lineTo(X(m.endTime), Y(m.prLevel));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = kind === "SDST" ? palette.sdst : palette.idst;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) (i === i0 ? ctx.moveTo : ctx.lineTo).call(ctx, X(i / s.fs), Y(a[i]));
      ctx.stroke();
    }
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(X(m.jTime), Y(a[i0]) - 1.6);
    ctx.lineTo(X(m.jTime), Y(a[i0]) + 1.6);
    ctx.stroke();
    if (k === 0) {
      ctx.fillStyle = palette.text;
      ctx.font = "500 2.7px ui-monospace,monospace";
      // Report every first visible beat, including values below the shading threshold.
      // Equivalent millimetres remain referenced to 10 mm/mV at any display gain.
      const mm = m.j0 * seg.polarity * 10;
      // Use the reserved label band so the value cannot cover the waveform.
      ctx.fillText(`J · ST ${mm >= 0 ? "+" : ""}${mm.toFixed(1).replace(".", ",")} mm`, seg.x + 14, seg.y + 5, seg.width - 15);
    }
  });
  ctx.restore();
}

/** The overlay receives only measured sample-domain boundaries, never source events. */
function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  m: Measurement,
  c: ECGCase,
  index: number,
) {
  const b = m.beats[index];
  if (!b || m.qrs === null) return;
  for (const seg of l.segments) {
    if (b.onset < seg.start || b.onset >= seg.start + seg.duration) continue;
    const x = (t: number) => seg.x + (t - seg.start) * c.view.speed;
    ctx.save();
    ctx.beginPath();
    ctx.rect(seg.x, seg.y, seg.width, seg.height);
    ctx.clip();
    ctx.fillStyle = "rgba(8,127,128,.065)";
    ctx.fillRect(x(b.onset), seg.y, x(b.offset) - x(b.onset), seg.height);
    const marks: [number, string, string][] = [
      [b.onset, "QRS", "#087f80"],
      [b.offset, "J*", "#087f80"],
    ];
    if (b.pOnset !== null && m.pr !== null)
      marks.unshift([b.pOnset, "P", "#377ea3"]);
    if (b.tEnd !== null && m.qt !== null)
      marks.push([b.tEnd, "T fin", "#8266a9"]);
    ctx.setLineDash([0.5, 0.6]);
    ctx.lineWidth = 0.2;
    for (const [time, label, color] of marks) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x(time), seg.y + 7);
      ctx.lineTo(x(time), seg.y + seg.height - 2);
      ctx.stroke();
      ctx.font = "600 2.2px sans-serif";
      ctx.fillText(label, x(time) + 0.5, seg.y + 6);
    }
    ctx.restore();
  }
}
export function renderRhythm(
  canvas: HTMLCanvasElement,
  s: Signal,
  c: ECGCase,
  availableWidth: number,
  offset = 0,
): Layout {
  const gain = leadGain(c.view.lead, c.view);
  let amp = 0;
  for (
    let i = 0;
    i < Math.min(c.view.duration * s.fs, s.leads[c.view.lead].length);
    i++
  )
    amp = Math.max(amp, Math.abs(s.leads[c.view.lead][i]) * gain);
  const rowHeight = Math.max(35, amp * 2 + 8),
    dur = c.view.duration,
    perRow = 10,
    rows = dur / perRow,
    widthMm = 22 + c.view.speed * perRow;
  const layout: Layout = {
    widthMm,
    heightMm: 18 + rows * rowHeight + 7,
    pxPerMm: c.view.fit
      ? Math.min(c.view.pxPerMm, Math.max(960, availableWidth) / widthMm)
      : c.view.pxPerMm,
    segments: [],
    mode: "rhythm",
  };
  const ctx = setup(canvas, layout, Math.min(2, window.devicePixelRatio || 1)),
    p = palettes[c.view.palette];
  grid(ctx, widthMm, layout.heightMm, p, c.view.grid);
  ctx.fillStyle = p.text;
  ctx.font = "600 3px ui-monospace,monospace";
  ctx.fillText(
    `TIRA DE RITMO · ${c.view.lead} · ${dur} s`,
    5,
    8,
  );
  ctx.fillText(`${c.view.speed} mm/s · ${gain} mm/mV`,5,layout.heightMm-2);
  ctx.strokeStyle = p.trace;
  ctx.lineWidth = 0.25;
  for (let row = 0; row < rows; row++) {
    const y = 16 + row * rowHeight,
      seg: Segment = {
        x: 16,
        y,
        width: perRow * c.view.speed,
        height: rowHeight,
        baseline: y + rowHeight / 2,
        start: offset + row * perRow,
        duration: perRow,
        lead: c.view.lead,
        polarity: 1,
      };
    layout.segments.push(seg);
    trace(ctx, s, seg, c, layout.pxPerMm * 2);
    pulse(ctx, 2, seg.baseline, c.view.speed, gain);
    ctx.fillText(`${seg.start}–${seg.start + 10} s`, 16, y + 4);
  }
  return layout;
}
export function drawCaliper(
  canvas: HTMLCanvasElement,
  l: Layout,
  cal: Caliper,
  c: ECGCase,
): { ms: number; mm: number; mv: number } {
  const seg = l.segments[cal.segment],
    ctx = canvas.getContext("2d")!,
    ratio = canvas.width / (l.widthMm * l.pxPerMm);
  ctx.setTransform(l.pxPerMm * ratio, 0, 0, l.pxPerMm * ratio, 0, 0);
  ctx.strokeStyle = "#168ca7";
  ctx.fillStyle = "#168ca7";
  ctx.lineWidth = 0.3;
  ctx.setLineDash([1, 0.7]);
  ctx.beginPath();
  ctx.moveTo(cal.x1, seg.y);
  ctx.lineTo(cal.x1, seg.y + seg.height);
  ctx.moveTo(cal.x2, seg.y);
  ctx.lineTo(cal.x2, seg.y + seg.height);
  ctx.moveTo(Math.min(cal.x1, cal.x2), cal.y1);
  ctx.lineTo(Math.max(cal.x1, cal.x2), cal.y1);
  ctx.moveTo(Math.min(cal.x1, cal.x2), cal.y2);
  ctx.lineTo(Math.max(cal.x1, cal.x2), cal.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  return caliperMeasurement(cal, l, c.view);
}
export const filterLabel = (c: ECGCase) =>
  ({
    off: "sin filtro · AA 150 Hz",
    diagnostic: "0,05–150 Hz",
    monitor: "0,5–40 Hz",
    aggressive: "2–40 Hz",
  })[c.filter] + (c.notch ? " · notch " + c.notch + " Hz" : "");
export class Monitor {
  readonly availableSeconds: number;
  canvas: HTMLCanvasElement;
  bg: HTMLCanvasElement;
  layout: Layout;
  c: ECGCase;
  s: Signal;
  last = -1;
  ctx: CanvasRenderingContext2D;
  ratio: number;
  constructor(canvas: HTMLCanvasElement, s: Signal, c: ECGCase, width: number) {
    this.canvas = canvas;
    this.c = c;
    this.s = s;
    this.availableSeconds = Math.min(60, s.duration, s.leads[c.view.lead].length / s.fs);
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    const ppm = c.view.pxPerMm;
    const widthMm = Math.max(400, width) / ppm;
    const replay = monitorClock(0, (widthMm - 8) / c.view.speed, this.availableSeconds);
    this.layout = {
      widthMm,
      heightMm: 83,
      pxPerMm: ppm,
      segments: [
        {
          x: 4,
          y: 12,
          width: replay.duration * c.view.speed,
          height: 60,
          baseline: 47,
          start: 0,
          duration: replay.duration,
          lead: c.view.lead,
          polarity: 1,
        },
      ],
      mode: "monitor",
    };
    this.ctx = setup(canvas, this.layout, this.ratio);
    grid(this.ctx, widthMm, 83, palettes.dark, c.view.grid);
    this.ctx.fillStyle = "#91bda6";
    this.ctx.font = "3.2px ui-monospace,monospace";
    this.ctx.fillText(c.view.lead, 4, 7);
    this.ctx.font = "2.7px ui-monospace,monospace";
    this.ctx.fillText(
      `${c.view.speed} mm/s · ${leadGain(c.view.lead, c.view)} mm/mV · ${filterLabel(c)}`,
      4,
      79,
    );
    this.bg = document.createElement("canvas");
    this.bg.width = canvas.width;
    this.bg.height = canvas.height;
    this.bg.getContext("2d")!.drawImage(canvas, 0, 0);
  }
  sourceTime(seconds: number): number {
    return monitorClock(seconds, this.layout.segments[0].duration, this.availableSeconds).source;
  }
  frame(seconds: number) {
    const ctx = this.ctx,
      seg = this.layout.segments[0],
      {duration:span,cycle,phase,start:signalStart,previousStart} = monitorClock(seconds, seg.duration, this.availableSeconds),
      x = seg.x + phase * this.c.view.speed;
    let delta = this.last < 0 ? span : seconds - this.last;
    const reset = this.last < 0 || delta < 0 || delta > span;
    if (delta < 0) delta = span;
    const pmm = this.layout.pxPerMm * this.ratio;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (reset) {
      ctx.drawImage(this.bg, 0, 0);
    } else {
      const clearWidth = (delta * this.c.view.speed + 2) * pmm;
      const left = (x - delta * this.c.view.speed) * pmm;
      ctx.drawImage(
        this.bg,
        Math.max(0, left),
        12 * pmm,
        clearWidth,
        60 * pmm,
        Math.max(0, left),
        12 * pmm,
        clearWidth,
        60 * pmm,
      );
      if (phase < delta)
        ctx.drawImage(
          this.bg,
          seg.x * pmm,
          12 * pmm,
          (phase * this.c.view.speed + 2) * pmm,
          60 * pmm,
          seg.x * pmm,
          12 * pmm,
          (phase * this.c.view.speed + 2) * pmm,
          60 * pmm,
        );
    }
    ctx.restore();
    ctx.strokeStyle = "#73f0a0";
    ctx.lineWidth = 0.37;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const start = Math.max(0, phase - Math.max(delta, 0.022) - 0.005);
    const monitorSeg = { ...seg, start: signalStart };
    ctx.save();
    ctx.beginPath();
    ctx.rect(seg.x, seg.y, seg.width, seg.height);
    ctx.clip();
    if (reset && cycle > 0) {
      const prevStart = previousStart;
      trace(
        ctx,
        this.s,
        { ...seg, start: prevStart },
        this.c,
        this.layout.pxPerMm * this.ratio,
        [prevStart + phase + 2 / this.c.view.speed, prevStart + span],
      );
    }
    trace(ctx, this.s, monitorSeg, this.c, this.layout.pxPerMm * this.ratio, [
      signalStart + start,
      signalStart + phase,
    ]);
    ctx.restore();
    this.last = seconds;
  }
}
