// src/engine/types.ts
var LEADS = [
  "I",
  "II",
  "III",
  "aVR",
  "aVL",
  "aVF",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6"
];
var DEFAULT_CASE = {
  version: 1,
  presetId: "sinus",
  name: "Ritmo sinusal",
  seed: 2026,
  rhythm: "sinus",
  av: "normal",
  conduction: "normal",
  ischemia: "none",
  overload: "none",
  hr: 72,
  atrialRate: 80,
  variability: 0.012,
  respiratoryRate: 14,
  pr: 160,
  qrs: 90,
  qtc: 410,
  axis: 55,
  pAxis: 55,
  tAxis: 40,
  pAmp: 0.15,
  qrsAmp: 1,
  tAmp: 0.28,
  transition: 0,
  septalQ: true,
  ectopy: "none",
  coupling: 0.58,
  flutterRatio: 2,
  escape: "junctional",
  pacing: "DDD",
  st: 2,
  phase: "acute",
  stShape: "plateau",
  electrolyte: "none",
  artifacts: { baseline: 0, muscle: 0, mains: 0, loose: 0, reversed: false },
  filter: "diagnostic",
  notch: 0,
  mainsFrequency: 50,
  view: {
    mode: "paper",
    format: "3x4+1",
    speed: 25,
    gain: 10,
    chestGain: 10,
    lead: "II",
    grid: true,
    palette: "paper",
    pxPerMm: 96 / 25.4,
    fit: true,
    cabrera: false,
    duration: 30,
    timing: "sequential"
  }
};
function cloneCase(c) {
  return JSON.parse(JSON.stringify(c));
}
function constraints(c) {
  const out = [];
  if (c.rhythm !== "sinus" && c.av !== "normal")
    out.push(
      "Los bloqueos AV seleccionables requieren actividad sinusal; se utiliza conducci\xF3n propia del ritmo."
    );
  if (c.rhythm !== "sinus" && c.ectopy !== "none")
    out.push("La ectopia programada solo se aplica al ritmo sinusal.");
  if (c.filter === "monitor" || c.filter === "aggressive")
    out.push(
      "Este filtro modifica el ST y la amplitud. Utiliza Diagn\xF3stico para evaluar repolarizaci\xF3n."
    );
  if (c.conduction === "wpw")
    out.push(
      "Preexcitaci\xF3n aproximada; la localizaci\xF3n de la v\xEDa accesoria no est\xE1 modelada."
    );
  if (c.av === "first" && c.pr <= 200)
    out.push("PR \u2264200 ms: el caso ajustado ya no cumple BAV de primer grado.");
  if ((c.conduction === "rbbb" || c.conduction === "lbbb" || c.conduction.startsWith("rbbb_")) && c.qrs < 120)
    out.push(
      "QRS <120 ms: el caso ajustado no cumple bloqueo completo de rama."
    );
  if (c.conduction === "irbbb" && (c.qrs < 110 || c.qrs >= 120))
    out.push(
      "El BRD incompleto adulto requiere QRS de 110\u2013119 ms; revisa el ajuste."
    );
  if (c.av === "mobitz1")
    out.push(
      "PR variable por ciclo. Comprueba cada intervalo con calibres; el PR de base no resume todos los latidos."
    );
  if (c.av === "complete" && c.rhythm === "sinus")
    out.push(
      "FC controla el escape; la frecuencia auricular se ajusta por separado."
    );
  if (c.ischemia !== "none" && (c.conduction === "lbbb" || c.conduction.includes("rbbb")) && c.ischemia !== "sgarbossa")
    out.push(
      "La lesi\xF3n se suma a los cambios secundarios de conducci\xF3n; requiere interpretaci\xF3n contextual."
    );
  return out;
}

// src/engine/random.ts
function random(seed) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function normal(r) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

// src/engine/rhythm.ts
function generateEvents(c, duration) {
  const r = random(c.seed), events = { atria: [], beats: [], spikes: [] };
  const base = 60 / c.hr;
  let prev = -10;
  const beat = (time, kind = "normal", pr) => {
    if (time < duration) {
      events.beats.push({ time, kind, rr: prev > -5 ? time - prev : base, pr });
      prev = time;
    }
  };
  const p2 = (time, conducted = true, pr, kind = "sinus") => events.atria.push({ time, conducted, pr, kind });
  if (c.rhythm === "vf" || c.rhythm === "asystole") return events;
  if (c.rhythm === "af") {
    let t2 = 0.35;
    while (t2 < duration) {
      beat(t2);
      t2 += base * Math.max(
        0.38,
        Math.min(
          2.15,
          0.8 + Math.exp(0.42 * normal(r)) * 0.2 + 0.38 * normal(r)
        )
      );
    }
    return events;
  }
  if (c.rhythm === "flutter") {
    const ar = c.atrialRate, rr = 60 / ar * c.flutterRatio;
    for (let t2 = 0.4; t2 < duration; t2 += rr) beat(t2);
    return events;
  }
  if (c.rhythm === "idioventricular" || c.rhythm === "vt" || c.rhythm === "torsades") {
    for (let t2 = 0.45; t2 < duration; t2 += base) beat(t2, "ventricular");
    if (c.rhythm === "vt")
      for (let t2 = 0.15; t2 < duration; t2 += 60 / c.atrialRate) p2(t2, false);
    return events;
  }
  if (c.rhythm === "junctional") {
    for (let t2 = 0.45; t2 < duration; t2 += base) {
      beat(t2);
      p2(t2 + 0.075, false, void 0, "retrograde");
    }
    return events;
  }
  if (c.rhythm === "paced") {
    for (let t2 = 0.45; t2 < duration; t2 += base) {
      if (c.pacing === "AAI") {
        events.spikes.push(t2);
        p2(t2 + 7e-3, true, c.pr / 1e3);
        beat(t2 + 7e-3 + c.pr / 1e3, "normal", c.pr / 1e3);
      } else if (c.pacing === "VVI") {
        events.spikes.push(t2);
        beat(t2 + 5e-3, "paced");
      } else {
        events.spikes.push(t2);
        p2(t2 + 7e-3, true, c.pr / 1e3);
        events.spikes.push(t2 + 7e-3 + c.pr / 1e3 - 5e-3);
        beat(t2 + 7e-3 + c.pr / 1e3, "paced", c.pr / 1e3);
      }
    }
    return events;
  }
  if (c.av === "complete") {
    for (let t2 = 0.15; t2 < duration; t2 += 60 / c.atrialRate) p2(t2, false);
    for (let t2 = 0.53; t2 < duration; t2 += base)
      beat(t2, c.escape === "ventricular" ? "ventricular" : "normal");
    return events;
  }
  let t = 0.22, k = 0;
  while (t < duration) {
    const respiratory = -Math.sin(2 * Math.PI * c.respiratoryRate / 60 * t), slow = Math.sin(2 * Math.PI * 0.1 * t + 0.3);
    const rr = base * (1 + c.variability * (0.8 * respiratory + 0.2 * slow + 0.1 * normal(r)));
    let pr = c.pr / 1e3, conducted = true;
    if (c.av === "mobitz1") {
      const phase = k % 4;
      conducted = phase !== 3;
      pr += [0, 0.08, 0.12, 0][phase];
    }
    if (c.av === "mobitz2") conducted = k % 4 !== 3;
    if (c.av === "two_one") conducted = k % 2 === 0;
    if (c.av === "high") conducted = k % 3 === 0;
    p2(t, conducted, conducted ? pr : void 0);
    if (conducted) beat(t + pr, "normal", pr);
    const ect = c.ectopy, trigger = conducted && c.av === "normal" && (ect === "bigeminy" || ect === "trigeminy" && k % 2 === 1 || (ect === "pvc" || ect === "pac" || ect === "couplet") && k % 5 === 3);
    if (trigger) {
      const coupling = base * c.coupling;
      if (ect === "pac") {
        const early = t + coupling;
        p2(early, true, pr * 0.9, "ectopic");
        beat(early + pr * 0.9, "normal", pr * 0.9);
        t = early + rr;
      } else {
        beat(t + pr + coupling, "pvc");
        let lastV = t + pr + coupling;
        if (ect === "couplet") {
          lastV += Math.max(0.22, Math.min(0.34, base * 0.65));
          beat(lastV, "pvc");
        }
        let next = t + base;
        p2(next, false);
        next += base;
        while (next + pr - lastV < 0.24) {
          p2(next, false);
          next += base;
        }
        t = next;
      }
    } else t += rr;
    k++;
  }
  return events;
}

// src/engine/leads.ts
var DOWER = {
  I: [0.632, -0.235, 0.059],
  II: [0.235, 1.066, -0.132],
  V1: [-0.515, 0.157, -0.917],
  V2: [0.044, 0.164, -1.387],
  V3: [0.882, 0.098, -1.277],
  V4: [1.213, 0.127, -0.601],
  V5: [1.125, 0.127, -0.086],
  V6: [0.831, 0.076, 0.23]
};
var INDEPENDENT = [
  "I",
  "II",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6"
];
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function project(v) {
  const out = {};
  for (const l of INDEPENDENT) out[l] = dot(DOWER[l], v);
  return derive(out);
}
function derive(o) {
  o.III = o.II - o.I;
  o.aVR = -(o.I + o.II) / 2;
  o.aVL = o.I - o.II / 2;
  o.aVF = o.II - o.I / 2;
  return o;
}
function frontal(axis, amp, z = 0) {
  const a = axis * Math.PI / 180;
  const i = amp * Math.cos(a) - 0.059 * z;
  const ii = amp * Math.cos(a - Math.PI / 3) + 0.132 * z;
  const det = 0.632 * 1.066 + 0.235 * 0.235;
  return [(i * 1.066 + 0.235 * ii) / det, (0.632 * ii - 0.235 * i) / det, z];
}
function axisFromLeads(i, ii) {
  return Math.atan2((2 * ii - i) / Math.sqrt(3), i) * 180 / Math.PI;
}
function makeArrays(n) {
  return Object.fromEntries(
    LEADS.map((l) => [l, new Float64Array(n)])
  );
}

