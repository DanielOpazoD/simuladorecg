import type { ECGCase, EventSeries, Beat } from "./types";
import { random, normal } from "./random";
export function generateEvents(c: ECGCase, duration: number): EventSeries {
  const r = random(c.seed),
    events: EventSeries = { atria: [], beats: [], spikes: [] };
  const base = 60 / c.hr;
  let prev = -10;
  const beat = (time: number, kind: Beat["kind"] = "normal", pr?: number) => {
    if (time < duration) {
      events.beats.push({ time, kind, rr: prev > -5 ? time - prev : base, pr });
      prev = time;
    }
  };
  const p = (
    time: number,
    conducted = true,
    pr?: number,
    kind: "sinus" | "ectopic" | "retrograde" = "sinus",
  ) => events.atria.push({ time, conducted, pr, kind });
  if (c.rhythm === "vf" || c.rhythm === "asystole") return events;
  if (c.rhythm === "af") {
    let t = 0.35;
    while (t < duration) {
      beat(t);
      t +=
        base *
        Math.max(
          0.38,
          Math.min(
            2.15,
            0.8 + Math.exp(0.42 * normal(r)) * 0.2 + 0.38 * normal(r),
          ),
        );
    }
    return events;
  }
  if (c.rhythm === "flutter") {
    const ar = c.atrialRate,
      rr = (60 / ar) * c.flutterRatio;
    for (let t = 0.4; t < duration; t += rr) beat(t);
    return events;
  }
  if (
    c.rhythm === "idioventricular" ||
    c.rhythm === "vt" ||
    c.rhythm === "torsades"
  ) {
    for (let t = 0.45; t < duration; t += base) beat(t, "ventricular");
    if (c.rhythm === "vt")
      for (let t = 0.15; t < duration; t += 60 / c.atrialRate) p(t, false);
    return events;
  }
  if (c.rhythm === "junctional") {
    for (let t = 0.45; t < duration; t += base) {
      beat(t);
      p(t + 0.075, false, undefined, "retrograde");
    }
    return events;
  }
  if (c.rhythm === "paced") {
    for (let t = 0.45; t < duration; t += base) {
      if (c.pacing === "AAI") {
        events.spikes.push(t);
        p(t + 0.007, true, c.pr / 1000);
        beat(t + 0.007 + c.pr / 1000, "normal", c.pr / 1000);
      } else if (c.pacing === "VVI") {
        events.spikes.push(t);
        beat(t + 0.005, "paced");
      } else {
        events.spikes.push(t);
        p(t + 0.007, true, c.pr / 1000);
        events.spikes.push(t + 0.007 + c.pr / 1000 - 0.005);
        beat(t + 0.007 + c.pr / 1000, "paced", c.pr / 1000);
      }
    }
    return events;
  }
  if (c.av === "complete") {
    for (let t = 0.15; t < duration; t += 60 / c.atrialRate) p(t, false);
    for (let t = 0.53; t < duration; t += base)
      beat(t, c.escape === "ventricular" ? "ventricular" : "normal");
    return events;
  }
  let t = 0.22,
    k = 0;
  while (t < duration) {
    const respiratory = -Math.sin(((2 * Math.PI * c.respiratoryRate) / 60) * t),
      slow = Math.sin(2 * Math.PI * 0.1 * t + 0.3);
    const rr =
      base *
      (1 + c.variability * (0.8 * respiratory + 0.2 * slow + 0.1 * normal(r)));
    let pr = c.pr / 1000,
      conducted = true;
    if (c.av === "mobitz1") {
      const phase = k % 4;
      conducted = phase !== 3;
      pr += [0, 0.08, 0.12, 0][phase];
    }
    if (c.av === "mobitz2") conducted = k % 4 !== 3;
    if (c.av === "two_one") conducted = k % 2 === 0;
    if (c.av === "high") conducted = k % 3 === 0;
    p(t, conducted, conducted ? pr : undefined);
    if (conducted) beat(t + pr, "normal", pr);
    const ect = c.ectopy,
      trigger =
        conducted &&
        c.av === "normal" &&
        (ect === "bigeminy" ||
          (ect === "trigeminy" && k % 2 === 1) ||
          ((ect === "pvc" || ect === "pac" || ect === "couplet") &&
            k % 5 === 3));
    if (trigger) {
      const coupling = base * c.coupling;
      if (ect === "pac") {
        const early = t + coupling;
        p(early, true, pr * 0.9, "ectopic");
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
        p(next, false);
        next += base;
        while (next + pr - lastV < 0.24) {
          p(next, false);
          next += base;
        }
        t = next;
      }
    } else t += rr;
    k++;
  }
  return events;
}
