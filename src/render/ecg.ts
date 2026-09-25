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
}
export interface Layout {
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
  segments: Segment[];
  mode: "paper" | "monitor" | "rhythm";
}
export interface Caliper {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  segment: number;
}
const palettes = {
  paper: {
    bg: "#fffdfd",
    fine: "#f4e3e6",
    bold: "#dfb7bf",
    trace: "#22353c",
    text: "#514950",
  },
  dark: {
    bg: "#081811",
    fine: "#133125",
    bold: "#244333",
    trace: "#70ef9c",
    text: "#97b9a4",
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
): Layout {
  const f = c.view.format,
    cols = f === "6x2" ? 2 : f === "12x1" ? 1 : 4,
    rows = 12 / cols,
    extra = f === "3x4+1" ? 1 : f === "3x4+3" ? 3 : 0;
  const segDuration = 10 / cols,
    colWidth = 6 + c.view.speed * segDuration,
    rowHeight = Math.max(
      32,
      (24 * Math.max(c.view.gain, c.view.chestGain)) / 10,
      amplitudeMm * 2 + 6,
    ),
    widthMm = 16 + colWidth * cols,
    heightMm = 18 + (rows + extra) * rowHeight + 8;
  const pxPerMm =
    pxOverride ??
    (c.view.fit
      ? Math.min(c.view.pxPerMm, Math.max(640, availableWidth) / widthMm)
      : c.view.pxPerMm);
  const leads = orderedLeads(c.view.cabrera);
  const segments: Segment[] = [];
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const lead = leads[col * rows + row],
        x = 10 + col * colWidth + 6,
        y = 18 + row * rowHeight;
      segments.push({
        x,
        y,
        width: c.view.speed * segDuration,
        height: rowHeight,
        baseline: y + rowHeight * 0.5,
        start: c.view.timing === "simultaneous" ? 0 : col * segDuration,
        duration: segDuration,
        lead,
        polarity: displayPolarity(lead, c.view.cabrera),
      });
    }
  for (let row = 0; row < extra; row++) {
    const y = 18 + (rows + row) * rowHeight;
    segments.push({
      x: 16,
      y,
      width: widthMm - 22,
      height: rowHeight,
      baseline: y + rowHeight * 0.5,
      start: 0,
      duration: 10,
      lead: (["II", "V1", "V5"] as Lead[])[row],
      polarity: 1,
    });
  }
  return { widthMm, heightMm, pxPerMm, segments, mode: "paper" };
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
    to = range?.[1] ?? seg.start + seg.duration,
    sampleLo = Math.max(0, Math.floor(from * s.fs)),
    sampleHi = Math.min(a.length - 1, Math.floor(to * s.fs)),
    step = Math.max(1, Math.floor(s.fs / (scale * pxPerMm)));
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
  for (let i = sampleLo; i < sampleHi; i += step) {
    if (step === 1) {
      point(i);
      continue;
    }
    let mini = i,
      maxi = i;
    for (let j = i + 1; j < Math.min(i + step, sampleHi); j++) {
      if (a[j] < a[mini]) mini = j;
      if (a[j] > a[maxi]) maxi = j;
    }
    if (mini < maxi) {
      point(mini);
      point(maxi);
    } else {
      point(maxi);
      point(mini);
    }
  }
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
  } = {},
): Layout {
  let amplitude = 0;
  for (const lead of LEADS) {
    const gain = leadGain(lead, c.view);
    for (let i = 0; i < Math.min(s.fs * 10, s.leads[lead].length); i++)
      amplitude = Math.max(amplitude, Math.abs(s.leads[lead][i]) * gain);
  }
  const layout = paperLayout(c, availableWidth, options.pxPerMm, amplitude),
    ctx = setup(
      canvas,
      layout,
      options.ratio ?? Math.min(2, window.devicePixelRatio || 1),
    ),
    palette = palettes[c.view.palette];
  grid(ctx, layout.widthMm, layout.heightMm, palette, c.view.grid);
  ctx.fillStyle = palette.text;
  ctx.font = "600 3.2px ui-monospace, monospace";
  ctx.fillText(
    "ECG LAB  /  " +
      (options.hideName ? "CASO DE PRÁCTICA" : (options.displayName ?? c.name).toUpperCase()),
    5,
    6,
  );
  ctx.font = "2.55px ui-monospace, monospace";
  ctx.fillText(
    `${c.view.speed} mm/s  ·  ${c.view.gain} mm/mV${c.view.chestGain !== c.view.gain ? " / precordiales " + c.view.chestGain : ""}  ·  ${filterLabel(c)}  ·  señal sintética`,
    5,
    11,
  );
  ctx.strokeStyle = palette.trace;
  ctx.lineWidth = 0.29;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const doneRows = new Set<number>();
  for (const seg of layout.segments) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(seg.x - 1, seg.y, seg.width + 1, seg.height);
    ctx.clip();
    trace(
      ctx,
      s,
      seg,
      c,
      layout.pxPerMm * (options.ratio ?? window.devicePixelRatio),
    );
    ctx.restore();
    ctx.fillStyle = palette.text;
    ctx.font = "600 3px ui-monospace,monospace";
    ctx.fillText(
      (seg.polarity < 0 ? "−" : "") + seg.lead,
      seg.x - 5,
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
    if (seg.start > 0) {
      ctx.setLineDash([0.8, 0.8]);
      ctx.strokeStyle = palette.bold;
      ctx.beginPath();
      ctx.moveTo(seg.x - 6, seg.y + 3);
      ctx.lineTo(seg.x - 6, seg.y + seg.height - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = palette.trace;
    }
  }
  ctx.font = "2.5px ui-monospace,monospace";
  ctx.fillStyle = palette.text;
  ctx.fillText(
    "Registro de 10 s · " +
      (c.view.timing === "simultaneous"
        ? "segmentos simultáneos"
        : "columnas secuenciales") +
      " · " +
      (c.view.cabrera ? "orden de Cabrera" : "orden estándar"),
    5,
    layout.heightMm - 3,
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
      ? Math.min(c.view.pxPerMm, Math.max(640, availableWidth) / widthMm)
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
    `TIRA DE RITMO · ${c.view.lead} · ${dur} s · ${c.view.speed} mm/s · ${gain} mm/mV`,
    5,
    8,
  );
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
  return {
    ms: (Math.abs(cal.x2 - cal.x1) / c.view.speed) * 1000,
    mm: Math.abs(cal.y2 - cal.y1),
    mv:
      Math.abs(cal.y2 - cal.y1) /
      (leadGain(seg.lead, c.view)),
  };
}
export const filterLabel = (c: ECGCase) =>
  ({
    off: "sin filtro · AA 150 Hz",
    diagnostic: "0,05–150 Hz",
    monitor: "0,5–40 Hz",
    aggressive: "2–40 Hz",
  })[c.filter] + (c.notch ? " · notch " + c.notch + " Hz" : "");
export class Monitor {
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
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    const ppm = c.view.pxPerMm;
    const widthMm = Math.max(400, width) / ppm;
    this.layout = {
      widthMm,
      heightMm: 83,
      pxPerMm: ppm,
      segments: [
        {
          x: 4,
          y: 12,
          width: widthMm - 8,
          height: 60,
          baseline: 47,
          start: 0,
          duration: (widthMm - 8) / c.view.speed,
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
  frame(seconds: number) {
    const ctx = this.ctx,
      seg = this.layout.segments[0],
      span = seg.duration,
      cycle = Math.floor(seconds / span),
      phase = seconds % span,
      x = seg.x + phase * this.c.view.speed;
    let delta = this.last < 0 ? span : seconds - this.last;
    const pmm = this.layout.pxPerMm * this.ratio;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.last < 0 || delta > span) {
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
    const start = Math.max(0, phase - Math.max(delta, 0.022) - 0.005),
      signalStart = (cycle * span) % Math.max(1, 60 - span);
    const monitorSeg = { ...seg, start: signalStart };
    ctx.save();
    ctx.beginPath();
    ctx.rect(seg.x, seg.y, seg.width, seg.height);
    ctx.clip();
    if (this.last < 0 && cycle > 0) {
      const prevStart = ((cycle - 1) * span) % Math.max(1, 60 - span);
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