// src/engine/morphology.ts
var normal2 = [
  { mu: 0.12, sigma: 0.052, v: [-0.12, -0.04, -0.11] },
  { mu: 0.28, sigma: 0.07, v: [-0.035, 0.02, -0.065] },
  { mu: 0.49, sigma: 0.12, v: [0.92, 0.62, 0.45] },
  { mu: 0.81, sigma: 0.1, v: [0.025, -0.1, 0.1] }
];
var rbbb = [
  { mu: 0.075, sigma: 0.035, v: [-0.12, -0.04, -0.11] },
  { mu: 0.32, sigma: 0.082, v: [0.92, 0.62, 0.45] },
  { mu: 0.51, sigma: 0.067, v: [0.025, -0.1, 0.1] },
  { mu: 0.76, sigma: 0.115, v: [-0.48, -0.02, -0.58] }
];
var lbbb = [
  { mu: 0.14, sigma: 0.08, v: [0.22, 0.12, 0.34] },
  { mu: 0.39, sigma: 0.13, v: [0.9, 0.5, 0.54] },
  { mu: 0.69, sigma: 0.15, v: [1.03, 0.57, 0.59] },
  { mu: 0.88, sigma: 0.06, v: [0.2, 0.04, 0.16] }
];
function gaussian(u, mu, sigma) {
  return Math.exp(-0.5 * ((u - mu) / sigma) ** 2);
}
function compact(u) {
  if (u <= 0 || u >= 1) return 0;
  return Math.min(1, u / 0.035, (1 - u) / 0.035);
}
function bump(u) {
  if (u <= 0 || u >= 1) return 0;
  const g = Math.exp(-0.5 * ((u - 0.5) / 0.18) ** 2);
  return (g - Math.exp(-0.5 * (0.5 / 0.18) ** 2)) / (1 - Math.exp(-0.5 * (0.5 / 0.18) ** 2));
}
function qrsKernels(c, beat) {
  const ventricular = beat.kind === "pvc" || beat.kind === "ventricular" || beat.kind === "paced";
  const block = ventricular ? "lbbb" : c.conduction;
  let ks = (block === "lbbb" ? lbbb : block.includes("rbbb") || block === "irbbb" ? rbbb : normal2).map((k) => ({ ...k, v: [...k.v] }));
  if (!c.septalQ && block === "normal") ks = ks.slice(1);
  let sum = [0, 0, 0];
  for (const k of ks) for (let j = 0; j < 3; j++) sum[j] += k.v[j] * k.sigma;
  const p2 = project(sum), baseAxis = axisFromLeads(p2.I, p2.II);
  let target = c.axis;
  if (ventricular) target = -65;
  const rotation = (target - baseAxis) * Math.PI / 180;
  if (block.includes("rbbb") || block === "irbbb") {
    const net = project(sum), amp = Math.hypot(net.I, (2 * net.II - net.I) / Math.sqrt(3)), desired = frontal(target, amp, sum[2]);
    for (let j = 0; j < 2; j++)
      ks[1].v[j] += (desired[j] - sum[j]) / ks[1].sigma;
  }
  for (const k of ks) {
    if (!block.includes("rbbb") && block !== "irbbb") {
      const pr = project(k.v);
      const a = axisFromLeads(pr.I, pr.II) * Math.PI / 180 + rotation;
      const amp = Math.hypot(pr.I, (2 * pr.II - pr.I) / Math.sqrt(3));
      k.v = frontal(a * 180 / Math.PI, amp, k.v[2]);
    }
    k.v[2] += c.transition * 0.23 * Math.hypot(k.v[0], k.v[1]);
    for (let j = 0; j < 3; j++)
      k.v[j] *= c.qrsAmp * (c.electrolyte === "lowvoltage" ? 0.38 : 1);
  }
  if (c.overload === "rv_chronic" || c.overload === "rv_acute") {
    ks.push({
      mu: 0.6,
      sigma: 0.15,
      v: [-0.12, 0.08, -0.7 * (c.overload === "rv_acute" ? 0.55 : 1)]
    });
  }
  if (c.overload === "lv")
    for (const k of ks) for (let j = 0; j < 3; j++) k.v[j] *= 1.8;
  return ks;
}
function qrsDuration(c, b) {
  if (b.kind === "pvc" || b.kind === "ventricular" || b.kind === "paced")
    return Math.max(150, c.qrs) / 1e3;
  return c.qrs / 1e3;
}
function lesionVector(c) {
  const map = {
    inferior_rca: [-0.1, 0.18, -0.02],
    inferior_lcx: [0.12, 0.2, 0.02],
    anterior: [0.06, 0.025, -0.29],
    lateral: [0.28, -0.015, -0.01],
    posterior: [-0.04, 0.01, 0.25],
    rv: [-0.13, 0.11, -0.22],
    diffuse: [-0.2, -0.19, 0.08],
    subendo: [-0.1, -0.12, 0.1],
    pericarditis: [0.18, 0.18, -0.14],
    sgarbossa: [0.22, 0.05, -0.07]
  };
  const v = map[c.ischemia] || [0, 0, 0];
  const factor = c.st / 2 * (c.phase === "hyperacute" ? 0.35 : c.phase === "evolving" ? 0.35 : c.phase === "chronic" ? 0 : 1);
  return v.map((n) => n * factor);
}
function tVector(c, b) {
  let v = frontal(c.tAxis, c.tAmp, -0.07), amp = 1;
  if (c.phase === "hyperacute" && c.ischemia !== "none") amp = 2.15;
  if (c.phase === "evolving" && c.ischemia !== "none") amp = -1;
  const ventricular = b.kind !== "normal";
  if (c.conduction === "lbbb" || ventricular)
    v = frontal((ventricular ? -65 : c.axis) + 180, c.tAmp * 0.9, -0.15);
  if (!ventricular && (c.conduction.includes("rbbb") || c.conduction === "irbbb"))
    v = [0.18, 0.12, 0.27];
  if (!ventricular && (c.overload === "rv_chronic" || c.overload === "rv_acute"))
    v = [0.12, 0.04, 0.42];
  if (!ventricular && c.overload === "lv") v = [-0.3, -0.08, 0.15];
  if (c.electrolyte === "hyperkalemia") amp = 2.6;
  if (c.electrolyte === "hypokalemia") amp = 0.4;
  return v.map((x) => x * amp);
}
function atrialVector(c, u) {
  const right = bump(u / 0.76), left = bump((u - 0.24) / 0.76);
  const normalization = 1 / bump(0.5 / 0.76);
  const amplitude = c.pAmp * (0.5 * right + 0.5 * left) * normalization;
  return frontal(c.pAxis, amplitude, c.pAmp * (-0.58 * right) * normalization);
}
function tWave(u, peaked = false) {
  if (u <= 0 || u >= 1) return 0;
  const apex = peaked ? 0.5 : 0.62;
  const value = u < apex ? (1 - Math.cos(Math.PI * u / apex)) / 2 : (1 + Math.cos(Math.PI * (u - apex) / (1 - apex))) / 2;
  return peaked ? value ** 1.6 : value;
}

// src/engine/filter.ts
function highpass(x, fs, hz) {
  const a = Math.exp(-2 * Math.PI * hz / fs);
  let y = 0, prev = x[0];
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    y = a * (y + v - prev);
    x[i] = y;
    prev = v;
  }
}
function biquad(x, fs, hz, type, q = 1 / Math.sqrt(2)) {
  const w = 2 * Math.PI * hz / fs, co = Math.cos(w), si = Math.sin(w), al = si / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === "notch") {
    b0 = 1 / a0;
    b1 = -2 * co / a0;
    b2 = 1 / a0;
  } else {
    b0 = (1 - co) / 2 / a0;
    b1 = (1 - co) / a0;
    b2 = b0;
  }
  const a1 = -2 * co / a0, a2 = (1 - al) / a0;
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + z1;
    z1 = b1 * x[i] - a1 * y + z2;
    z2 = b2 * x[i] - a2 * y;
    x[i] = y;
  }
}
function antialias(x, fs) {
  const half = 40, fc = 170 / fs, kernel = new Float64Array(half * 2 + 1);
  let total = 0;
  for (let k = -half; k <= half; k++) {
    const window = 0.42 + 0.5 * Math.cos(Math.PI * k / half) + 0.08 * Math.cos(2 * Math.PI * k / half);
    kernel[k + half] = (k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k)) * window;
    total += kernel[k + half];
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const output = new Float64Array(x.length);
  for (let i = half; i < x.length - half; i++) {
    let value = x[i] * kernel[half];
    for (let j = 1; j <= half; j++)
      value += (x[i - j] + x[i + j]) * kernel[half + j];
    output[i] = value;
  }
  return output;
}

