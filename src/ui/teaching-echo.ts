import { LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";
import { esc } from "./helpers";
import "./teaching-echo.css";

export type EchoView = "PLAX" | "PSAX" | "A4C" | "A2C";
export type WallMotion = "normal" | "hypo" | "aki" | "dys";
export interface EchoSegment { id: number; name: string; ring: number; angle: number; leads: readonly Lead[] }
const sectorNames = ["anterior", "anteroseptal", "inferoseptal", "inferior", "inferolateral", "anterolateral"];
const sectorLeads: readonly (readonly Lead[])[] = [["V3", "V4"], ["V1", "V2"], ["V1", "V2"], ["II", "III", "aVF"], ["I", "aVL", "V5", "V6"], ["I", "aVL", "V5", "V6"]];
/** Segment names follow ASE/EACVI 2015. Lead association is an approximate teaching aid. */
export const ECHO_SEGMENTS: readonly EchoSegment[] = [
  ...[0, 1].flatMap(ring => sectorNames.map((name, i) => ({ id: ring * 6 + i + 1, name: `${ring ? "Medio" : "Basal"} ${name}`, ring, angle: -90 - i * 60, leads: sectorLeads[i] }))),
  ...["anterior", "septal", "inferior", "lateral"].map((name, i) => ({ id: 13 + i, name: `Apical ${name}`, ring: 2, angle: -90 - i * 90, leads: sectorLeads[[0, 1, 3, 5][i]] })),
];
export const ECHO_VIEWS: Record<EchoView, { name: string; walls: readonly (readonly number[])[]; segments: readonly number[]; caption: string }> = {
  PLAX: { name: "Paraesternal longitudinal", walls: [[2, 8], [5, 11]], segments: [2, 8, 5, 11], caption: "Anteroseptal e inferolateral, niveles basal y medio. El ápex no se valora en este plano." },
  PSAX: { name: "Eje corto medio", walls: [], segments: [7, 8, 9, 10, 11, 12], caption: "Corte a nivel medio: los seis segmentos rodean la cavidad del VI." },
  A4C: { name: "Apical de cuatro cámaras", walls: [[3, 9, 14], [6, 12, 16]], segments: [3, 9, 14, 6, 12, 16], caption: "Pared inferoseptal y anterolateral; segmentos apicales septal y lateral." },
  A2C: { name: "Apical de dos cámaras", walls: [[4, 10, 15], [1, 7, 13]], segments: [4, 10, 15, 1, 7, 13], caption: "Pared inferior y anterior, desde la base hasta el ápex." },
};
export const MOTION_NAMES: Record<WallMotion, string> = { normal: "Conservada", hypo: "Hipocinesia", aki: "Acinesia", dys: "Discinesia" };
export const ECHO_DELAY_S = .08;
export interface EchoScenario { available: boolean; reason: string; name: string; affected: readonly number[]; motion: Record<number, WallMotion> }

/** No ECG amplitudes, phase clock, numerical ST or sampled waveform enter this assignment. */
export function teachingEchoScenario(c: ECGCase): EchoScenario {
  const motion = Object.fromEntries(ECHO_SEGMENTS.map(s => [s.id, "normal" as WallMotion]));
  const fail = (reason: string): EchoScenario => ({ available: false, reason, name: "Eco no representado", affected: [], motion });
  if (c.rhythm !== "sinus" || c.av !== "normal" || c.ectopy !== "none") return fail("Este esquema solo representa ciclos sinusales sin bloqueo AV ni ectopia. No modela la mecánica de este ritmo.");
  if (c.conduction !== "normal" || (c.activationModel && c.activationModel !== "template")) return fail("La disincronía de conducción no está modelada en este eco docente.");
  if (c.overload !== "none" || c.electrolyte !== "none") return fail("La mecánica de la sobrecarga o de esta alteración metabólica no está modelada.");
  const families: Partial<Record<ECGCase["ischemia"], { name: string; affected: number[] }>> = {
    none: { name: "Ejemplo de motilidad conservada", affected: [] },
    anterior: { name: "Ejemplo de disfunción anterior y septal", affected: [1, 2, 7, 8, 13, 14] },
    lateral: { name: "Ejemplo de disfunción lateral", affected: [5, 6, 11, 12, 16] },
    inferior_rca: { name: "Ejemplo de disfunción inferior", affected: [3, 4, 9, 10, 15] },
    inferior_lcx: { name: "Ejemplo de disfunción inferior", affected: [3, 4, 9, 10, 15] },
    posterior: { name: "Ejemplo de disfunción inferolateral", affected: [5, 11] },
  };
  const family = families[c.ischemia];
  if (!family) return fail("Este patrón no dispone de una correspondencia mecánica docente revisable. No se genera un eco a partir del ST.");
  for (const id of family.affected) motion[id] = "hypo";
  return { available: true, reason: "Asignación ilustrativa del escenario, no hallazgo medido ni predicción del eco de un paciente.", ...family, motion };
}

export interface EchoCycle { start: number; end: number; rr: number }
/** Prefer the observed next event. Do not loop beyond sampled data or across an invalid event. */
export function teachingEchoCycle(signal: Signal, beatIndex: number): EchoCycle | null {
  if (!Number.isSafeInteger(beatIndex) || beatIndex < 0 || !Number.isFinite(signal.fs) || signal.fs <= 0 || !Number.isFinite(signal.duration) || signal.duration <= 0) return null;
  const beat = signal.events.beats[beatIndex];
  if (!beat || beat.kind !== "normal" || !Number.isFinite(beat.time) || beat.time < 0) return null;
  const next = signal.events.beats[beatIndex + 1], end = next ? next.time : beat.time + beat.rr;
  if (LEADS.some(lead => !signal.leads[lead]?.length)) return null;
  const rr = end - beat.time, limit = Math.min(signal.duration, ...LEADS.map(lead => signal.leads[lead].length / signal.fs));
  if (!Number.isFinite(rr) || rr < .3 || rr > 3 || !Number.isFinite(end) || end > limit || (next && next.kind !== "normal")) return null;
  return { start: beat.time, end, rr };
}

/** A smooth illustrative envelope: starts80ms after QRS, no relation to measured EF or QT. */
export function teachingContraction(elapsed: number, rr: number): number {
  if (!Number.isFinite(elapsed) || !Number.isFinite(rr) || rr < .3 || elapsed <= ECHO_DELAY_S || elapsed >= rr) return 0;
  const end = Math.min(.48, rr * .70), u = (elapsed - ECHO_DELAY_S) / (end - ECHO_DELAY_S);
  return u >= 1 ? 0 : Math.sin(Math.PI * Math.max(0, u)) ** 2;
}
export function wallGeometry(motion: WallMotion, contraction: number): { excursion: number; thickness: number } {
  const f = Math.max(0, Math.min(1, Number.isFinite(contraction) ? contraction : 0));
  // Original visual parameters, not clinical thresholds or volume measurements.
  const factor = { normal: 1, hypo: .35, aki: 0, dys: -.35 }[motion];
  return { excursion: .18 * factor * f, thickness: 1 + .45 * factor * f };
}

/** Shared boundary values avoid tears between segments with different motion. */
function continuousWall(ids: readonly number[], motion: Readonly<Record<number, WallMotion>>, position: number, contraction: number, cyclic = false) {
  const p = cyclic ? ((position % ids.length) + ids.length) % ids.length : Math.max(0, Math.min(ids.length - 1, position));
  const low = Math.floor(p), high = cyclic ? (low + 1) % ids.length : Math.min(ids.length - 1, low + 1), mix = p - low;
  const a = wallGeometry(motion[ids[low]], contraction), b = wallGeometry(motion[ids[high]], contraction);
  return { excursion: a.excursion + (b.excursion - a.excursion) * mix, thickness: a.thickness + (b.thickness - a.thickness) * mix };
}

function n(value: number) { return value.toFixed(2); }
function point(x: number, y: number) { return `${n(x)},${n(y)}`; }
function attributes(id: number, motion: WallMotion, selected: number, related: ReadonlySet<number>) {
  return `data-echo-segment="${id}" class="echo-wall echo-${motion}${id === selected ? " echo-selected" : ""}${related.has(id) ? " echo-related" : ""}"`;
}
function motionLegend() {
  return `<ul class="echo-legend">${(Object.keys(MOTION_NAMES) as WallMotion[]).map(m => `<li><i class="echo-swatch echo-${m}"></i>${MOTION_NAMES[m]}</li>`).join("")}</ul>`;
}

/** Geometry expressed in arbitrary view units; no ultrasound texture or invented patient measurements. */
export function teachingEchoSvg(view: EchoView, motion: Readonly<Record<number, WallMotion>>, contraction: number, selected = 0, related: ReadonlySet<number> = new Set()): string {
  const paths: string[] = [];
  if (view === "PSAX") {
    const ids = ECHO_VIEWS.PSAX.segments;
    for (let i = 0; i < 6; i++) {
      const id = 7 + i;
      const edge = (position: number, outer: boolean) => {
        const g = continuousWall(ids, motion, position, contraction, true), a = (-90 - position * 60) * Math.PI / 180;
        const radius = 64 * (1 - g.excursion) + (outer ? 16 * g.thickness : 0);
        return point(180 + radius * Math.cos(a), 133 + radius * Math.sin(a));
      };
      const outer = [0,1,2,3,4,5,6].map(k=>edge(i-.5+k/6,true)), inner = [6,5,4,3,2,1,0].map(k=>edge(i-.5+k/6,false));
      paths.push(`<path ${attributes(id, motion[id], selected, related)} d="M${outer.join(" L")} L${inner.join(" L")} Z"><title>${esc(ECHO_SEGMENTS[id - 1].name)}: ${MOTION_NAMES[motion[id]]}</title></path>`);
      const mid = (-90 - i * 60) * Math.PI / 180;
      paths.push(`<text x="${n(180 + 94 * Math.cos(mid))}" y="${n(137 + 94 * Math.sin(mid))}" class="echo-number">${id}</text>`);
    }
    paths.push(`<path d="M109,81 Q61,97 94,174 L110,164 Q90,120 121,94" class="echo-other"/><text x="78" y="129" class="echo-label">VD</text><text x="180" y="139" class="echo-label">VI</text>`);
    paths.push(`<circle cx="158" cy="151" r="7" class="echo-papillary"/><circle cx="203" cy="150" r="7" class="echo-papillary"/>`);
  } else if (view === "PLAX") {
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < 2; j++) {
        const ids = ECHO_VIEWS.PLAX.walls[side], id = ids[j], sign = side ? 1 : -1;
        const edge = (t: number, outer: boolean) => {
          const g = continuousWall(ids, motion, t - .5, contraction), y = 138 + sign * (45 * (1 - g.excursion) + (outer ? 15 * g.thickness : 0));
          return point(263 - t * 88, y - 3 * Math.sin(t * Math.PI / 2));
        };
        const outer = [0,1,2,3,4].map(k=>edge(j+k/4,true)), inner = [4,3,2,1,0].map(k=>edge(j+k/4,false));
        paths.push(`<path ${attributes(id, motion[id], selected, related)} d="M${outer.join(" L")} L${inner.join(" L")} Z"><title>${esc(ECHO_SEGMENTS[id - 1].name)}: ${MOTION_NAMES[motion[id]]}</title></path><text x="${219-j*88}" y="${138+sign*79}" class="echo-number">${id}</text>`);
      }
    }
    paths.push(`<path d="M87,93 Q35,128 87,183 M264,94 L302,83 L317,108 L265,123 M263,177 Q325,207 324,147 L285,122 M91,77 Q162,41 240,77" class="echo-other"/><text x="166" y="143" class="echo-label">VI</text><text x="162" y="70" class="echo-label">VD</text><text x="305" y="162" class="echo-label">AI</text><text x="304" y="100" class="echo-label">Ao</text>`);
  } else {
    // Both apical views use exactly the same construction so a given wall state
    // has the same excursion/thickening in either orientation.
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1, ids = ECHO_VIEWS[view].walls[side];
      for (let j = 0; j < 3; j++) {
        const id = ids[j], t0 = j / 3, t1 = (j + 1) / 3;
        const edge = (t: number, outer: boolean): string => {
          const g = continuousWall(ids, motion, t * 3 - .5, contraction);
          const radius = 61 * Math.cos(t * Math.PI / 2), width = radius * (1 - g.excursion) + (outer ? 15 * g.thickness : 0);
          return point(200 + sign * width, 191 - t * 145);
        };
        const outer = [0, 1, 2, 3, 4].map(k => edge(t0 + (t1 - t0) * k / 4, true));
        const inner = [4, 3, 2, 1, 0].map(k => edge(t0 + (t1 - t0) * k / 4, false));
        paths.push(`<path ${attributes(id, motion[id], selected, related)} d="M${outer.join(" L")} L${inner.join(" L")} Z"><title>${esc(ECHO_SEGMENTS[id - 1].name)}: ${MOTION_NAMES[motion[id]]}</title></path>`);
        const tm = (t0 + t1) / 2;
        paths.push(`<text x="${n(200 + sign * (61 * Math.cos(tm * Math.PI / 2) + 32))}" y="${n(196 - tm * 145)}" class="echo-number">${id}</text>`);
      }
    }
    paths.push(`<path d="M142,194 Q142,253 201,250 Q259,254 258,194" class="echo-other"/><text x="200" y="153" class="echo-label">VI</text><text x="200" y="230" class="echo-label">AI</text>`);
    if (view === "A4C") paths.push(`<path d="M125,190 Q54,163 174,43 Q112,116 142,191 M125,193 Q47,222 93,248 Q123,259 142,224" class="echo-other"/><text x="108" y="153" class="echo-label">VD</text><text x="107" y="233" class="echo-label">AD</text>`);
  }
  return `<svg class="echo-image" viewBox="0 0 360 275" role="img" aria-label="${esc(ECHO_VIEWS[view].name)}: esquema de motilidad, no imagen ecográfica adquirida"><rect width="360" height="275" rx="12" class="echo-image-bg"/><text x="16" y="23" class="echo-view-label">${view} · ESQUEMA</text>${paths.join("")}</svg>`;
}

