import {secondaryRepolarization,secondarySTEnvelope} from './secondary-repolarization';
import { torsadesFrame } from './torsades-frame';
import { ventricularSource } from "./ventricular-source";
import { PRECORDIAL_LEADS } from "./lead-registry";
import {
  constraints,
  type Beat,
  type ECGCase,
  type Signal,
  type Lead,
} from "./types";
import { generateEvents } from "./rhythm";
import {
  DOWER,
  INDEPENDENT,
  project,
  frontal,
  makeArrays,
  type Vec,
} from "./leads";
import {
  qrsKernels,
  qrsKernelValue,
  qrsAmplitudeScale,
  qrsDuration,
  WPW_DELTA_SECONDS,
  wpwDeltaVector,
  lesionVector,
  lesionControlEffect,
  tVector,
  T_REFERENCE_AMPLITUDE,
  bump,
  gaussian,
  compact,
} from "./morphology";
import { random, normal } from "./random";
import { applyAcquisitionFilter, biquad, antialias } from "./filter";
import { assignRepolarization } from "./repolarization";
import { assertRepresentableEvents, tWaveSupport } from "./constraints";
import { median } from "./analysis/statistics";
import { atrialVector, tWave } from "./morphology";
import { regionalTerritory, regionalTCorrection } from "./regional-repolarization";
import { learnEctopicDurations, naturalTAxis, RealisticTrack, usesRealisticBase } from "./realistic/engine";
import { learnedEctopicModel } from "./realistic/scope";
import { acquisitionFloor } from "./realistic/acquisition";
import { addFibrillationWaves } from "./realistic/atrial-fibrillation";
import { addFlutterWaves } from "./realistic/atrial-flutter";
const FS = 1000,
  OUT = 500,
  WARM = 4,
  GUARD = 0.1;