// src/engine/repolarization.ts
var QT_ADAPTATION_SECONDS = -120 / Math.log(0.05);
function adaptRR(previous, rr, elapsed) {
  return previous + (1 - Math.exp(-Math.max(0, elapsed) / QT_ADAPTATION_SECONDS)) * (rr - previous);
}
function nominalVentricularRR(c) {
  if (c.rhythm === "flutter") return 60 / c.atrialRate * c.flutterRatio;
  const ratio = c.rhythm === "sinus" ? { mobitz1: 4 / 3, mobitz2: 4 / 3, two_one: 2, high: 3 }[c.av] ?? 1 : 1;
  return 60 / c.hr * ratio;
}
function assignRepolarization(c, beats) {
  let history = nominalVentricularRR(c);
  for (const beat of beats) {
    history = adaptRR(history, Math.max(0.22, beat.rr), beat.rr);
    beat.adaptedRR = history;
    beat.qrs = qrsDuration(c, beat);
    beat.qt = Math.max(
      qrsDuration(c, beat) + 0.12,
      Math.min(0.9, c.qtc / 1e3 * Math.cbrt(history))
    );
  }
}

// src/engine/analysis/statistics.ts
function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}
var median = (values) => quantile(values, 0.5);
var mad = (values) => {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};
var spread = (values) => quantile(values, 0.9) - quantile(values, 0.1);
var circularMedian = (values) => {
  if (!values.length) return 0;
  const anchor = values[0];
  const center = median(
    values.map((v) => anchor + (v - anchor + 540) % 360 - 180)
  );
  return (center + 540) % 360 - 180;
};

// src/engine/signal.ts
var FS = 1e3;
var OUT = 500;
var WARM = 4;
var GUARD = 0.1;
function synthesize(c, duration = 65) {
  duration = Math.max(10, Math.min(120, duration));
  const total = duration + WARM, n = Math.ceil((total + GUARD) * FS), events = generateEvents(c, total + GUARD), xyz = [new Float64Array(n), new Float64Array(n), new Float64Array(n)], corr = {};
  assignRepolarization(c, events.beats);
  const add = (start, length, fn) => {
    const lo = Math.max(0, Math.floor(start * FS)), hi = Math.min(n, Math.ceil((start + length) * FS));
    for (let i = lo; i < hi; i++) {
      const v = fn((i / FS - start) / length, i / FS);
      xyz[0][i] += v[0];
      xyz[1][i] += v[1];
      xyz[2][i] += v[2];
    }
  };
  const local = (lead, start, len, amp, fn = bump) => {
    const arr = corr[lead] ?? (corr[lead] = new Float64Array(n));
    for (let i = Math.max(0, Math.floor(start * FS)); i < Math.min(n, Math.ceil((start + len) * FS)); i++)
      arr[i] += amp * fn((i / FS - start) / len);
  };
  const scale = (v, a) => [v[0] * a, v[1] * a, v[2] * a];
  for (const a of events.atria) {
    const len = a.kind === "ectopic" ? 0.075 : 0.095, v = frontal(
      a.kind === "retrograde" ? -100 : a.kind === "ectopic" ? 20 : c.pAxis,
      c.pAmp,
      -0.018
    );
    add(
      a.time,
      len,
      (u) => a.kind === "sinus" ? atrialVector(c, u) : scale(v, bump(u))
    );
  }
  for (const b of events.beats) {
    const dur = qrsDuration(c, b), ks = qrsKernels(c, b), qt = b.qt, tors = c.rhythm === "torsades";
    add(b.time, dur, (u, t) => {
      let v = [0, 0, 0];
      for (const k of ks) {
        const g = gaussian(u, k.mu, k.sigma) * compact(u);
        for (let j = 0; j < 3; j++) v[j] += g * k.v[j];
      }
      if (tors) {
        const phase = 2 * Math.PI * t / (60 / c.hr * 12), x = v[0], z = v[2], envelope = 0.55 + 0.65 * (1 + Math.sin(phase)) / 2;
        v = [
          (x * Math.cos(phase) - z * Math.sin(phase)) * envelope,
          v[1] * Math.cos(phase),
          x * Math.sin(phase) + z * Math.cos(phase)
        ];
      }
      return v;
    });
    if (c.conduction === "wpw" && b.kind === "normal")
      add(
        b.time,
        0.045,
        (u) => scale(frontal(c.axis, 0.25, 0.03), Math.sin(Math.PI * u))
      );
    const tLen = c.electrolyte === "hyperkalemia" ? 0.13 : Math.min(0.22, (qt - dur) * 0.68), tStart = b.time + qt - tLen, tv = tVector(c, b), lv = lesionVector(c);
    if (c.conduction === "lbbb" || b.kind !== "normal") {
      const q = project(
        ks.reduce((acc, k) => acc.map((v, j) => v + k.v[j] * k.sigma), [
          0,
          0,
          0
        ])
      );
      const s = frontal(
        (b.kind !== "normal" ? -65 : c.axis) + 180,
        Math.min(0.1, Math.abs(q.I) * 0.3),
        -0.035
      );
      for (let j = 0; j < 3; j++) lv[j] += s[j];
    }
    add(b.time + dur - 0.012, qt - dur + 0.012, (u) => {
      const envelope = Math.min(
        1,
        u / Math.min(0.3, 0.012 / (qt - dur + 0.012)),
        (1 - u) / 0.38
      );
      let shape = 1;
      if (c.stShape === "concave") shape = 0.7 + 0.6 * u * u;
      if (c.stShape === "convex") shape = 1 + 0.3 * Math.sin(Math.PI * u);
      return scale(lv, Math.max(0, envelope) * shape);
    });
    add(
      tStart,
      tLen,
      (u) => scale(tv, tWave(u, c.electrolyte === "hyperkalemia"))
    );
    if (c.electrolyte === "hypokalemia")
      add(
        b.time + qt + 0.035,
        0.16,
        (u) => scale(frontal(40, 0.17, -0.06), bump(u))
      );
    if (c.ischemia === "wellens_a" || c.ischemia === "wellens_b")
      for (const l of ["V2", "V3"]) {
        const projected = project(tv)[l];
        local(
          l,
          tStart,
          tLen,
          -projected,
          (u) => tWave(u, c.electrolyte === "hyperkalemia")
        );
        if (c.ischemia === "wellens_b") local(l, tStart, tLen, -0.6);
        else {
          local(l, tStart, tLen * 0.5, 0.23);
          local(l, tStart + tLen * 0.38, tLen * 0.62, -0.46);
        }
      }
    if (c.ischemia === "de_winter")
      for (const l of ["V1", "V2", "V3", "V4", "V5", "V6"]) {
        local(
          l,
          b.time + dur - 0.012,
          Math.max(0.072, tStart - b.time - dur + 0.012),
          -0.16,
          (u) => Math.max(0, 1 - u) * Math.min(
            1,
            u / (0.012 / Math.max(0.072, tStart - b.time - dur + 0.012))
          )
        );
        local(l, tStart, tLen, 0.48);
      }
    if (c.ischemia === "posterior")
      for (const l of ["V1", "V2", "V3"])
        local(
          l,
          b.time,
          dur,
          0.75,
          (u) => gaussian(u, 0.47, 0.14) * compact(u)
        );
    if (c.ischemia === "pericarditis" && b.pr) {
      const v = frontal(50, -0.055, 0.025);
      add(
        b.time - b.pr + 0.085,
        Math.max(0.03, b.pr - 0.085),
        (u) => scale(v, Math.min(1, u / 0.12, (1 - u) / 0.12))
      );
    }
  }
  if (c.rhythm === "af" || c.rhythm === "flutter" || c.rhythm === "vf") {
    const r = random(c.seed + 11);
    let phase = 0, noise = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      let v;
      if (c.rhythm === "af") {
        noise = 0.96 * noise + 0.04 * normal(r);
        phase += 2 * Math.PI * (7.2 + 2.2 * noise) / FS;
        v = frontal(
          75,
          0.038 * (Math.sin(phase) + 0.5 * Math.sin(phase * 1.67 + 0.3)),
          -0.018 * Math.sin(phase * 1.13)
        );
      } else if (c.rhythm === "flutter") {
        const u = t * c.atrialRate / 60 % 1;
        const f = u < 0.75 ? u / 0.75 : 1 - (u - 0.75) / 0.25;
        v = frontal(-85, 0.19 * (f - 0.5), -0.11 * (f - 0.5));
      } else {
        noise = 0.97 * noise + 0.03 * normal(r);
        const amp = 0.7 + 0.17 * Math.sin(t * 0.7);
        v = [
          amp * (Math.sin(t * 2 * Math.PI * 4.7 + Math.sin(t * 3)) + 0.3 * Math.sin(t * 2 * Math.PI * 7.9)) + 0.3 * noise,
          0.5 * Math.sin(t * 2 * Math.PI * 4.1 + Math.sin(t * 2.3)),
          0.35 * Math.sin(t * 2 * Math.PI * 6.3 + Math.cos(t * 1.7))
        ];
      }
      for (let j = 0; j < 3; j++) xyz[j][i] += v[j];
    }
  }
  for (const t of events.spikes)
    add(t, 4e-3, (u) => scale(frontal(65, 1.9, -0.8), u < 0.5 ? 1 : -0.22));
  const output = makeArrays(Math.floor(duration * OUT));
  for (let lindex = 0; lindex < INDEPENDENT.length; lindex++) {
    const l = INDEPENDENT[lindex], row = DOWER[l], arr = new Float64Array(n), r = random(c.seed + 777 + lindex), ca = corr[l];
    let muscle = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      muscle = 0.3 * muscle + 0.7 * normal(r);
      arr[i] = xyz[0][i] * row[0] + xyz[1][i] * row[1] + xyz[2][i] * row[2] + (ca?.[i] || 0) + c.artifacts.baseline * 0.3 * Math.sin(
        2 * Math.PI * c.respiratoryRate / 60 * t + lindex * 0.18
      ) + c.artifacts.muscle * 0.12 * muscle + c.artifacts.mains * 0.08 * Math.sin(2 * Math.PI * c.mainsFrequency * t + lindex * 0.23);
      if (l === "V2")
        arr[i] += c.artifacts.loose * (0.48 * Math.sin(t * 0.7) + 0.23 * Math.sin(t * 8) * Math.max(0, Math.sin(t * 1.4)));
    }
    if (c.filter !== "off")
      highpass(
        arr,
        FS,
        c.filter === "diagnostic" ? 0.05 : c.filter === "monitor" ? 0.5 : 2
      );
    if (c.filter === "monitor" || c.filter === "aggressive")
      biquad(arr, FS, 40, "lowpass");
    if (c.notch) biquad(arr, FS, c.notch, "notch", 25);
    const filtered = antialias(arr, FS);
    for (let i = 0; i < output[l].length; i++)
      output[l][i] = filtered[Math.round(WARM * FS) + i * 2];
  }
  for (let i = 0; i < output.I.length; i++) {
    const a = output.I[i], b = output.II[i];
    output.III[i] = b - a;
    output.aVR[i] = -(a + b) / 2;
    output.aVL[i] = a - b / 2;
    output.aVF[i] = b - a / 2;
  }
  if (c.artifacts.reversed) {
    const i = output.I, ii = output.II, iii = output.III, avr = output.aVR, avl = output.aVL;
    output.I = Float64Array.from(i, (x) => -x);
    output.II = iii;
    output.III = ii;
    output.aVR = avl;
    output.aVL = avr;
  }
  const visible = {
    atria: events.atria.filter((a) => a.time >= WARM && a.time < total).map((a) => ({ ...a, time: a.time - WARM })),
    beats: events.beats.filter((b) => b.time >= WARM && b.time < total).map((b) => ({ ...b, time: b.time - WARM })),
    spikes: events.spikes.filter((t) => t >= WARM && t < total).map((t) => t - WARM)
  };
  const bs = visible.beats;
  const meanRR = bs.length > 1 ? (bs[bs.length - 1].time - bs[0].time) / (bs.length - 1) : 60 / c.hr;
  const hasPR = c.rhythm === "sinus" && c.av !== "complete" || c.rhythm === "paced" && c.pacing !== "VVI";
  const widths = bs.map((b) => qrsDuration(c, b) * 1e3).sort((a, b) => a - b);
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
      qt: bs.length ? median(bs.map((b) => b.qt * 1e3)) : null,
      axis: bs.length ? allV ? -65 : c.axis : null
    },
    warnings: constraints(c)
  };
}