/** An original ellipsoidal projection. Rotation is spatial orientation, not a patient reconstruction. */
export function teachingAnatomySvg(angle: number, selected: number, related: ReadonlySet<number>, affected: ReadonlySet<number>, motion?: Readonly<Record<number, WallMotion>>): string {
  const rot = Number.isFinite(angle) ? angle * Math.PI / 180 : 0;
  const project = (theta: number, z: number) => {
    const radius = 64 * Math.sqrt(Math.max(0, 1 - (z / 1.12) ** 2));
    const x = radius * Math.sin(theta + rot), depth = radius * Math.cos(theta + rot);
    return { x: 155 + x + z * 17, y: 55 + z * 145 + depth * .16, depth };
  };
  const surfaces = ECHO_SEGMENTS.map(segment => {
    const count = segment.ring === 2 ? 4 : 6, theta = segment.angle * Math.PI / 180, half = Math.PI / count;
    const z0 = segment.ring / 3, z1 = (segment.ring + 1) / 3;
    const points = [project(theta - half, z0), project(theta + half, z0), project(theta + half, z1), project(theta - half, z1)];
    const center = project(theta, (z0 + z1) / 2);
    const state = motion?.[segment.id] ?? (affected.has(segment.id) ? "hypo" : "normal");
    const classes = `anatomy-${state}${related.has(segment.id) ? " anatomy-related" : ""}${selected === segment.id ? " anatomy-selected" : ""}`;
    return { depth: center.depth, html: `<path data-echo-segment="${segment.id}" class="anatomy-segment ${classes}" d="M${points.map(p => point(p.x, p.y)).join(" L")} Z" opacity="${center.depth < 0 ? .30 : 1}"><title>${esc(segment.name)}</title></path>${center.depth >= 0 ? `<text x="${n(center.x)}" y="${n(center.y + 4)}" class="anatomy-number">${segment.id}</text>` : ""}` };
  }).sort((a, b) => a.depth - b.depth);
  return `<svg class="echo-anatomy" viewBox="0 0 310 245" role="img" aria-label="Proyección geométrica orientativa de los 16 segmentos del ventrículo izquierdo"><path d="M91,52 Q37,99 143,207" class="anatomy-rv"/>${surfaces.map(s => s.html).join("")}<text x="155" y="25" class="anatomy-label">Base</text><text x="177" y="228" class="anatomy-label">Ápex</text><text x="51" y="120" class="anatomy-label">VD</text></svg>`;
}