export interface SynthesisOptions {
  /** Temporary seam while modifiers migrate stage by stage (docs/fidelidad.md):
   * false keeps the historical kernels so a test can isolate a not-yet-migrated
   * modifier against a basal case of the same model. The product never sets it. */
  learnedBase?: boolean;
}
export function synthesize(c: ECGCase, duration = 65, options: SynthesisOptions = {}): Signal {
  duration = Math.max(10, Math.min(120, duration));
  const total = duration + WARM,
    guard = c.filter === "monitor" ? 4 : GUARD,
    n = Math.ceil((total + guard) * FS),
    events = generateEvents(c, total + guard);
  assignRepolarization(c, events.beats);
  if (options.learnedBase !== false && usesRealisticBase(c))
    learnEctopicDurations(c, events.beats, (["pvc", "paced"] as const).filter((k) => learnedEctopicModel(c, k)));
  assertRepresentableEvents(c, events);
  const xyz = [new Float64Array(n), new Float64Array(n), new Float64Array(n)],
    corr: Partial<Record<Lead, Float64Array>> = {};
  const add = (
    start: number,
    length: number,
    fn: (u: number, t: number) => Vec,
  ) => {
    const lo = Math.max(0, Math.floor(start * FS)),
      hi = Math.min(n, Math.ceil((start + length) * FS));
    for (let i = lo; i < hi; i++) {
      const v = fn((i / FS - start) / length, i / FS);
      xyz[0][i] += v[0];
      xyz[1][i] += v[1];
      xyz[2][i] += v[2];
    }
  };
  const local = (
    lead: Lead,
    start: number,
    len: number,
    amp: number,
    fn: (u: number) => number = bump,
  ) => {
    const arr = corr[lead] ?? (corr[lead] = new Float64Array(n));
    for (
      let i = Math.max(0, Math.floor(start * FS));
      i < Math.min(n, Math.ceil((start + len) * FS));
      i++
    )
      arr[i] += amp * fn((i / FS - start) / len);
  };
  const scale = (v: Vec, a: number): Vec => [v[0] * a, v[1] * a, v[2] * a];
  // Learned beat shapes (docs/fidelidad.md) where the case is representable on them.
  const track = options.learnedBase !== false && usesRealisticBase(c) ? new RealisticTrack(c, n, FS) : null;
  track?.prepare(events.beats);
  for (const a of events.atria) {
    if (track && a.kind === "sinus") {
      track.addAtrial(a);
      continue;
    }
    const len = a.kind === "ectopic" ? 0.075 : 0.095,
      v = frontal(
        a.kind === "retrograde" ? -100 : a.kind === "ectopic" ? 20 : c.pAxis,
        c.pAmp,
        // The entire ectopic/retrograde vector shares the P amplitude control.
        -0.018 * (c.pAmp / 0.15),
      );
    add(a.time, len, (u) =>
      a.kind === "sinus" ? atrialVector(c, u) : scale(v, bump(u)),
    );
  }
  for (const b of events.beats) {
    if (track && b.kind === "normal") {
      track.addBeat(b, qrsDuration(c, b));
      continue;
    }
    if (track && (b.kind === "pvc" || b.kind === "paced") && learnedEctopicModel(c, b.kind)) {
      track.addEctopic(b as Beat & { kind: "pvc" | "paced" });
      continue;
    }
    const dur = qrsDuration(c, b),
      ks = qrsKernels(c, b),
      qt = b.qt!,
      tors = c.rhythm === "torsades";
    add(b.time, dur, (u, t) => {
      let v: Vec = [0, 0, 0];
      for (const k of ks) {
        const g = qrsKernelValue(k, u);
        for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
      }
      if (tors) v = torsadesFrame(v, t, c.hr);
      return v;
    });
    if (c.conduction === "wpw" && b.kind === "normal")
      add(b.time, WPW_DELTA_SECONDS, (u) => wpwDeltaVector(c, u));
    const tSupport = tWaveSupport(c, dur, qt),
      tLen = tSupport.duration,
      // Preserve the original arithmetic order of absolute sample placement.
      tStart = b.time + qt - tLen,
      tv = tVector(c, b, ks),
      lv = lesionVector(c);
    add(b.time + dur - 0.012, qt - dur + 0.012, (u) => {
      const envelope = Math.min(
        1,
        u / Math.min(0.3, 0.012 / (qt - dur + 0.012)),
        (1 - u) / 0.38,
      );
      let shape = 1;
      if (c.stShape === "concave") shape = 0.7 + 0.6 * u * u;
      if (c.stShape === "convex") shape = 1 + 0.3 * Math.sin(Math.PI * u);
      return scale(lv, Math.max(0, envelope) * shape);
    });
    const secondaryST=secondaryRepolarization(c,b,ks).st;
    if(secondaryST){
      const j=b.time+dur, start=j-.040, end=tStart+tLen*.5;
      add(start,end-start,(_u,t)=>{
        const envelope=secondarySTEnvelope(t,j,tStart,tLen);
        return scale(tors?torsadesFrame(secondaryST,t,c.hr):secondaryST,envelope);
      });
    }
    add(tStart, tLen, (u, t) =>
      scale(tors ? torsadesFrame(tv, t, c.hr) : tv, tWave(u, c.electrolyte === "hyperkalemia")),
    );
    if (regionalTerritory(c, b) && (c.phase === "hyperacute" || c.phase === "evolving") && c.st > 0 && c.tAmp > 0) {
      const basal = project(tv);
      for (const lead of INDEPENDENT)
        local(lead, tStart, tLen, 1, (u) => regionalTCorrection(c, b, lead, u, basal[lead], tWave(u)));
    }
    if (c.electrolyte === "hypokalemia")
      add(b.time + qt + 0.035, 0.16, (u) =>
        scale(frontal(40, 0.17, -0.06), bump(u)),
      );
    // Local precordial corrections preserve all limb-lead identities. These are explicitly approximate patterns.
    // Intensity zero and the resolved-ST phase restore basal repolarization;
    // tAmp scales every T component, including these regional corrections.
    const lesionScale = lesionControlEffect(c) === "none" ? 0 : c.st / 2,
      regionalTScale = lesionScale * (c.tAmp / T_REFERENCE_AMPLITUDE);
    if (
      lesionScale > 0 &&
      (c.ischemia === "wellens_a" || c.ischemia === "wellens_b")
    )
      for (const l of ["V2", "V3"] as Lead[]) {
        const projected = project(tv)[l];
        local(l, tStart, tLen, -projected * lesionScale, (u) =>
          tWave(u, c.electrolyte === "hyperkalemia"),
        );
        if (c.ischemia === "wellens_b")
          local(l, tStart, tLen, -0.6 * regionalTScale);
        else {
          local(l, tStart, tLen * 0.5, 0.23 * regionalTScale);
          local(l, tStart + tLen * 0.38, tLen * 0.62, -0.46 * regionalTScale);
        }
      }
    if (lesionScale > 0 && c.ischemia === "de_winter")
      for (const l of PRECORDIAL_LEADS) {
        local(
          l,
          b.time + dur - 0.012,
          Math.max(0.072, tStart - b.time - dur + 0.012),
          -0.16 * lesionScale,
          (u) =>
            Math.max(0, 1 - u) *
            Math.min(
              1,
              u / (0.012 / Math.max(0.072, tStart - b.time - dur + 0.012)),
            ),
        );
        local(l, tStart, tLen, 0.48 * regionalTScale);
      }
    if (c.ischemia === "posterior")
      for (const l of ["V1", "V2", "V3"] as Lead[])
        local(
          l,
          b.time,
          dur,
          // Apply the same gain and low-voltage attenuation as the QRS vector.
          0.75 * qrsAmplitudeScale(c),
          (u) => gaussian(u, 0.47, 0.14) * compact(u),
        );
    if (c.ischemia === "pericarditis" && b.pr) {
      const v = frontal(50, -0.055, 0.025);
      add(b.time - b.pr + 0.085, Math.max(0.03, b.pr - 0.085), (u) =>
        scale(v, Math.min(1, u / 0.12, (1 - u) / 0.12)),
      );
    }
  }
  // Learned f waves (F5.1) go straight to the eight independent leads.
  // The true QRS axis is the ventricular component's: measured before the f waves.
  const learnedAxis = track && events.beats.some((b) => b.kind === "normal")
    ? track.measuredQrsAxis(events.beats.filter((b) => b.time >= WARM && b.time < total))
    : null;
  if (track && c.rhythm === "af") addFibrillationWaves(track.acc, FS, c.seed);
  else if (track && c.rhythm === "flutter" && events.beats.length)
    // The learned phase refers to the QRS energy peak (≈ its middle), not its onset.
    addFlutterWaves(track.acc, FS, c.seed, c.atrialRate, events.beats[0].time + qrsDuration(c, events.beats[0]) / 2);
  else if (c.rhythm === "af" || c.rhythm === "flutter" || c.rhythm === "vf") {
    const r = random(c.seed + 11);
    let phase = 0,
      noise = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      let v: Vec;
      if (c.rhythm === "af") {
        noise = 0.96 * noise + 0.04 * normal(r);
        phase += (2 * Math.PI * (7.2 + 2.2 * noise)) / FS;
        v = frontal(
          75,
          0.038 * (Math.sin(phase) + 0.5 * Math.sin(phase * 1.67 + 0.3)),
          -0.018 * Math.sin(phase * 1.13),
        );
      } else if (c.rhythm === "flutter") {
        const u = ((t * c.atrialRate) / 60) % 1;
        const f = u < 0.75 ? u / 0.75 : 1 - (u - 0.75) / 0.25;
        v = frontal(-85, 0.19 * (f - 0.5), -0.11 * (f - 0.5));
      } else {
        noise = 0.97 * noise + 0.03 * normal(r);
        const amp = 0.7 + 0.17 * Math.sin(t * 0.7);
        v = [
          amp *
            (Math.sin(t * 2 * Math.PI * 4.7 + Math.sin(t * 3)) +
              0.3 * Math.sin(t * 2 * Math.PI * 7.9)) +
            0.3 * noise,
          0.5 * Math.sin(t * 2 * Math.PI * 4.1 + Math.sin(t * 2.3)),
          0.35 * Math.sin(t * 2 * Math.PI * 6.3 + Math.cos(t * 1.7)),
        ];
      }
      for (let j = 0; j < 3; j++) xyz[j][i] += v[j];
    }
  }
  // On the learned base the ventricular spike is the recorded one (F5.4). Atrial
  // spikes keep the kernels' (no atrial spike data: borrowing the ventricular size
  // made the frozen analyzer count them as beats in most AAI/DDD patients).
  const ventricularSpike = (t: number) =>
    c.pacing === "VVI" || (c.pacing === "DDD" && events.beats.some((b) => b.kind === "paced" && Math.abs(b.time - 0.005 - t) < 1e-6));
  for (const t of events.spikes)
    if (track && c.rhythm === "paced" && ventricularSpike(t)) track.addSpike(t);
    else add(t, 0.004, (u) => scale(frontal(65, 1.9, -0.8), u < 0.5 ? 1 : -0.22));
  const output = makeArrays(Math.floor(duration * OUT));
  const floor = acquisitionFloor(c, n, FS);
  for (let lindex = 0; lindex < INDEPENDENT.length; lindex++) {
    const l = INDEPENDENT[lindex],
      row = DOWER[l],
      arr = new Float64Array(n),
      r = random(c.seed + 777 + lindex),
      ca = corr[l];
    let muscle = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      // This RNG is private to this lead and only feeds the muscle artifact.
      // At exactly zero amplitude no variate can affect any emitted sample.
      if (c.artifacts.muscle !== 0) muscle = 0.3 * muscle + 0.7 * normal(r);
      arr[i] =
        xyz[0][i] * row[0] +
        xyz[1][i] * row[1] +
        xyz[2][i] * row[2] +
        (ca?.[i] || 0) +
        (track ? track.acc[lindex][i] : 0) +
        (floor ? floor[lindex][i] : 0) +
        c.artifacts.baseline *
          0.3 *
          Math.sin(
            ((2 * Math.PI * c.respiratoryRate) / 60) * t + lindex * 0.18,
          ) +
        c.artifacts.muscle * 0.12 * muscle +
        c.artifacts.mains *
          0.08 *
          Math.sin(2 * Math.PI * c.mainsFrequency * t + lindex * 0.23);
      if (l === "V2")
        arr[i] +=
          c.artifacts.loose *
          (0.48 * Math.sin(t * 0.7) +
            0.23 * Math.sin(t * 8) * Math.max(0, Math.sin(t * 1.4)));
    }
    applyAcquisitionFilter(arr, FS, c.filter);
    if (c.notch) biquad(arr, FS, c.notch, "notch", 25);
    const filtered = antialias(arr, FS);
    // A realistic recorder quantizes (1 µV, as PTB-XL's 1000 counts/mV); the
    // ideal acquisition keeps exact model arithmetic.
    const quantize = floor !== null;
    for (let i = 0; i < output[l].length; i++) {
      const v = filtered[Math.round(WARM * FS) + i * 2];
      output[l][i] = quantize ? Math.round(v * 1000) / 1000 : v;
    }
  }
  for (let i = 0; i < output.I.length; i++) {
    const a = output.I[i],
      b = output.II[i];
    output.III[i] = b - a;
    output.aVR[i] = -(a + b) / 2;
    output.aVL[i] = a - b / 2;
    output.aVF[i] = b - a / 2;
    // A recorder stores every lead at its own 1 µV resolution.
    if (floor) for (const lead of ["III", "aVR", "aVL", "aVF"] as const) output[lead][i] = Math.round(output[lead][i] * 1000) / 1000;
  }
  if (c.artifacts.reversed) {
    const i = output.I,
      ii = output.II,
      iii = output.III,
      avr = output.aVR,
      avl = output.aVL;
    output.I = Float64Array.from(i, (x) => -x);
    output.II = iii;
    output.III = ii;
    output.aVR = avl;
    output.aVL = avr;
  }
  const visible = {
    atria: events.atria
      .filter((a) => a.time >= WARM && a.time < total)
      .map((a) => ({ ...a, time: a.time - WARM })),
    beats: events.beats
      .filter((b) => b.time >= WARM && b.time < total)
      .map((b) => ({ ...b, time: b.time - WARM })),
    spikes: events.spikes
      .filter((t) => t >= WARM && t < total)
      .map((t) => t - WARM),
  };
  const bs = visible.beats;
  const meanRR =
    bs.length > 1
      ? (bs[bs.length - 1].time - bs[0].time) / (bs.length - 1)
      : 60 / c.hr;
  const hasPR =
    (c.rhythm === "sinus" && c.av !== "complete") ||
    (c.rhythm === "paced" && c.pacing !== "VVI");
  const widths = bs.map((b) => (b.qrs ?? qrsDuration(c, b)) * 1000).sort((a, b) => a - b);
  const allV = bs.length > 0 && bs.every((b) => b.kind !== "normal");
  return {
    fs: OUT,
    duration,
    leads: output,
    events: visible,
    // Keep the original visible calendar and truth unchanged. The leading tail
    // was generated during warm-up and is physically present in output samples.
    leadingQrs: events.beats
      .filter((b) => b.time < WARM && b.time + (b.qrs ?? 0) > WARM)
      .map((b) => ({ ...b, time: b.time - WARM })),
    truth: {
      hr: bs.length > 1 ? 60 / meanRR : 0,
      pr: hasPR && c.av !== "mobitz1" ? c.pr : null,
      qrs: bs.length ? widths[Math.floor(widths.length / 2)] : null,
      qt: bs.length ? median(bs.map((b) => b.qt! * 1000)) : null,
      axis: bs.length
        ? track && bs.some((b) => b.kind === "normal")
          ? learnedAxis
          : c.rhythm === "torsades"
          ? null
          : allV
            ? ventricularSource(c, bs[0])!.axis
            : c.axis
        : null,
      ...(track && c.naturalPAxis !== false ? { pAxis: track.patient.achievedAxes.p } : {}),
      ...(track && naturalTAxis(c) ? { tAxis: track.patient.achievedAxes.t } : {}),
    },
    warnings: constraints(c),
  };
}