// src/engine/analysis/evidence.ts
function evidence(values, total, limit, reason) {
  const dispersion = values.length > 1 ? spread(values) : null;
  const enough = values.length >= 3 && values.length >= total * 0.6;
  const stable = dispersion !== null && dispersion <= limit;
  return {
    status: enough && stable ? "usable" : values.length ? "review" : "unavailable",
    reason: !values.length ? reason : !enough ? "Pocos latidos con l\xEDmites reconocibles." : !stable ? "Dispersi\xF3n entre latidos: revisa el trazado." : reason,
    count: values.length,
    total,
    spread: dispersion
  };
}
var unavailable = (reason, total = 0) => ({
  status: "unavailable",
  reason,
  count: 0,
  total,
  spread: null
});

// src/engine/measure.ts
function measure(s) {
  const fs = s.fs, n = Math.min(s.leads.I.length, Math.round(10 * fs));
  const names = ["I", "II", "V1", "V5"];
  const slope = new Float64Array(n), energy = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    let sum = 0;
    for (const lead of names)
      sum += ((s.leads[lead][i] - s.leads[lead][i - 1]) * fs) ** 2;
    slope[i] = Math.sqrt(sum);
  }
  const win = Math.max(1, Math.round(0.018 * fs));
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += slope[i];
    if (i >= win) running -= slope[i - win];
    energy[i] = running / win;
  }
  const threshold = Math.max(1.9, quantile(Array.from(energy), 0.98) * 0.45), peaks = [];
  for (let i = Math.round(0.15 * fs); i < n - 1; i++) {
    if (energy[i] <= threshold || energy[i] < energy[i - 1] || energy[i] <= energy[i + 1])
      continue;
    const previous = peaks.at(-1);
    if (previous === void 0 || i - previous > 0.18 * fs) peaks.push(i);
    else if (energy[i] > energy[previous]) peaks[peaks.length - 1] = i;
  }
  if ((peaks.at(-1) ?? 0) > n - 0.18 * fs) peaks.pop();
  const nil = {
    hr: null,
    instantHr: null,
    pr: null,
    qrs: null,
    qt: null,
    axis: null,
    pAxis: null,
    tAxis: null,
    rr: null,
    qtc: { bazett: null, fridericia: null, framingham: null, hodges: null },
    quality: "No se reconocen suficientes complejos para medir.",
    beats: [],
    detectedPeaks: peaks.map((p2) => p2 / fs),
    window: { start: 0, end: n / fs },
    evidence: {
      hr: unavailable("No hay un ritmo ventricular delineable."),
      pr: unavailable("No hay asociaci\xF3n AV estable."),
      qrs: unavailable("L\xEDmites QRS no reconocibles."),
      qt: unavailable("Final de T no reconocible."),
      axis: unavailable("QRS no delineable.")
    }
  };
  if (peaks.length < 3 || quantile(Array.from(energy), 0.5) > quantile(Array.from(energy), 0.98) * 0.6)
    return nil;
  const intervals = peaks.slice(1).map((p2, i) => (p2 - peaks[i]) / fs), rr = median(intervals);
  if (rr < 0.22 || rr > 3) return nil;
  const beats = [], paxes = [], taxes = [];
  for (let k = 1; k < peaks.length - 1; k++) {
    const peak = peaks[k];
    let baseIndex = Math.max(8, peak - Math.round(0.22 * fs));
    for (let j = baseIndex; j < peak - Math.round(0.04 * fs); j++)
      if (energy[j] < energy[baseIndex]) baseIndex = j;
    const baseline = names.map(
      (l) => median(
        Array.from(
          s.leads[l].slice(
            Math.max(0, baseIndex - Math.round(0.016 * fs)),
            baseIndex + 1
          )
        )
      )
    );
    const postLo = Math.min(
      n - 2,
      peak + Math.round(Math.min(0.5, (peaks[k + 1] - peak) / fs * 0.5) * fs)
    );
    const postHi = Math.min(n - 1, peaks[k + 1] - Math.round(0.045 * fs));
    let postIndex = postLo;
    for (let j = postLo; j < postHi; j++)
      if (energy[j] < energy[postIndex]) postIndex = j;
    const postBaseline = names.map(
      (l) => median(
        Array.from(
          s.leads[l].slice(
            Math.max(0, postIndex - Math.round(8e-3 * fs)),
            postIndex + 1
          )
        )
      )
    );
    const baseAt = (j, l) => baseline[l] + (postBaseline[l] - baseline[l]) * Math.max(
      0,
      Math.min(1, (j - baseIndex) / Math.max(1, postIndex - baseIndex))
    );
    const magnitude = (j) => Math.sqrt(
      names.reduce(
        (sum, l, k2) => sum + (s.leads[l][j] - baseAt(j, k2)) ** 2,
        0
      )
    );
    const noiseSamples = [];
    for (let j = Math.max(2, peak - Math.round(0.3 * fs)); j < peak - Math.round(0.06 * fs); j++) {
      for (const lead of names)
        noiseSamples.push(
          Math.abs(
            s.leads[lead][j] - 2 * s.leads[lead][j - 1] + s.leads[lead][j - 2]
          )
        );
    }
    const noise2 = median(noiseSamples) / 1.65;
    let amplitude = 0;
    for (let j = Math.max(0, peak - Math.round(0.16 * fs)); j < Math.min(n, peak + Math.round(0.08 * fs)); j++)
      amplitude = Math.max(amplitude, magnitude(j));
    const half = Math.max(1, Math.round(4e-3 * fs));
    const derivative = (j) => Math.sqrt(
      names.reduce((sum, lead) => {
        const lo = Math.max(0, j - half), hi = Math.min(n - 1, j + half);
        return sum + ((s.leads[lead][hi] - s.leads[lead][lo]) * fs / (hi - lo)) ** 2;
      }, 0)
    );
    const localSlopes = [];
    for (let j = Math.max(half, peak - Math.round(0.16 * fs)); j < Math.min(n - half, peak + Math.round(0.18 * fs)); j++)
      localSlopes.push(derivative(j));
    const maximumSlope = quantile(localSlopes, 0.9);
    const derivativeThreshold = Math.max(
      0.4,
      maximumSlope * 0.028,
      noise2 * fs * 0.9,
      quantile(localSlopes, 0.2) * 2.5
    );
    const active = (j) => derivative(j) > derivativeThreshold;
    const left = Math.max(
      1,
      peak - Math.round(Math.min(0.28, (peak - peaks[k - 1]) / fs * 0.8) * fs)
    ), right = Math.min(n - 1, peak + Math.round(0.21 * fs)), quietSamples = Math.round(
      Math.min(0.04, (peak - peaks[k - 1]) / fs * 0.075) * fs
    );
    let on = peak, off = peak, quiet = 0;
    for (let j = peak; j > left; j--) {
      if (active(j)) {
        on = j;
        quiet = 0;
      } else if (++quiet >= quietSamples) break;
    }
    quiet = 0;
    for (let j = peak; j < right; j++) {
      if (active(j)) {
        off = j;
        quiet = 0;
      } else if (++quiet >= quietSamples) break;
    }
    if (on <= left + 1 || off >= right - 1) continue;
    const width = (off - on) / fs, localRR = (peaks[k] - peaks[k - 1]) / fs;
    if (width < 0.04 || width > 0.28 || width > Math.min(localRR, (peaks[k + 1] - peak) / fs) * 0.75)
      continue;
    let ai = 0, aii = 0;
    for (let j = on; j < off; j++) {
      ai += s.leads.I[j] - baseAt(j, 0);
      aii += s.leads.II[j] - baseAt(j, 1);
    }
    const beat = {
      peak: peak / fs,
      onset: on / fs,
      offset: off / fs,
      pOnset: null,
      pPeak: null,
      tPeak: null,
      tEnd: null,
      tTangentEnd: null,
      rr: localRR,
      pr: null,
      qrs: width * 1e3,
      qt: null,
      axis: axisFromLeads(ai, aii),
      noise: noise2
    };
    const pLo = Math.max(
      0,
      on - Math.round(Math.min(0.32, localRR * 0.4) * fs)
    ), pHi = on - Math.round(0.035 * fs);
    let pp = pLo;
    for (let j = pLo; j < pHi; j++) if (magnitude(j) > magnitude(pp)) pp = j;
    const pAmplitude = magnitude(pp), pThreshold = Math.max(pAmplitude * 0.04, noise2 * 4, 3e-3);
    if (pAmplitude > Math.max(0.045, noise2 * 10) && pAmplitude < amplitude * 0.55) {
      let po = pp;
      while (po > pLo && magnitude(po) > pThreshold) po--;
      if (po > pLo + 1 && pp - po > 0.012 * fs) {
        beat.pOnset = po / fs;
        beat.pPeak = pp / fs;
        beat.pr = (on - po) / fs * 1e3;
        paxes.push(
          axisFromLeads(
            s.leads.I[pp] - baseline[0],
            s.leads.II[pp] - baseline[1]
          )
        );
      }
    }
    const tLo = off + Math.round(0.04 * fs), nextOn = peaks[k + 1] - Math.round(0.12 * fs);
    const tHi = Math.min(
      n - 1,
      nextOn,
      on + Math.round(Math.min(0.95, localRR * 0.82) * fs)
    );
    let tp = tLo, te = tLo, quietT = 0, started = false, lastActive = tLo;
    const minimumT = Math.max(0.012, noise2 * 6), quietTNeeded = Math.round(0.04 * fs);
    for (let j = tLo; j < tHi; j++) {
      const value = magnitude(j);
      if (!started && value > minimumT) started = true;
      if (!started) continue;
      if (value > magnitude(tp)) tp = j;
      const returnThreshold = Math.max(magnitude(tp) * 0.025, noise2 * 4, 4e-3);
      if (value > returnThreshold) {
        lastActive = j;
        quietT = 0;
      } else quietT++;
      if (quietT >= quietTNeeded) {
        te = lastActive + 1;
        break;
      }
    }
    const tAmplitude = magnitude(tp);
    if (te > tp && tp > tLo + 3 && tAmplitude > Math.max(0.05, noise2 * 12)) {
      beat.tPeak = tp / fs;
      beat.tEnd = te / fs;
      beat.qt = (te - on) / fs * 1e3;
      taxes.push(
        axisFromLeads(
          s.leads.I[tp] - baseline[0],
          s.leads.II[tp] - baseline[1]
        )
      );
      let terminalPeak = tp;
      for (let j = tp + 1; j < te - 1; j++)
        if (magnitude(j) > tAmplitude * 0.15 && magnitude(j) >= magnitude(j - 1) && magnitude(j) > magnitude(j + 1))
          terminalPeak = j;
      const half2 = Math.max(1, Math.round(8e-3 * fs));
      let steepest = 0, steepestIndex = terminalPeak, tangent = null;
      for (let j = terminalPeak + half2; j < te - half2; j++) {
        const derivative2 = (magnitude(j + half2) - magnitude(j - half2)) / (2 * half2 / fs);
        if (derivative2 < steepest) {
          steepest = derivative2;
          steepestIndex = j;
          tangent = j / fs - magnitude(j) / derivative2;
        }
      }
      if (tangent !== null && tangent > terminalPeak / fs && tangent <= te / fs + 0.04)
        beat.tTangentEnd = tangent;
      let slopeQuiet = 0;
      for (let j = steepestIndex + half2; j < Math.min(tHi - half2, te + Math.round(0.04 * fs)); j++) {
        const d = (magnitude(j + half2) - magnitude(j - half2)) / (2 * half2 / fs);
        if (Math.abs(d) < Math.max(0.04, Math.abs(steepest) * 0.08) && magnitude(j) < tAmplitude * 0.15)
          slopeQuiet++;
        else slopeQuiet = 0;
        if (slopeQuiet >= Math.round(0.024 * fs)) {
          const slopeEnd = (j - slopeQuiet + 1) / fs;
          if (slopeEnd > terminalPeak / fs && slopeEnd < beat.tEnd) {
            beat.tEnd = slopeEnd;
            beat.qt = (slopeEnd - beat.onset) * 1e3;
          }
          break;
        }
      }
    }
    beats.push(beat);
  }
  if (beats.length < 3 || beats.length < (peaks.length - 2) * 0.45) {
    if (peaks.length >= 4) {
      const hr2 = 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length);
      return {
        ...nil,
        beats,
        hr: hr2,
        instantHr: 60 / intervals.at(-1),
        rr,
        quality: "Ritmo detectado; ondas superpuestas o l\xEDmites no separables.",
        evidence: {
          ...nil.evidence,
          hr: {
            ...evidence(
              intervals,
              intervals.length,
              Infinity,
              "Frecuencia repetible; intervalos no delineables."
            ),
            status: "review"
          }
        }
      };
    }
    return { ...nil, beats };
  }
  const widths = beats.map((b) => b.qrs), prs = beats.flatMap((b) => b.pr === null ? [] : [b.pr]), qts = beats.flatMap((b) => b.qt === null ? [] : [b.qt]);
  const pm = median(prs), consistent = prs.length >= Math.max(3, beats.length * 0.65) && pm >= 80 && pm <= 400 && mad(prs) < 12 && spread(prs) < 35;
  const regular = mad(intervals) < rr * 0.05 && spread(intervals) < rr * 0.16;
  const noise = median(beats.map((b) => b.noise)), noisy = noise > 0.015;
  const hr = 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length), qrs = median(widths), qt = regular && !noisy && qts.length >= beats.length * 0.6 ? median(qts) || null : null;
  const pr = consistent && !noisy ? pm : null, q = qt === null ? null : qt / 1e3;
  const ev = {
    hr: evidence(
      intervals,
      intervals.length,
      Infinity,
      "Frecuencia media entre complejos detectados."
    ),
    pr: pr === null ? unavailable(
      noisy ? "Ruido: inicio de P no fiable." : "P no reconocible o sin relaci\xF3n AV estable.",
      beats.length
    ) : evidence(prs, beats.length, 20, "Inicio de P y QRS reproducibles."),
    qrs: evidence(widths, beats.length, 16, "L\xEDmites QRS reproducibles."),
    qt: qt === null ? unavailable(
      !regular ? "RR irregular: no se resume QT/QTc." : noisy ? "Ruido: final de T no fiable." : "T superpuesta, d\xE9bil o sin retorno claro.",
      beats.length
    ) : evidence(
      qts,
      beats.length,
      24,
      "Retorno de amplitud o pendiente terminal; revisa T/U."
    ),
    axis: evidence(
      beats.map((b) => b.axis),
      beats.length,
      12,
      "Eje de \xE1rea neta entre l\xEDmites QRS."
    )
  };
  if (pr !== null && qt === null) {
    ev.pr.status = "review";
    ev.pr.reason = "No se separa la T: la onda atribuida a P podr\xEDa ser repolarizaci\xF3n previa.";
  }
  if (noisy) {
    ev.qrs.status = "review";
    ev.qrs.reason = "Ruido elevado: revisa manualmente los l\xEDmites.";
    ev.hr.status = "review";
    ev.hr.reason = "El ruido puede producir detecciones falsas.";
    ev.axis.status = "review";
  }
  return {
    hr,
    instantHr: 60 / (intervals.at(-1) || rr),
    rr,
    pr,
    qrs,
    qt,
    axis: circularMedian(beats.map((b) => b.axis)),
    pAxis: pr !== null && paxes.length ? circularMedian(paxes) : null,
    tAxis: qt !== null && taxes.length ? circularMedian(taxes) : null,
    qtc: {
      bazett: q === null ? null : q / Math.sqrt(rr) * 1e3,
      fridericia: q === null ? null : q / Math.cbrt(rr) * 1e3,
      framingham: q === null ? null : (q + 0.154 * (1 - rr)) * 1e3,
      hodges: qt === null ? null : qt + 1.75 * (hr - 60)
    },
    quality: "An\xE1lisis de muestras \xB7 primeros 10 s \xB7 los l\xEDmites y las cifras comparten el mismo delineador.",
    beats,
    evidence: ev,
    window: { start: 0, end: n / fs },
    detectedPeaks: peaks.map((p2) => p2 / fs)
  };
}

