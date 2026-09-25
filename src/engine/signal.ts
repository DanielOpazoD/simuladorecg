import { PRECORDIAL_LEADS } from "./lead-registry";
import {
  LEADS,
  constraints,
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
  qrsDuration,
  lesionVector,
  lesionControlEffect,
  tVector,
  T_REFERENCE_AMPLITUDE,
  bump,
  gaussian,
  compact,
} from "./morphology";
import { random, normal } from "./random";
import { highpass, biquad, antialias } from "./filter";
import { assignRepolarization } from "./repolarization";
import { assertRepresentableEvents, tWaveSupport } from "./constraints";
import { median } from "./analysis/statistics";
import { atrialVector, tWave } from "./morphology";
import { regionalTerritory, regionalTCorrection } from "./regional-repolarization";
const FS = 1000,
  OUT = 500,
  WARM = 4,
  GUARD = 0.1;
export function synthesize(c: ECGCase, duration = 65): Signal {
  duration = Math.max(10, Math.min(120, duration));
  const total = duration + WARM,
    n = Math.ceil((total + GUARD) * FS),
    events = generateEvents(c, total + GUARD);
  assignRepolarization(c, events.beats);
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
  for (const a of events.atria) {
    const len = a.kind === "ectopic" ? 0.075 : 0.095,
      v = frontal(
        a.kind === "retrograde" ? -100 : a.kind === "ectopic" ? 20 : c.pAxis,
        c.pAmp,
        -0.018,
      );
    add(a.time, len, (u) =>
      a.kind === "sinus" ? atrialVector(c, u) : scale(v, bump(u)),
    );
  }
  for (const b of events.beats) {
    const dur = qrsDuration(c, b),
      ks = qrsKernels(c, b),
      qt = b.qt!,
      tors = c.rhythm === "torsades";
    add(b.time, dur, (u, t) => {
      let v: Vec = [0, 0, 0];
      for (const k of ks) {
        const g = gaussian(u, k.mu, k.sigma) * compact(u);
        for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
      }
      if (tors) {
        const phase = (2 * Math.PI * t) / ((60 / c.hr) * 12),
          x = v[0],
          z = v[2],
          envelope = 0.55 + (0.65 * (1 + Math.sin(phase))) / 2;
        v = [
          (x * Math.cos(phase) - z * Math.sin(phase)) * envelope,
          v[1] * Math.cos(phase),
          x * Math.sin(phase) + z * Math.cos(phase),
        ];
      }
      return v;
    });
    if (c.conduction === "wpw" && b.kind === "normal")
      add(b.time, 0.045, (u) =>
        scale(frontal(c.axis, 0.25, 0.03), Math.sin(Math.PI * u)),
      );
    const tSupport = tWaveSupport(c, dur, qt),
      tLen = tSupport.duration,
      // Preserve the original arithmetic order of absolute sample placement.
      tStart = b.time + qt - tLen,
      tv = tVector(c, b),
      lv = lesionVector(c);
    if (c.conduction === "lbbb" || b.kind !== "normal") {
      const q = project(
        ks.reduce((acc, k) => acc.map((v, j) => v + k.v[j] * k.sigma) as Vec, [
          0, 0, 0,
        ] as Vec),
      );
      const s = frontal(
        (b.kind !== "normal" ? -65 : c.axis) + 180,
        Math.min(0.1, Math.abs(q.I) * 0.3),
        -0.035,
      );
      for (let j = 0; j < 3; j++) lv[j] += s[j];
    }
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
    add(tStart, tLen, (u) =>
      scale(tv, tWave(u, c.electrolyte === "hyperkalemia")),
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
          0.75,
          (u) => gaussian(u, 0.47, 0.14) * compact(u),
        );
    if (c.ischemia === "pericarditis" && b.pr) {
      const v = frontal(50, -0.055, 0.025);
      add(b.time - b.pr + 0.085, Math.max(0.03, b.pr - 0.085), (u) =>
        scale(v, Math.min(1, u / 0.12, (1 - u) / 0.12)),
      );
    }
  }
  if (c.rhythm === "af" || c.rhythm === "flutter" || c.rhythm === "vf") {
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
  for (const t of events.spikes)
    add(t, 0.004, (u) => scale(frontal(65, 1.9, -0.8), u < 0.5 ? 1 : -0.22));
  const output = makeArrays(Math.floor(duration * OUT));
  for (let lindex = 0; lindex < INDEPENDENT.length; lindex++) {
    const l = INDEPENDENT[lindex],
      row = DOWER[l],
      arr = new Float64Array(n),
      r = random(c.seed + 777 + lindex),
      ca = corr[l];
    let muscle = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      muscle = 0.3 * muscle + 0.7 * normal(r);
      arr[i] =
        xyz[0][i] * row[0] +
        xyz[1][i] * row[1] +
        xyz[2][i] * row[2] +
        (ca?.[i] || 0) +
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
    if (c.filter !== "off")
      highpass(
        arr,
        FS,
        c.filter === "diagnostic" ? 0.05 : c.filter === "monitor" ? 0.5 : 2,
      );
    if (c.filter === "monitor" || c.filter === "aggressive")
      biquad(arr, FS, 40, "lowpass");
    if (c.notch) biquad(arr, FS, c.notch, "notch", 25);
    const filtered = antialias(arr, FS);
    for (let i = 0; i < output[l].length; i++)
      output[l][i] = filtered[Math.round(WARM * FS) + i * 2];
  }
  for (let i = 0; i < output.I.length; i++) {
    const a = output.I[i],
      b = output.II[i];
    output.III[i] = b - a;
    output.aVR[i] = -(a + b) / 2;
    output.aVL[i] = a - b / 2;
    output.aVF[i] = b - a / 2;
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
  const widths = bs.map((b) => qrsDuration(c, b) * 1000).sort((a, b) => a - b);
  const allV = bs.length > 0 && bs.every((b) => b.kind !== "normal");
  return {
    fs: OUT,
    duration,
    leads: output,
    events: visible,
    truth: {
      hr: bs.length > 1 ? 60 / meanRR : 0,
      pr: hasPR && c.av !== "mobitz1" ? c.pr : null,
      qrs: bs.length ? widths[Math.floor(widths.length / 2)] : null,
      qt: bs.length ? median(bs.map((b) => b.qt! * 1000)) : null,
      axis: bs.length ? (allV ? -65 : c.axis) : null,
    },
    warnings: constraints(c),
  };
}
