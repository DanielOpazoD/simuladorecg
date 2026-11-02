import type { Measurement } from '../engine/types';
import { acceptedBeatIntervals } from './automatic-intervals';

export interface BeatPlayback {
  start: number; onset: number; offset: number; end: number; hasPr: boolean; review: boolean;
}

/** Same multilead delineation as PR/QRS/QT marks, never model timings or invented P/T offsets. */
export function beatPlayback(m: Measurement | null, from: number, to: number): BeatPlayback | null {
  if (!m || !Number.isFinite(from + to) || to <= from) return null;
  for (const b of m.beats) {
    const intervals = acceptedBeatIntervals(m, b, from, to);
    const qrs = intervals.find(x => x.key === 'qrs'), qt = intervals.find(x => x.key === 'qt');
    if (!qrs || !qt || qt.start !== qrs.start || qt.end <= qrs.end) continue;
    // An overlapping next QRS is not one complete, separately readable cycle.
    if (m.beats.some(next => next !== b && next.onset > qrs.start && next.onset < qt.end)) continue;
    const pr = intervals.find(x => x.key === 'pr');
    return { start: pr?.start ?? qrs.start, onset: qrs.start, offset: qrs.end, end: qt.end,
      hasPr: !!pr, review: intervals.some(x => x.review) };
  }
  return null;
}

export function beatPhase(b: BeatPlayback, time: number): string {
  if (b.hasPr && time < b.onset) return 'PR · aurículas y conducción';
  if (time < b.offset) return 'QRS · activación ventricular';
  // Neither P offset nor T onset is supplied by the delineator: do not invent separate phases.
  return 'ST–T · repolarización';
}

/** Read-only cursor in the existing observation/caliper slot. Owns no signal, measurement or SVG geometry. */
export function mountBeatPlayback(root: HTMLElement, timeline: BeatPlayback | null, fs: number) {
  const observe = root.querySelector<HTMLElement>('.lead-detail-observe')!;
  const abort = new AbortController(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let time = timeline?.start ?? 0, raf = 0, last: number | null = null, playing = false, disposed = false, started = false;
  const node = document.createElement('div'); node.className = 'lens-playback';
  node.hidden = !timeline;
  node.innerHTML = '<button type="button" class="text-button lens-play">Latido lento</button><input type="range" class="lens-playhead" aria-label="Recorrer el latido"/><output class="lens-phase" aria-live="off"></output>';
  observe.append(node);
  const button = node.querySelector<HTMLButtonElement>('button')!, slider = node.querySelector<HTMLInputElement>('input')!, output = node.querySelector<HTMLOutputElement>('output')!;
  const hint = root.querySelector<HTMLElement>('.lead-observation')!;
  const options = { signal: abort.signal };
  const pause = () => {
    cancelAnimationFrame(raf); raf = 0; last = null; playing = false;
    button.textContent = 'Latido lento'; button.setAttribute('aria-label','Reproducir un latido lentamente');
    root.dataset.playing = 'false';
  };
  function paint() {
    if (!timeline || disposed) return;
    const phase = beatPhase(timeline, time);
    // Polarity/connection notices remain visible. Ordinary case hints remain accessible.
    const limited = root.dataset.polarity === '-1' || root.dataset.reversed === 'true';
    node.hidden = limited; hint.classList.toggle('sr-only',!limited); hint.hidden = !hint.textContent;
    if (limited) pause();
    slider.value = String(time);
    slider.setAttribute('aria-valuetext', phase + (timeline.review ? ' · Revisar límites' : ''));
    output.textContent = (started ? phase : timeline.hasPr ? 'PR · QRS · ST–T' : 'QRS · ST–T') + (timeline.review ? '*' : '');
    output.title = 'Límites estimados multiderivación, iguales a las marcas automáticas.' + (timeline.review ? ' Revisar.' : '');
    root.dataset.playheadTime = String(time);
    const svg = root.querySelector<SVGSVGElement>('.lead-detail-trace'); if (!svg) return;
    let cursor = svg.querySelector<SVGGElement>('.lens-playback-cursor');
    if (!cursor) {
      cursor = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      cursor.classList.add('lens-playback-cursor'); cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = '<path vector-effect="non-scaling-stroke"/>';
      svg.append(cursor);
    }
    const x = 4 + (time - Number(root.dataset.start)) * 50;
    cursor.setAttribute('transform', `translate(${x} 0)`);
    cursor.querySelector('path')!.setAttribute('d', `M0 1V${Number(svg.dataset.traceHeight)}`);
    cursor.setAttribute('visibility', started && !limited ? 'visible' : 'hidden');
  }
  const frame = (now: number) => {
    if (!playing || !timeline || disposed) return;
    if (!root.isConnected || !root.closest('dialog')?.open || document.hidden || root.classList.contains('has-manual') || reduced.matches) { pause(); return; }
    if (last !== null) time = Math.min(timeline.end, time + Math.min(now - last, 100) / 1000 * .25);
    last = now; paint();
    if (time >= timeline.end) pause(); else raf = requestAnimationFrame(frame);
  };
  if (timeline) {
    slider.min = String(timeline.start); slider.max = String(timeline.end); slider.step = String(1 / fs);
    root.dataset.playheadStart = String(timeline.start); root.dataset.playheadEnd = String(timeline.end);
    button.title = reduced.matches ? 'Movimiento reducido: recorre el latido con el control de tiempo' : 'Reproducir un latido a un cuarto de velocidad';
    button.disabled = reduced.matches;
    paint();
  }
  button.addEventListener('click', () => {
    if (!timeline || reduced.matches) return;
    if (playing) { pause(); return; }
    if (time >= timeline.end) time = timeline.start;
    started = true; paint(); playing = true; last = null; button.textContent = 'Pausar'; button.setAttribute('aria-label','Pausar recorrido');
    root.dataset.playing = 'true'; raf = requestAnimationFrame(frame);
  }, options);
  slider.addEventListener('input', () => {
    if (!timeline) return;
    pause(); started = true; time = Math.max(timeline.start, Math.min(timeline.end, Number(slider.value))); paint();
  }, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, options);
  reduced.addEventListener('change', () => { pause(); button.disabled = reduced.matches; }, options);
  pause();
  return { pause, refresh: paint, dispose: () => { disposed = true; pause(); abort.abort(); node.remove(); hint.classList.remove('sr-only'); root.querySelector('.lens-playback-cursor')?.remove(); } };
}