// src/presets/catalog.ts
var p = (id, name, short, group, patch, mechanism, findings, strategy = "vectorial", limitation = "Morfolog\xEDa param\xE9trica representativa; sin validaci\xF3n contra ECG de pacientes.") => ({
  id,
  name,
  short,
  group,
  patch,
  mechanism,
  findings,
  strategy,
  limitation
});
var PRESETS = [
  p(
    "sinus",
    "Ritmo sinusal",
    "Sinusal",
    "Ritmos",
    {},
    "Activaci\xF3n auricular sinusal seguida de conducci\xF3n AV 1:1.",
    [
      "P positiva en II, negativa en aVR",
      "PR constante; QRS estrecho",
      "Progresi\xF3n de R precordial"
    ]
  ),
  p(
    "brady",
    "Bradicardia sinusal",
    "Bradicardia",
    "Ritmos",
    { hr: 45 },
    "Disminuci\xF3n de la frecuencia del nodo sinusal.",
    ["FC <60 lpm", "Una P antes de cada QRS"]
  ),
  p(
    "tachy",
    "Taquicardia sinusal",
    "Taquicardia",
    "Ritmos",
    { hr: 125, pr: 140, qtc: 410 },
    "Aumento de automatismo sinusal con conducci\xF3n conservada.",
    ["FC >100 lpm", "P sinusal y relaci\xF3n AV 1:1"]
  ),
  p(
    "rsa",
    "Arritmia sinusal respiratoria",
    "Arritmia respiratoria",
    "Ritmos",
    { hr: 68, variability: 0.18 },
    "El intervalo PP se modula por la fase respiratoria.",
    ["Variaci\xF3n c\xEDclica RR", "P de morfolog\xEDa constante"]
  ),
  p(
    "af",
    "Fibrilaci\xF3n auricular",
    "FA",
    "Ritmos",
    { rhythm: "af", hr: 95 },
    "Actividad auricular desorganizada y respuesta ventricular estoc\xE1stica.",
    [
      "Ausencia de P organizadas",
      "RR irregularmente irregular",
      "Ondas f de baja amplitud"
    ]
  ),
  p(
    "af_fast",
    "FA con respuesta r\xE1pida",
    "FA r\xE1pida",
    "Ritmos",
    { rhythm: "af", hr: 145 },
    "Fibrilaci\xF3n auricular con respuesta ventricular r\xE1pida.",
    ["Irregularidad absoluta", "Frecuencia media elevada"]
  ),
  p(
    "af_slow",
    "FA con respuesta lenta",
    "FA lenta",
    "Ritmos",
    { rhythm: "af", hr: 48 },
    "Fibrilaci\xF3n auricular con conducci\xF3n ventricular lenta.",
    ["Sin P organizadas", "RR largo e irregular"]
  ),
  p(
    "flutter",
    "Flutter auricular 2:1",
    "Flutter 2:1",
    "Ritmos",
    { rhythm: "flutter", atrialRate: 300, hr: 150, flutterRatio: 2 },
    "Actividad auricular peri\xF3dica con conducci\xF3n AV fija.",
    [
      "Ondas F negativas inferiores y positivas en V1",
      "Frecuencia auricular 300/min",
      "Respuesta ventricular 150 lpm"
    ],
    "vectorial",
    "Ondas F simplificadas; conducci\xF3n variable y circuito de reentrada no modelados."
  ),
  p(
    "flutter3",
    "Flutter auricular 3:1",
    "Flutter 3:1",
    "Ritmos",
    { rhythm: "flutter", atrialRate: 300, hr: 100, flutterRatio: 3 },
    "Conducci\xF3n de una de cada tres activaciones auriculares.",
    ["Ondas F continuas", "Respuesta ventricular 100 lpm"]
  ),
  p(
    "svt",
    "Taquicardia supraventricular regular",
    "TSV",
    "Ritmos",
    { rhythm: "junctional", hr: 185, pr: 80 },
    "Aproximaci\xF3n de una taquicardia de origen supraventricular con activaci\xF3n retr\xF3grada.",
    ["QRS estrecho y regular", "P retr\xF3grada cercana al QRS"],
    "vectorial",
    "No distingue AVNRT de AVRT; pseudo-r\u2032 y pseudo-S no ajustadas de forma espec\xEDfica."
  ),
  p(
    "junctional",
    "Ritmo de la uni\xF3n",
    "Uni\xF3n",
    "Ritmos",
    { rhythm: "junctional", hr: 48 },
    "Ritmo de escape de la uni\xF3n con activaci\xF3n auricular retr\xF3grada.",
    ["QRS estrecho a 40\u201360 lpm", "P retr\xF3grada negativa en II"]
  ),
  p(
    "pac",
    "Extras\xEDstole auricular",
    "ESA",
    "Ectopia",
    { ectopy: "pac" },
    "Activaci\xF3n auricular prematura que reinicia el ciclo.",
    [
      "P precoz de morfolog\xEDa diferente",
      "QRS estrecho",
      "Pausa no compensadora"
    ]
  ),
  p(
    "pvc",
    "Extras\xEDstole ventricular",
    "ESV",
    "Ectopia",
    { ectopy: "pvc" },
    "Activaci\xF3n ventricular prematura y pausa compensadora programada.",
    ["QRS ancho prematuro", "Repolarizaci\xF3n secundaria", "Pausa compensadora"],
    "vectorial",
    "No modela penetraci\xF3n retr\xF3grada ni disociaci\xF3n auricular durante la ectopia."
  ),
  p(
    "bigeminy",
    "Bigeminismo ventricular",
    "Bigeminismo",
    "Ectopia",
    { ectopy: "bigeminy", hr: 70 },
    "Alternancia de complejos sinusales y ventriculares prematuros.",
    ["Un QRS sinusal y una ESV", "Acoplamiento fijo"]
  ),
  p(
    "trigeminy",
    "Trigeminismo ventricular",
    "Trigeminismo",
    "Ectopia",
    { ectopy: "trigeminy" },
    "Dos latidos sinusales seguidos por una extras\xEDstole ventricular.",
    ["Secuencia de tres complejos", "ESV de morfolog\xEDa constante"]
  ),
  p(
    "couplet",
    "Dupla ventricular",
    "Dupla",
    "Ectopia",
    { ectopy: "couplet" },
    "Dos activaciones ventriculares prematuras consecutivas.",
    ["Dos QRS anchos consecutivos", "Pausa posterior"]
  ),
  p(
    "idioventricular",
    "Ritmo idioventricular",
    "Idioventricular",
    "Ritmos ventriculares",
    { rhythm: "idioventricular", hr: 32, qrs: 170, axis: -65 },
    "Escape ventricular lento.",
    ["QRS ancho", "Frecuencia 20\u201340 lpm"]
  ),
  p(
    "aivr",
    "Ritmo idioventricular acelerado",
    "RIVA",
    "Ritmos ventriculares",
    { rhythm: "idioventricular", hr: 78, qrs: 150, axis: -65 },
    "Automatismo ventricular acelerado.",
    ["QRS ancho regular", "Frecuencia aproximada 50\u2013110 lpm"]
  ),
  p(
    "vt",
    "Taquicardia ventricular monom\xF3rfica",
    "TV monom\xF3rfica",
    "Ritmos ventriculares",
    { rhythm: "vt", hr: 170, atrialRate: 75, qrs: 165, axis: -65 },
    "Activaci\xF3n ventricular repetitiva con actividad auricular independiente.",
    ["QRS ancho regular", "Disociaci\xF3n AV", "Repolarizaci\xF3n secundaria"],
    "vectorial",
    "Sin latidos de captura o fusi\xF3n; una sola morfolog\xEDa representativa."
  ),
  p(
    "torsades",
    "Taquicardia ventricular polim\xF3rfica",
    "TV polim\xF3rfica",
    "Ritmos ventriculares",
    { rhythm: "torsades", hr: 210, qrs: 160, qtc: 550 },
    "Rotaci\xF3n peri\xF3dica del vector ventricular para representar torsi\xF3n del eje.",
    ["Polaridad y amplitud variables", "Envolvente fusiforme"],
    "vectorial",
    "Aproximaci\xF3n visual. No reproduce QT previo ni inicio corto\u2013largo\u2013corto; no equivale a diagn\xF3stico validado de torsades."
  ),
  p(
    "vf",
    "Fibrilaci\xF3n ventricular",
    "FV",
    "Ritmos ventriculares",
    { rhythm: "vf" },
    "Actividad oscilatoria ca\xF3tica sin complejos organizados.",
    ["Ausencia de QRS identificables", "Ondulaci\xF3n irregular continua"],
    "vectorial",
    "Suma oscilatoria sint\xE9tica; transici\xF3n gruesa a fina no modelada."
  ),
  p(
    "asystole",
    "Asistolia",
    "Asistolia",
    "Ritmos ventriculares",
    { rhythm: "asystole" },
    "Ausencia de activaci\xF3n el\xE9ctrica organizada en el generador.",
    [
      "L\xEDnea isoel\xE9ctrica sin artefactos",
      "Comprobar otras derivaciones en la pr\xE1ctica"
    ]
  ),
  p(
    "av1",
    "BAV de primer grado",
    "BAV 1.\xBA",
    "Conducci\xF3n AV",
    { av: "first", pr: 260 },
    "Retardo AV constante sin p\xE9rdida de conducci\xF3n.",
    ["PR >200 ms", "Todas las P conducidas"]
  ),
  p(
    "wenckebach",
    "BAV Mobitz I \xB7 Wenckebach",
    "Wenckebach",
    "Conducci\xF3n AV",
    { av: "mobitz1", hr: 75, pr: 160, variability: 0 },
    "Incrementos PR de 80 y 40 ms seguidos de una P bloqueada; ciclo 4:3.",
    [
      "PR 160 \u2192 240 \u2192 280 ms",
      "Cuarta P bloqueada",
      "RR conducidos 880 \u2192 840 ms"
    ]
  ),
  p(
    "mobitz2",
    "BAV de segundo grado Mobitz II",
    "Mobitz II",
    "Conducci\xF3n AV",
    {
      av: "mobitz2",
      hr: 75,
      pr: 180,
      qrs: 140,
      conduction: "rbbb",
      variability: 0
    },
    "P\xE9rdida s\xFAbita de conducci\xF3n con PR constante en los latidos conducidos.",
    ["PR constante", "Una P bloqueada por grupo", "QRS ancho representativo"]
  ),
  p(
    "av21",
    "Bloqueo AV 2:1",
    "BAV 2:1",
    "Conducci\xF3n AV",
    { av: "two_one", hr: 80, pr: 180, variability: 0 },
    "Una de cada dos activaciones auriculares alcanza el ventr\xEDculo.",
    ["Dos P por cada QRS", "No permite clasificar Mobitz I/II por s\xED solo"]
  ),
  p(
    "highav",
    "Bloqueo AV de alto grado",
    "BAV alto grado",
    "Conducci\xF3n AV",
    { av: "high", hr: 90, pr: 180, variability: 0 },
    "Dos P consecutivas no conducidas entre latidos conducidos.",
    ["Conducci\xF3n 3:1 en este caso", "Bradicardia ventricular"]
  ),
  p(
    "complete",
    "BAV completo \xB7 escape de la uni\xF3n",
    "BAV completo",
    "Conducci\xF3n AV",
    {
      av: "complete",
      hr: 45,
      atrialRate: 85,
      escape: "junctional",
      variability: 0
    },
    "Relojes auricular y ventricular independientes.",
    [
      "P regulares m\xE1s r\xE1pidas que QRS",
      "Sin relaci\xF3n PR fija",
      "Escape estrecho"
    ]
  ),
  p(
    "complete_v",
    "BAV completo \xB7 escape ventricular",
    "Escape ventricular",
    "Conducci\xF3n AV",
    {
      av: "complete",
      hr: 30,
      atrialRate: 80,
      escape: "ventricular",
      qrs: 165,
      axis: -65,
      variability: 0
    },
    "Disociaci\xF3n AV con escape de origen ventricular.",
    ["Actividad auricular independiente", "QRS ancho a 30 lpm"]
  ),
  p(
    "rbbb",
    "Bloqueo completo de rama derecha",
    "BRD",
    "Conducci\xF3n intraventricular",
    { conduction: "rbbb", qrs: 150, axis: 35 },
    "Activaci\xF3n tard\xEDa del ventr\xEDculo derecho.",
    [
      "rSR\u2032 en V1",
      "S terminal ancha lateral",
      "QRS \u2265120 ms; T negativa derecha"
    ]
  ),
  p(
    "irbbb",
    "Bloqueo incompleto de rama derecha",
    "BRD incompleto",
    "Conducci\xF3n intraventricular",
    { conduction: "irbbb", qrs: 115, axis: 35 },
    "Retraso moderado de la activaci\xF3n ventricular derecha.",
    ["Morfolog\xEDa de BRD", "QRS configurado 115 ms (adulto)"]
  ),
  p(
    "lbbb",
    "Bloqueo completo de rama izquierda",
    "BRI",
    "Conducci\xF3n intraventricular",
    { conduction: "lbbb", qrs: 160, axis: -15, septalQ: false },
    "Activaci\xF3n ventricular izquierda retrasada y secuencia septal modificada.",
    [
      "QS/rS en V1",
      "R lateral ancha con muesca",
      "Repolarizaci\xF3n secundaria discordante"
    ]
  ),
  p(
    "lafb",
    "Hemibloqueo anterior izquierdo",
    "HBAI",
    "Conducci\xF3n intraventricular",
    { conduction: "lafb", qrs: 100, axis: -60 },
    "Rotaci\xF3n de la activaci\xF3n frontal hacia superior e izquierda.",
    ["Eje \u221245\xB0 a \u221290\xB0", "Predominio positivo I/aVL, negativo inferior"],
    "vectorial",
    "Reproduce eje; detalle qR/rS de todos los fasc\xEDculos es aproximado."
  ),
  p(
    "lpfb",
    "Hemibloqueo posterior izquierdo",
    "HBPI",
    "Conducci\xF3n intraventricular",
    { conduction: "lpfb", qrs: 100, axis: 120 },
    "Rotaci\xF3n de la activaci\xF3n frontal hacia inferior y derecha.",
    ["Desviaci\xF3n derecha del eje", "Excluir otras causas de eje derecho"],
    "vectorial",
    "Reproduce eje; no demuestra criterios cl\xEDnicos excluyentes de HBPI."
  ),
  p(
    "bifascicular",
    "BRD + hemibloqueo anterior izquierdo",
    "Bifascicular",
    "Conducci\xF3n intraventricular",
    { conduction: "rbbb_lafb", qrs: 150, axis: -60 },
    "Retraso de rama derecha y desviaci\xF3n izquierda de la activaci\xF3n.",
    ["Morfolog\xEDa BRD", "Eje izquierdo marcado"]
  ),
  p(
    "bifascicular_pr",
    "Bifascicular + BAV de primer grado",
    "Bifascicular + PR",
    "Conducci\xF3n intraventricular",
    { conduction: "rbbb_lafb", av: "first", qrs: 150, axis: -60, pr: 260 },
    "BRD, eje izquierdo y PR prolongado coexistentes.",
    [
      "BRD + HBAI",
      "PR prolongado",
      "El PR no localiza el retraso al fasc\xEDculo restante"
    ]
  ),
  p(
    "wpw",
    "Preexcitaci\xF3n ventricular",
    "WPW",
    "Conducci\xF3n intraventricular",
    { conduction: "wpw", pr: 100, qrs: 135 },
    "Adici\xF3n de una activaci\xF3n ventricular inicial lenta.",
    ["PR corto", "Ascenso inicial empastado", "QRS ancho"],
    "vectorial",
    "Delta aproximada; sin v\xEDas accesorias anat\xF3micas ni circuito AVRT."
  ),
  p(
    "inferior",
    "Lesi\xF3n inferior \xB7 predominio en III",
    "Inferior (CD)",
    "Isquemia y ST",
    { ischemia: "inferior_rca", st: 2 },
    "Vector de lesi\xF3n orientado hacia inferior y derecha.",
    [
      "ST\u2191 II, III y aVF, III >II",
      "ST\u2193 rec\xEDproco en I y aVL",
      "La arteria no se determina solo por ECG"
    ]
  ),
  p(
    "inferior_lcx",
    "Lesi\xF3n inferior \xB7 predominio en II",
    "Inferior (Cx)",
    "Isquemia y ST",
    { ischemia: "inferior_lcx", st: 2 },
    "Vector de lesi\xF3n inferior con mayor componente izquierdo.",
    ["ST\u2191 II \u2265III", "I isoel\xE9ctrica o elevada"]
  ),
  p(
    "anterior",
    "Lesi\xF3n anterior",
    "Anterior",
    "Isquemia y ST",
    { ischemia: "anterior", st: 2 },
    "Vector de lesi\xF3n dirigido hacia la pared anterior.",
    [
      "Elevaci\xF3n ST precordial anterior",
      "Repolarizaci\xF3n dependiente de la fase"
    ]
  ),
  p(
    "lateral",
    "Lesi\xF3n lateral",
    "Lateral",
    "Isquemia y ST",
    { ischemia: "lateral", st: 2 },
    "Vector de lesi\xF3n dirigido a la pared lateral.",
    ["ST\u2191 I, aVL y V5\u2013V6", "Descenso inferior rec\xEDproco"]
  ),
  p(
    "posterior",
    "Patr\xF3n de lesi\xF3n posterior",
    "Posterior",
    "Isquemia y ST",
    { ischemia: "posterior", st: 2 },
    "Representaci\xF3n especular anterior de una lesi\xF3n posterior.",
    ["ST\u2193 V1\u2013V3", "Aumento de R anterior"],
    "local",
    "Correcci\xF3n local de R; V7\u2013V9 pendientes."
  ),
  p(
    "rv_infarct",
    "Lesi\xF3n ventricular derecha",
    "Ventr\xEDculo derecho",
    "Isquemia y ST",
    { ischemia: "rv", st: 2 },
    "Vector de lesi\xF3n inferior y anterior derecho.",
    [
      "Elevaci\xF3n ST en V1 e inferiores",
      "Completar con derivaciones derechas en la pr\xE1ctica"
    ],
    "vectorial",
    "V3R\u2013V4R pendientes; no reproduce todos los criterios territoriales."
  ),
  p(
    "diffuse",
    "ST descendido difuso + aVR elevado",
    "ST difuso / aVR",
    "Isquemia y ST",
    { ischemia: "diffuse", st: 2 },
    "Vector de lesi\xF3n subendoc\xE1rdica global.",
    [
      "ST\u2193 en m\xFAltiples derivaciones",
      "ST\u2191 en aVR",
      "Patr\xF3n inespec\xEDfico de arteria y de infarto"
    ]
  ),
  p(
    "subendo",
    "Patr\xF3n de isquemia subendoc\xE1rdica",
    "Isquemia subendoc\xE1rdica",
    "Isquemia y ST",
    { ischemia: "subendo", st: 2, tAxis: -140 },
    "Alteraci\xF3n subendoc\xE1rdica de repolarizaci\xF3n.",
    [
      "Descenso ST",
      "Puede asociar T negativa",
      "El diagn\xF3stico de IAM requiere contexto y troponina"
    ]
  ),
  p(
    "wellens_a",
    "Patr\xF3n de Wellens \xB7 tipo A",
    "Wellens A",
    "Isquemia y ST",
    { ischemia: "wellens_a" },
    "Alteraci\xF3n regional de la onda T en precordiales anteriores.",
    ["T bif\xE1sica V2\u2013V3", "ST casi isoel\xE9ctrico"],
    "local"
  ),
  p(
    "wellens_b",
    "Patr\xF3n de Wellens \xB7 tipo B",
    "Wellens B",
    "Isquemia y ST",
    { ischemia: "wellens_b" },
    "Inversi\xF3n profunda y sim\xE9trica de T anterior.",
    ["T negativa V2\u2013V3", "Interpretaci\xF3n dependiente del contexto cl\xEDnico"],
    "local"
  ),
  p(
    "de_winter",
    "Patr\xF3n de de Winter",
    "De Winter",
    "Isquemia y ST",
    { ischemia: "de_winter" },
    "Representaci\xF3n de ST ascendente deprimido y T anterior prominente.",
    ["ST\u2193 ascendente precordial", "T altas y sim\xE9tricas"],
    "local",
    "No garantiza ST\u2191 en aVR; patr\xF3n parcial se\xF1alado como aproximado."
  ),
  p(
    "sgarbossa",
    "BRI con lesi\xF3n concordante",
    "Sgarbossa",
    "Isquemia y ST",
    {
      conduction: "lbbb",
      qrs: 160,
      axis: -15,
      ischemia: "sgarbossa",
      st: 3,
      septalQ: false
    },
    "Se a\xF1ade lesi\xF3n al BRI para explorar concordancia del ST.",
    ["QRS ancho tipo BRI", "ST positivo lateral concordante"],
    "vectorial",
    "Caso ilustrativo; sin c\xE1lculo autom\xE1tico de score ni ajuste de criterio proporcional."
  ),
  p(
    "pericarditis",
    "Patr\xF3n de pericarditis",
    "Pericarditis",
    "Isquemia y ST",
    { ischemia: "pericarditis", st: 1.5, stShape: "concave" },
    "Elevaci\xF3n extendida del ST y desviaci\xF3n opuesta del PR.",
    ["ST\u2191 c\xF3ncavo difuso", "PR\u2193 y PR\u2191 en aVR"],
    "local",
    "Dipolo \xFAnico no garantiza elevaci\xF3n en todas las derivaciones; no diagnostica pericarditis."
  ),
  p(
    "rv_acute",
    "Sobrecarga aguda del ventr\xEDculo derecho",
    "Sobrecarga VD aguda",
    "Sobrecarga",
    {
      overload: "rv_acute",
      hr: 110,
      axis: 110,
      conduction: "irbbb",
      qrs: 115,
      pAmp: 0.28
    },
    "Activaci\xF3n y repolarizaci\xF3n orientadas hacia ventr\xEDculo derecho.",
    ["Taquicardia y eje derecho", "BRD incompleto y T negativa derecha"],
    "vectorial",
    "No reproduce S1Q3T3 de forma consistente; ECG no confirma ni excluye TEP."
  ),
  p(
    "rv_chronic",
    "Hipertrofia del ventr\xEDculo derecho",
    "Hipertrofia VD",
    "Sobrecarga",
    { overload: "rv_chronic", axis: 115, pAmp: 0.3, qrsAmp: 1.2 },
    "Aumento de fuerzas anteriores derechas.",
    ["R dominante V1", "Eje derecho", "Alteraci\xF3n secundaria ST\u2013T"],
    "vectorial",
    "Criterios de voltaje individuales no validados; no modela anatom\xEDa real."
  ),
  p(
    "lvh",
    "Hipertrofia del ventr\xEDculo izquierdo",
    "Hipertrofia VI",
    "Sobrecarga",
    { overload: "lv", axis: 0, qrsAmp: 1.5, tAxis: 160 },
    "Aumento de fuerzas del ventr\xEDculo izquierdo.",
    ["Voltaje precordial aumentado", "Sobrecarga lateral"],
    "vectorial",
    "Los criterios Sokolow-Lyon/Cornell no se calculan autom\xE1ticamente."
  ),
  p(
    "aai",
    "Estimulaci\xF3n auricular AAI",
    "AAI",
    "Marcapasos",
    { rhythm: "paced", pacing: "AAI", hr: 60 },
    "Est\xEDmulos auriculares peri\xF3dicos con conducci\xF3n AV.",
    ["Espiga antes de P", "QRS intr\xEDnseco estrecho"],
    "vectorial",
    "Estimulaci\xF3n capturada a frecuencia fija; sensado, demanda y fallos pendientes."
  ),
  p(
    "vvi",
    "Estimulaci\xF3n ventricular VVI",
    "VVI",
    "Marcapasos",
    { rhythm: "paced", pacing: "VVI", hr: 60, qrs: 165, axis: -65 },
    "Estimulaci\xF3n ventricular representativa desde VD.",
    ["Espiga antes de QRS", "QRS ancho tipo BRI y eje superior"],
    "vectorial",
    "Estimulaci\xF3n capturada a frecuencia fija; sensado, demanda y fallos pendientes."
  ),
  p(
    "ddd",
    "Estimulaci\xF3n secuencial DDD",
    "DDD",
    "Marcapasos",
    { rhythm: "paced", pacing: "DDD", hr: 65, qrs: 160, axis: -65, pr: 180 },
    "Est\xEDmulos auricular y ventricular separados por intervalo AV.",
    ["Dos espigas por ciclo", "P seguida de QRS estimulado"],
    "vectorial",
    "Secuencia fija; no simula demanda, PVARP, seguimiento ni l\xEDmite superior."
  ),
  p(
    "hyperk",
    "Hiperpotasemia \xB7 T prominente",
    "Hiperpotasemia",
    "Otros patrones",
    { electrolyte: "hyperkalemia", qrs: 110, pAmp: 0.07 },
    "Aproximaci\xF3n morfol\xF3gica de T picuda y reducci\xF3n de P.",
    ["T altas y estrechas", "Disminuci\xF3n de P"],
    "vectorial",
    "Sin relaci\xF3n concentraci\xF3n\u2013ECG, ni evoluci\xF3n a onda sinusoidal."
  ),
  p(
    "hypok",
    "Hipopotasemia \xB7 onda U",
    "Hipopotasemia",
    "Otros patrones",
    { electrolyte: "hypokalemia", hr: 60 },
    "Reducci\xF3n de T y aparici\xF3n de U prominente.",
    ["T aplanada", "U prominente"],
    "vectorial",
    "El delineador puede confundir T y U; QT autom\xE1tico no fiable."
  ),
  p(
    "longqt",
    "QT prolongado",
    "QT largo",
    "Otros patrones",
    { qtc: 540, hr: 60, electrolyte: "longqt" },
    "Prolongaci\xF3n de la repolarizaci\xF3n ventricular.",
    ["QTc configurado 540 ms", "QT se adapta mediante Fridericia"]
  ),
  p(
    "shortqt",
    "QT corto",
    "QT corto",
    "Otros patrones",
    { qtc: 290, hr: 60, electrolyte: "shortqt" },
    "Acortamiento de la repolarizaci\xF3n ventricular.",
    ["QTc configurado 290 ms"]
  ),
  p(
    "lowvoltage",
    "Bajo voltaje",
    "Bajo voltaje",
    "Otros patrones",
    { electrolyte: "lowvoltage", qrsAmp: 0.7, pAmp: 0.08, tAmp: 0.15 },
    "Disminuci\xF3n de amplitudes sin alterar la secuencia de activaci\xF3n.",
    ["Complejos de baja amplitud"],
    "vectorial",
    "La etiolog\xEDa y la alternancia el\xE9ctrica no est\xE1n modeladas."
  ),
  ...[
    "Brugada tipo 1",
    "Hipotermia \xB7 onda de Osborn",
    "Efecto digit\xE1lico",
    "Alternancia el\xE9ctrica",
    "Dextrocardia"
  ].map(
    (name, i) => p(
      "pending_" + i,
      name,
      name,
      "Pendientes",
      {},
      "",
      [],
      "pending",
      "Requiere modelo morfol\xF3gico espec\xEDfico y criterios de aceptaci\xF3n adicionales."
    )
  )
];
function fromPreset(preset, view) {
  const c = cloneCase(DEFAULT_CASE);
  Object.assign(c, preset.patch);
  c.presetId = preset.id;
  c.name = preset.name;
  if (view) c.view = { ...view };
  return c;
}
var presetById = (id) => PRESETS.find((p2) => p2.id === id);

// src/engine/reference.ts
function referenceInWindow(signal, start = 0, end = 10) {
  const beats = signal.events.beats.filter(
    (b) => b.time >= start && b.time < end
  );
  const intervals = beats.slice(1).map((b, i) => b.time - beats[i].time);
  const prs = beats.flatMap((b) => b.pr === void 0 ? [] : [b.pr * 1e3]);
  const stablePR = prs.length && Math.max(...prs) - Math.min(...prs) < 1;
  return {
    ...signal.truth,
    hr: intervals.length ? 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0,
    pr: stablePR ? median(prs) : null,
    qrs: beats.length ? median(
      beats.flatMap((b) => b.qrs === void 0 ? [] : [b.qrs * 1e3])
    ) || null : null,
    qt: beats.length ? median(
      beats.flatMap((b) => b.qt === void 0 ? [] : [b.qt * 1e3])
    ) || null : null
  };
}
export {
  PRESETS,
  fromPreset,
  measure,
  presetById,
  referenceInWindow,
  synthesize
};
