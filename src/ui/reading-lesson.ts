import { LEADS, type ECGCase, type Signal } from '../engine/types';
import { avReadingHtml, avReadingLesson } from './av-reading';
import { teachingBeats } from './teaching-signal';
import { teachingEchoScenario, teachingEchoCycle, teachingEchoSvg, teachingContraction, ECHO_DELAY_S, type EchoCycle, type EchoScenario } from './teaching-echo';
import './reading-lesson.css';

export interface EchoReadingLesson { cycle: EchoCycle; scenario: EchoScenario; wall: 'anterior' | 'inferior' }

/** A deliberately small editorial domain. Availability alone is not a teaching objective.
 * Motion is the existing scenario illustration, never an inference from ECG samples. */
export function echoReadingLesson(c: ECGCase, s: Signal): EchoReadingLesson | null {
  if (c.artifacts.reversed || c.view.cabrera || c.phase !== 'acute' ||
      !['anterior', 'inferior_rca', 'inferior_lcx'].includes(c.ischemia)) return null;
  const scenario = teachingEchoScenario(c);
  if (!scenario.available || !Number.isFinite(s.fs) || s.fs <= 0 || !Number.isFinite(s.duration)) return null;
  const n = s.leads.II?.length ?? 0, last = Math.min(10, s.duration, (n - 1) / s.fs);
  if (!(last > 0) || n < Math.floor(Math.min(10, s.duration) * s.fs)) return null;
  for (const lead of LEADS) {
    const a = s.leads[lead];
    if (!(a instanceof Float64Array) || a.length !== n) return null;
    for (let i = 0; i <= Math.floor(last * s.fs); i++) if (!Number.isFinite(a[i])) return null;
  }
  for (const index of teachingBeats(s)) {
    const cycle = teachingEchoCycle(s, index), b = s.events.beats[index];
    if (cycle && cycle.end <= last && Number.isFinite(b.qrs) && b.qrs! > 0 && b.qrs! < cycle.rr)
      return { cycle, scenario, wall: c.ischemia === 'anterior' ? 'anterior' : 'inferior' };
  }
  return null;
}

/** Inline support below the acquired ECG. No case controls, worker calls or measurements. */
export function mountReadingLesson(root: HTMLElement, c: ECGCase, s: Signal): () => void {
  const abort = new AbortController();
  root.className = 'reading-lesson'; root.replaceChildren(); root.hidden = true;
  const av = avReadingLesson(c, s);
  const clear = () => { root.replaceChildren(); root.hidden = true; for (const k of Object.keys(root.dataset)) delete root.dataset[k]; };
  if (av) {
    root.innerHTML = avReadingHtml(av, s); root.hidden = false; root.dataset.kind = 'av';
    return () => { abort.abort(); clear(); };
  }
  const echo = echoReadingLesson(c, s);
  if (!echo) return clear;
  root.hidden = false; root.dataset.kind = 'echo';
  root.innerHTML = `<article class="lesson-echo" aria-labelledby="lesson-echo-title"><div class="lesson-echo-copy"><h3 id="lesson-echo-title">Actividad eléctrica y contracción</h3><p>El ECG muestra la activación eléctrica. Este esquema permite observar el movimiento de las paredes y cómo una de ellas se contrae menos.</p><p class="lesson-echo-note">Ejemplo ilustrativo de la pared ${echo.wall}.</p></div><figure><div class="lesson-echo-image"></div><figcaption>Esquema de contracción · vista de dos cámaras</figcaption></figure><div class="lesson-echo-controls"><button type="button" class="btn" data-lesson-play aria-pressed="false">Ver movimiento</button><label for="lesson-echo-time" class="sr-only">Recorrer la contracción</label><input id="lesson-echo-time" type="range" min="0" max="100" step="1" value="0"/><output class="lesson-phase" aria-live="off"></output></div></article>`;
  const image = root.querySelector<HTMLElement>('.lesson-echo-image')!;
  const button = root.querySelector<HTMLButtonElement>('[data-lesson-play]')!;
  const slider = root.querySelector<HTMLInputElement>('#lesson-echo-time')!;
  const phase = root.querySelector<HTMLOutputElement>('.lesson-phase')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0, raf = 0, last: number | null = null, playing = false, disposed = false;
  const paint = () => {
    if (disposed) return;
    const f = teachingContraction(elapsed, echo.cycle.rr);
    image.innerHTML = teachingEchoSvg('A2C', echo.scenario.motion, f, -1).replace('</svg>', '<text class="lesson-wall-name" x="78" y="147">Inferior</text><text class="lesson-wall-name" x="312" y="147">Anterior</text></svg>');
    image.querySelector('svg')!.setAttribute('aria-label', `Esquema de dos cámaras con contracción reducida de la pared ${echo.wall}. Ilustración del escenario, no resultado obtenido del ECG.`);
    slider.value = String(elapsed / echo.cycle.rr * 100);
    phase.textContent = elapsed <= ECHO_DELAY_S ? 'Inicio' : f > .01 ? 'Contracción' : 'Reposo';
    slider.setAttribute('aria-valuetext', phase.textContent);
    root.dataset.time = String(echo.cycle.start + elapsed);
    root.dataset.start = String(echo.cycle.start); root.dataset.end = String(echo.cycle.end);
  };
  const pause = () => {
    cancelAnimationFrame(raf); raf = 0; last = null; playing = false;
    button.textContent = 'Ver movimiento'; button.setAttribute('aria-pressed', 'false'); root.dataset.playing = 'false';
  };
  const frame = (now: number) => {
    if (!playing || disposed) return;
    if (!root.isConnected || document.hidden || reduced.matches || document.querySelector('dialog[open]')) { pause(); return; }
    if (last !== null) elapsed = Math.min(echo.cycle.rr, elapsed + Math.min(now - last, 100) / 1000 * .25);
    last = now; paint();
    if (elapsed >= echo.cycle.rr) pause(); else raf = requestAnimationFrame(frame);
  };
  button.addEventListener('click', () => {
    if (reduced.matches) return;
    if (playing) { pause(); return; }
    elapsed = 0; paint(); playing = true; root.dataset.playing = 'true';
    button.textContent = 'Pausar'; button.setAttribute('aria-pressed', 'true'); raf = requestAnimationFrame(frame);
  }, { signal: abort.signal });
  slider.addEventListener('input', () => { pause(); elapsed = Math.max(0, Math.min(100, Number(slider.value))) / 100 * echo.cycle.rr; paint(); }, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal: abort.signal });
  const motionPreference = () => { pause(); button.disabled = reduced.matches; };
  reduced.addEventListener('change', motionPreference, { signal: abort.signal });
  const observer = new IntersectionObserver(entries => { if (entries.some(e => !e.isIntersecting)) pause(); });
  observer.observe(root); motionPreference(); paint();
  return () => { disposed = true; pause(); abort.abort(); observer.disconnect(); clear(); };
}