export interface TeachingEchoOptions { c: ECGCase; signal: Signal; lead: Lead; beatIndex: number; onLeadChange: (lead: Lead) => void; onCursorTime?: (time: number) => void }
export interface TeachingEchoHandle { setSelection: (lead: Lead, beatIndex: number) => void; setCursorTime: (time: number) => void; destroy: () => void }

export function mountTeachingEcho(root: HTMLElement, options: TeachingEchoOptions): TeachingEchoHandle {
  const scenario = teachingEchoScenario(options.c), motion = { ...scenario.motion }, signal = options.signal;
  let lead = options.lead, beatIndex = options.beatIndex, cycle = teachingEchoCycle(signal, beatIndex), view: EchoView = "A4C";
  let selected = ECHO_SEGMENTS.find(s => s.leads.includes(lead))?.id ?? 1, elapsed = 0, playing = false, speed = 1, angle = 90, raf = 0, last = 0, destroyed = false;
  const reversed = options.c.artifacts.reversed, reduced = matchMedia("(prefers-reduced-motion: reduce)"), controller = new AbortController();
  const signalOption = { signal: controller.signal };
  const available = () => scenario.available && cycle !== null;
  root.classList.add("teaching-echo");
  root.innerHTML = `<p class="echo-eyebrow">ECG · ANATOMÍA · MOVIMIENTO</p><h3>Eco docente</h3><p class="echo-intro">Cuatro planos para explorar el movimiento regional. Geometría ilustrativa vinculada al escenario, sin imagen ecográfica de pacientes ni estimación de fracción de eyección.</p><div class="echo-status" role="status"></div>
    <div class="echo-view-buttons" role="group" aria-label="Plano ecocardiográfico">${(Object.keys(ECHO_VIEWS) as EchoView[]).map(v => `<button type="button" class="btn" data-echo-view="${v}" aria-pressed="${v === view}">${v}<span>${ECHO_VIEWS[v].name}</span></button>`).join("")}</div>
    <div class="echo-panes"><figure class="echo-main"><div data-echo-image></div><figcaption data-echo-caption></figcaption></figure><figure class="echo-anatomy-panel"><div data-echo-anatomy></div><figcaption>Orientación geométrica del VI. Selección y asociaciones aproximadas, sin reconstrucción anatómica individual.</figcaption><label for="echo-rotation">Girar orientación</label><input id="echo-rotation" type="range" min="-180" max="180" step="5" value="90"/><div class="echo-orientations" role="group" aria-label="Orientación del modelo"><button type="button" class="btn" data-echo-angle="90">Anterior</button><button type="button" class="btn" data-echo-angle="0">Lateral</button><button type="button" class="btn" data-echo-angle="-90">Inferior</button></div></figure></div>
    <div class="echo-transport"><button type="button" class="btn" data-echo-play aria-pressed="false">Reproducir</button><button type="button" class="btn" data-echo-step="-1" aria-label="Retroceder 20 milisegundos">−20 ms</button><button type="button" class="btn" data-echo-step="1" aria-label="Avanzar 20 milisegundos">+20 ms</button><label for="echo-speed">Velocidad</label><select id="echo-speed"><option value="1">Normal</option><option value="0.25">Cámara lenta ×0,25</option></select></div>
    <label for="echo-time">Recorrer el ciclo seleccionado</label><input id="echo-time" type="range" min="0" max="1000" step="1" value="0"/><output class="echo-time-readout" data-echo-time aria-live="off"></output><div data-echo-strip></div>
    <p class="echo-timing-note">Sincronización con el inicio del QRS del modelo. El retraso de 80 ms y la curva mecánica son ilustrativos; no se calculan a partir del ST ni del QT. Reproducción del mismo ciclo, sin evolución de una lesión.</p>
    ${motionLegend()}<div class="echo-selection"><label for="echo-segment">Segmento del ventrículo izquierdo</label><select id="echo-segment">${ECHO_SEGMENTS.map(s => `<option value="${s.id}">${s.id}. ${esc(s.name)}</option>`).join("")}</select><div data-echo-related></div><label for="echo-motion">Variación docente del segmento seleccionado</label><select id="echo-motion">${(Object.keys(MOTION_NAMES) as WallMotion[]).map(m => `<option value="${m}">${MOTION_NAMES[m]}</option>`).join("")}</select><button type="button" class="text-button" data-echo-reset>Restablecer ejemplo del escenario</button><p class="echo-variation-note">La variación manual afecta solo a este esquema. No modifica el ECG ni diagnostica una causa.</p></div>
    <details class="echo-method"><summary>Qué está respaldado y qué es ilustrativo</summary><p>La nomenclatura de 16 segmentos y la atención al engrosamiento y desplazamiento regional siguen las recomendaciones ASE/EACVI. No se puntúa el casquete apical. Las amplitudes, geometría, tiempos y asignación de hipocinesia por escenario son parámetros docentes sin validación clínica independiente.</p><p>La relación entre derivaciones, paredes y territorios es aproximada y variable. Un ECG no determina de forma única el movimiento regional, y un movimiento conservado no descarta una lesión coronaria. El esquema no calcula FEVI, WMSI ni strain.</p><p><a href="https://asecho.org/wp-content/uploads/2016/02/2015_ChamberQuantificationREV.pdf" target="_blank" rel="noopener">ASE/EACVI 2015 · secciones 3.1–3.2</a>. Pendiente de revisión humana independiente.</p></details>`;
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const relatedIds = () => new Set(reversed ? [] : ECHO_SEGMENTS.filter(s => s.leads.includes(lead)).map(s => s.id));
  function emitTime() { if (cycle) options.onCursorTime?.(cycle.start + elapsed); }
  function strip() {
    if (!cycle) { q("[data-echo-strip]").innerHTML = ""; return; }
    const samples = signal.leads[lead], from = Math.round(cycle.start * signal.fs), to = Math.min(samples.length - 1, Math.round(cycle.end * signal.fs));
    let max = .1; for (let i = from; i <= to; i++) if (Number.isFinite(samples[i])) max = Math.max(max, Math.abs(samples[i]));
    let path = "", pen = false;
    for (let i = from; i <= to; i++) {
      if (!Number.isFinite(samples[i])) { pen = false; continue; }
      path += `${pen ? "L" : "M"}${n(20 + (i / signal.fs - cycle.start) / cycle.rr * 560)},${n(53 - samples[i] / max * 31)}`; pen = true;
    }
    q("[data-echo-strip]").innerHTML = `<svg class="echo-strip" viewBox="0 0 600 110" role="img" aria-label="Derivación ${lead}, muestras finales del ciclo seleccionado; amplitud ajustada solo para orientación temporal"><text x="20" y="22">${lead} · tira temporal · amplitud ajustada</text><path d="${path}" class="echo-strip-trace"/><line data-echo-cursor x1="20" x2="20" y1="25" y2="83"/><text x="20" y="106">QRS</text><text x="580" y="106" text-anchor="end">${Math.round(cycle.rr * 1000)} ms</text></svg><p class="echo-strip-caption">Derivación ${lead} · un ciclo de ${Math.round(cycle.rr * 1000)} ms. Amplitud ajustada para seguir el tiempo; utiliza el trazado principal para medir voltajes.</p>`;
  }
  function updateFrame() {
    const f = available() ? teachingContraction(elapsed, cycle!.rr) : 0;
    q("[data-echo-image]").innerHTML = teachingEchoSvg(view, motion, f, selected, relatedIds());
    q("[data-echo-caption]").textContent = ECHO_VIEWS[view].caption;
    if (cycle) {
      const ms = Math.round(elapsed * 1000), absolute = (cycle.start + elapsed).toFixed(3).replace(".", ",");
      q<HTMLOutputElement>("[data-echo-time]").textContent = `QRS ${beatIndex + 1} · ${ms} ms desde su inicio · ${absolute} s del registro · ${f > .01 ? "contracción ilustrativa" : "reposo del esquema"}`;
      q<HTMLInputElement>("#echo-time").value = String(Math.round(elapsed / cycle.rr * 1000));
      const cursor = root.querySelector<SVGLineElement>("[data-echo-cursor]");
      cursor?.setAttribute("x1", String(20 + elapsed / cycle.rr * 560)); cursor?.setAttribute("x2", String(20 + elapsed / cycle.rr * 560));
    } else q("[data-echo-time]").textContent = "Sin ciclo completo disponible para sincronizar.";
  }
  function selection() {
    q<HTMLSelectElement>("#echo-segment").value = String(selected);
    q<HTMLSelectElement>("#echo-motion").value = motion[selected];
    const segment = ECHO_SEGMENTS[selected - 1];
    q("[data-echo-related]").innerHTML = reversed ? `<p>Electrodos de brazos intercambiados: asociaciones entre derivaciones y anatomía desactivadas.</p>` : `<p>Derivaciones relacionadas de forma orientativa con ${esc(segment.name.toLowerCase())}:</p><div class="echo-related-leads">${segment.leads.map(l => `<button type="button" class="btn" data-echo-lead="${l}" aria-pressed="${lead === l}">${l}</button>`).join("")}</div>`;
    q("[data-echo-anatomy]").innerHTML = teachingAnatomySvg(angle, selected, relatedIds(), new Set(scenario.affected), motion);
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-echo-view]")) button.setAttribute("aria-pressed", String(button.dataset.echoView === view));
    updateFrame();
  }
  function availability() {
    const ok = available();
    q(".echo-status").textContent = !scenario.available ? scenario.reason : !cycle ? "No hay un ciclo sinusal completo en esta selección. La reproducción y la variación están desactivadas." : `${scenario.name}. ${scenario.reason}`;
    root.dataset.echoAvailable = String(ok);
    for (const el of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("[data-echo-play], [data-echo-step], #echo-time, #echo-speed, #echo-motion, [data-echo-reset]")) el.disabled = !ok;
    q(".echo-main").hidden = !ok;
    q(".echo-selection").hidden = !ok;
    q("[data-echo-strip]").hidden = !ok;
  }
  function pause() {
    playing = false; last = 0; cancelAnimationFrame(raf); raf = 0;
    const play = q<HTMLButtonElement>("[data-echo-play]"); play.textContent = "Reproducir"; play.setAttribute("aria-pressed", "false");
  }
  function animate(now: number) {
    if (!playing || destroyed || !cycle || !available()) return;
    if (last) elapsed = (elapsed + Math.min((now - last) / 1000, .1) * speed) % cycle.rr;
    last = now; updateFrame(); emitTime(); raf = requestAnimationFrame(animate);
  }
  function chooseSegment(id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 16) return;
    selected = id;
    if (!ECHO_VIEWS[view].segments.includes(id)) view = (Object.keys(ECHO_VIEWS) as EchoView[]).find(v => ECHO_VIEWS[v].segments.includes(id))!;
    selection();
  }
  root.addEventListener("click", event => {
    const target = (event.target as Element).closest<HTMLElement>("button, [data-echo-segment]"); if (!target || !root.contains(target)) return;
    if (target.dataset.echoView) { view = target.dataset.echoView as EchoView; selection(); }
    if (target.hasAttribute("data-echo-play") && available()) {
      if (playing) pause(); else { playing = true; last = 0; target.textContent = "Pausar"; target.setAttribute("aria-pressed", "true"); raf = requestAnimationFrame(animate); }
    }
    if (target.dataset.echoStep && available()) { pause(); elapsed = Math.max(0, Math.min(cycle!.rr, elapsed + Number(target.dataset.echoStep) * .02)); updateFrame(); emitTime(); }
    if (target.dataset.echoAngle) { angle = Number(target.dataset.echoAngle); q<HTMLInputElement>("#echo-rotation").value = String(angle); selection(); }
    if (target.dataset.echoLead && !reversed) { lead = target.dataset.echoLead as Lead; strip(); selection(); options.onLeadChange(lead); }
    if (target.dataset.echoSegment) chooseSegment(Number(target.dataset.echoSegment));
    if (target.hasAttribute("data-echo-reset") && available()) { Object.assign(motion, scenario.motion); selection(); }
  }, signalOption);
  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    if (target.id === "echo-time" && available()) { pause(); elapsed = Number(target.value) / 1000 * cycle!.rr; updateFrame(); emitTime(); }
    if (target.id === "echo-rotation") { angle = Number(target.value); selection(); }
  }, signalOption);
  root.addEventListener("change", event => {
    const target = event.target as HTMLSelectElement;
    if (target.id === "echo-speed") speed = Number(target.value);
    if (target.id === "echo-segment") chooseSegment(Number(target.value));
    if (target.id === "echo-motion" && available() && target.value in MOTION_NAMES) { motion[selected] = target.value as WallMotion; selection(); }
  }, signalOption);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); }, signalOption);
  reduced.addEventListener("change", () => { if (reduced.matches) pause(); }, signalOption);
  // Explicit play is always required, including when reduced motion is requested.
  availability(); strip(); chooseSegment(selected);
  return {
    setSelection(nextLead, nextBeat) {
      if (destroyed) return;
      pause(); lead = nextLead; beatIndex = nextBeat; cycle = teachingEchoCycle(signal, beatIndex); elapsed = 0;
      if (!reversed) selected = ECHO_SEGMENTS.find(s => s.leads.includes(lead))?.id ?? selected;
      availability(); strip(); chooseSegment(selected);
    },
    setCursorTime(time) {
      if (destroyed || !available() || !cycle || !Number.isFinite(time)) return;
      pause(); elapsed = Math.max(0, Math.min(cycle.rr, time - cycle.start)); updateFrame();
      // Parent drove this time; do not emit it back and create a feedback loop.
    },
    destroy() { if (destroyed) return; pause(); destroyed = true; controller.abort(); },
  };
}

