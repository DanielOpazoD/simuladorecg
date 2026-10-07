import { type Signal, type Measurement, type DelineatedBeat } from "./types";
import { suppressImpulses } from "./analysis/impulses";
import { detectVentricularCandidates } from "./analysis/ventricular-candidates";
import { axisFromLeads } from "./leads";
import {
  median,
  mad,
  spread,
  circularMedian,
  quantile,
  unwrapAngles,
} from "./analysis/statistics";
import { evidence, unavailable } from "./analysis/evidence";

/** A zero vector has no direction; atan2(0, 0) is only a language convention.
 * Exact zero only, with no voltage/area cutoff or clinical confidence claim.
 */
function observedFrontalDirection(first: number, second: number): number | null {
  return first === 0 && second === 0 ? null : axisFromLeads(first, second);
}

/**
 * Independent sample-domain analysis. No ECGCase, event calendar, or truth input.
 * All fiducials are seconds in the recording; summaries use exactly these beats.
 * Status expresses signal quality / repeatability, not clinical validation.
 */
export function measure(input: Pick<Signal, "fs" | "leads">): Measurement {
  const { signal: s, masks } = suppressImpulses(input);
  const fs = s.fs,
    n = Math.min(s.leads.I.length, Math.round(10 * fs));
  const names = ["I", "II", "V1", "V5"] as const;
  const slope = new Float64Array(n),
    energy = new Float64Array(n);
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
  // Morphology windows remain anchored to the original sample landmarks.
  // Refining the ventricular train must not silently move existing boundaries.
  const { peaks: ratePeaks, boundaryCandidates: peaks } = detectVentricularCandidates(input);
  const retained = new Set(ratePeaks);
  const nil: Measurement = {
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
    detectedPeaks: ratePeaks.map((p) => p / fs),
    window: { start: 0, end: n / fs },
    evidence: {
      hr: unavailable("No hay un ritmo ventricular delineable."),
      pr: unavailable("No hay asociación AV estable."),
      qrs: unavailable("Límites QRS no reconocibles."),
      qt: unavailable("Final de T no reconocible."),
      axis: unavailable("QRS no delineable."),
    },
  };
  if (
    ratePeaks.length < 3 ||
    quantile(Array.from(energy), 0.5) > quantile(Array.from(energy), 0.98) * 0.6
  )
    return nil;
  const intervals = ratePeaks.slice(1).map((p, i) => (p - ratePeaks[i]) / fs),
    rr = median(intervals);
  if (rr < 0.22 || rr > 3) return nil;
  // Rate refinement cannot authorize morphology rejected by the original train.
  // Keep rate-only recovery, but do not invent new interval delineations.
  const landmarkRr = median(peaks.slice(1).map((p, i) => (p - peaks[i]) / fs));
  const morphologyEligible = landmarkRr >= 0.22 && landmarkRr <= 3;
  const historicalWidths: number[] = [];
  const beats: DelineatedBeat[] = [],
    paxes: (number | null)[] = [],
    taxes: (number | null)[] = [];
  for (let k = 1; morphologyEligible && k < peaks.length - 1; k++) {
    const peak = peaks[k];
    let baseIndex = Math.max(8, peak - Math.round(0.22 * fs));
    for (let j = baseIndex; j < peak - Math.round(0.04 * fs); j++)
      if (energy[j] < energy[baseIndex]) baseIndex = j;
    const baseline = names.map((l) =>
      median(
        Array.from(
          s.leads[l].slice(
            Math.max(0, baseIndex - Math.round(0.016 * fs)),
            baseIndex + 1,
          ),
        ),
      ),
    );
    const postLo = Math.min(
      n - 2,
      peak + Math.round(Math.min(0.5, ((peaks[k + 1] - peak) / fs) * 0.5) * fs),
    );
    const postHi = Math.min(n - 1, peaks[k + 1] - Math.round(0.045 * fs));
    let postIndex = postLo;
    for (let j = postLo; j < postHi; j++)
      if (energy[j] < energy[postIndex]) postIndex = j;
    const postBaseline = names.map((l) =>
      median(
        Array.from(
          s.leads[l].slice(
            Math.max(0, postIndex - Math.round(0.008 * fs)),
            postIndex + 1,
          ),
        ),
      ),
    );
    const baseAt = (j: number, l: number) =>
      baseline[l] +
      (postBaseline[l] - baseline[l]) *
        Math.max(
          0,
          Math.min(1, (j - baseIndex) / Math.max(1, postIndex - baseIndex)),
        );
    const magnitude = (j: number) =>
      Math.sqrt(
        names.reduce(
          (sum, l, k) => sum + (s.leads[l][j] - baseAt(j, k)) ** 2,
          0,
        ),
      );
    // Robust high-frequency noise floor from the second difference, outside this QRS.
    const noiseSamples: number[] = [];
    for (
      let j = Math.max(2, peak - Math.round(0.3 * fs));
      j < peak - Math.round(0.06 * fs);
      j++
    ) {
      for (const lead of names)
        noiseSamples.push(
          Math.abs(
            s.leads[lead][j] - 2 * s.leads[lead][j - 1] + s.leads[lead][j - 2],
          ),
        );
    }
    const noise = median(noiseSamples) / 1.65;
    let amplitude = 0;
    for (
      let j = Math.max(0, peak - Math.round(0.16 * fs));
      j < Math.min(n, peak + Math.round(0.08 * fs));
      j++
    )
      amplitude = Math.max(amplitude, magnitude(j));
    // A centered derivative supplies boundaries without hard-coded millisecond offsets.
    // The quiet bridge keeps notches / plateaus inside a wide QRS together.
    const half = Math.max(1, Math.round(0.004 * fs));
    const derivative = (j: number) =>
      Math.sqrt(
        names.reduce((sum, lead) => {
          const lo = Math.max(0, j - half),
            hi = Math.min(n - 1, j + half);
          return (
            sum +
            (((s.leads[lead][hi] - s.leads[lead][lo]) * fs) / (hi - lo)) ** 2
          );
        }, 0),
      );
    const localSlopes: number[] = [];
    for (
      let j = Math.max(half, peak - Math.round(0.16 * fs));
      j < Math.min(n - half, peak + Math.round(0.18 * fs));
      j++
    )
      localSlopes.push(derivative(j));
    const maximumSlope = quantile(localSlopes, 0.9);
    const derivativeThreshold = Math.max(
      0.4,
      maximumSlope * 0.028,
      noise * fs * 0.9,
      quantile(localSlopes, 0.2) * 2.5,
    );
    const active = (j: number) => derivative(j) > derivativeThreshold;
    const left = Math.max(
        1,
        peak -
          Math.round(Math.min(0.28, ((peak - peaks[k - 1]) / fs) * 0.8) * fs),
      ),
      right = Math.min(n - 1, peak + Math.round(0.21 * fs)),
      quietSamples = Math.round(
        Math.min(0.04, ((peak - peaks[k - 1]) / fs) * 0.075) * fs,
      );
    let on = peak,
      off = peak,
      quiet = 0,
      neutral = 0;
    const neutralSamples = Math.max(1, Math.round(0.006 * fs));
    const atBaseline = (j: number) =>
      magnitude(j) < Math.max(0.008, noise * 5, amplitude * 0.08) &&
      derivative(j) < Math.max(derivativeThreshold, maximumSlope * 0.08);
    for (let j = peak; j > left; j--) {
      neutral = atBaseline(j) ? neutral + 1 : 0;
      if (neutral >= neutralSamples) {
        on = Math.max(on, j + neutral);
        break;
      }
      if (active(j)) {
        on = j;
        quiet = 0;
      } else if (++quiet >= quietSamples) break;
    }
    quiet = 0;
    neutral = 0;
    for (let j = peak; j < right; j++) {
      neutral = atBaseline(j) ? neutral + 1 : 0;
      if (neutral >= neutralSamples) {
        off = Math.min(off, j - neutral);
        break;
      }
      if (active(j)) {
        off = j;
        quiet = 0;
      } else if (++quiet >= quietSamples) break;
    }
    if (on <= left + 1 || off >= right - 1) continue;
    // Report the center of the derivative transition (sampling resolution applies).
    const width = (off - on) / fs,
      localRR = (peaks[k] - peaks[k - 1]) / fs;
    if (
      width < 0.04 ||
      width > 0.28 ||
      width > Math.min(localRR, (peaks[k + 1] - peak) / fs) * 0.75
    )
      continue;
    historicalWidths.push(width * 1000);
    if (!retained.has(peak)) continue;
    let ai = 0,
      aii = 0;
    for (let j = on; j < off; j++) {
      ai += s.leads.I[j] - baseAt(j, 0);
      aii += s.leads.II[j] - baseAt(j, 1);
    }
    const beat: DelineatedBeat = {
      peak: peak / fs,
      onset: on / fs,
      offset: off / fs,
      pOnset: null,
      pPeak: null,
      tPeak: null,
      tEnd: null,
      tTangentEnd: null,
      rr: (peak - ratePeaks[ratePeaks.indexOf(peak) - 1]) / fs,
      pr: null,
      qrs: width * 1000,
      qt: null,
      axis: observedFrontalDirection(ai, aii),
      noise,
    };
    const pLo = Math.max(
        0,
        on - Math.round(Math.min(0.32, localRR * 0.4) * fs),
      ),
      pHi = on - Math.round(0.035 * fs);
    let pp = pLo;
    for (let j = pLo; j < pHi; j++) if (magnitude(j) > magnitude(pp)) pp = j;
    const pAmplitude = magnitude(pp),
      pThreshold = Math.max(pAmplitude * 0.04, noise * 4, 0.003);
    if (
      pAmplitude > Math.max(0.045, noise * 10) &&
      pAmplitude < amplitude * 0.55
    ) {
      let po = pp;
      while (po > pLo && magnitude(po) > pThreshold) po--;
      if (po > pLo + 1 && pp - po > 0.012 * fs) {
        beat.pOnset = po / fs;
        beat.pPeak = pp / fs;
        beat.pr = ((on - po) / fs) * 1000;
        paxes.push(
          observedFrontalDirection(
            s.leads.I[pp] - baseline[0],
            s.leads.II[pp] - baseline[1],
          ),
        );
      }
    }
    const tLo = off + Math.round(0.04 * fs),
      nextOn = peaks[k + 1] - Math.round(0.12 * fs);
    const tHi = Math.min(
      n - 1,
      nextOn,
      on + Math.round(Math.min(0.95, localRR * 0.82) * fs),
    );
    let tp = tLo,
      te = tLo,
      quietT = 0,
      started = false,
      lastActive = tLo;
    const minimumT = Math.max(0.012, noise * 6),
      quietTNeeded = Math.round(0.04 * fs);
    for (let j = tLo; j < tHi; j++) {
      const value = magnitude(j);
      if (!started && value > minimumT) started = true;
      if (!started) continue;
      if (value > magnitude(tp)) tp = j;
      const returnThreshold = Math.max(magnitude(tp) * 0.025, noise * 4, 0.004);
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
    // A visible peak is evidence, not a QT measurement. Preserve it even when
    // the independent terminal-return condition below cannot close the wave.
    if (started && tp > tLo + 3 && tAmplitude > Math.max(0.05, noise * 12))
      beat.tPeak = tp / fs;
    if (te > tp && tp > tLo + 3 && tAmplitude > Math.max(0.05, noise * 12)) {
      beat.tPeak = tp / fs;
      beat.tEnd = te / fs;
      beat.qt = ((te - on) / fs) * 1000;
      taxes.push(
        observedFrontalDirection(
          s.leads.I[tp] - baseline[0],
          s.leads.II[tp] - baseline[1],
        ),
      );
      // Tangent to the steepest terminal descent, after the last lobe's peak.
      let terminalPeak = tp;
      for (let j = tp + 1; j < te - 1; j++)
        if (
          magnitude(j) > tAmplitude * 0.15 &&
          magnitude(j) >= magnitude(j - 1) &&
          magnitude(j) > magnitude(j + 1)
        )
          terminalPeak = j;
      const half = Math.max(1, Math.round(0.008 * fs));
      let steepest = 0,
        steepestIndex = terminalPeak,
        tangent: number | null = null;
      for (let j = terminalPeak + half; j < te - half; j++) {
        const derivative =
          (magnitude(j + half) - magnitude(j - half)) / ((2 * half) / fs);
        if (derivative < steepest) {
          steepest = derivative;
          steepestIndex = j;
          tangent = j / fs - magnitude(j) / derivative;
        }
      }
      if (
        tangent !== null &&
        tangent > terminalPeak / fs &&
        tangent <= te / fs + 0.04
      )
        beat.tTangentEnd = tangent;
      // A causal high-pass can leave a slowly recovering offset after T. Do not
      // call that tail repolarization: require terminal slope to remain quiet.
      let slopeQuiet = 0;
      for (
        let j = steepestIndex + half;
        j < Math.min(tHi - half, te + Math.round(0.04 * fs));
        j++
      ) {
        const d =
          (magnitude(j + half) - magnitude(j - half)) / ((2 * half) / fs);
        if (
          Math.abs(d) < Math.max(0.04, Math.abs(steepest) * 0.08) &&
          magnitude(j) < tAmplitude * 0.15
        )
          slopeQuiet++;
        else slopeQuiet = 0;
        if (slopeQuiet >= Math.round(0.024 * fs)) {
          const slopeEnd = (j - slopeQuiet + 1) / fs;
          if (slopeEnd > terminalPeak / fs && slopeEnd < beat.tEnd!) {
            beat.tEnd = slopeEnd;
            beat.qt = (slopeEnd - beat.onset) * 1000;
          }
          break;
        }
      }
    }
    beats.push(beat);
  }
  if (beats.length < 3 || beats.length < (ratePeaks.length - 2) * 0.45) {
    if (ratePeaks.length >= 4) {
      const hr = 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length);
      return {
        ...nil,
        beats,
        hr,
        instantHr: 60 / intervals.at(-1)!,
        rr,
        quality: "Ritmo detectado; ondas superpuestas o límites no separables.",
        evidence: {
          ...nil.evidence,
          hr: {
            ...evidence(
              intervals,
              intervals.length,
              Infinity,
              "Frecuencia repetible; intervalos no delineables.",
            ),
            status: "review",
          },
        },
      };
    }
    return { ...nil, beats };
  }
  const widths = beats.map((b) => b.qrs),
    prs = beats.flatMap((b) => (b.pr === null ? [] : [b.pr])),
    qts = beats.flatMap((b) => (b.qt === null ? [] : [b.qt]));
  const axes = beats.flatMap(b => b.axis === null ? [] : [b.axis]);
  const pm = median(prs),
    consistent =
      prs.length >= Math.max(3, beats.length * 0.65) &&
      pm >= 80 &&
      pm <= 400 &&
      mad(prs) < 12 &&
      spread(prs) < 35;
  const regular = mad(intervals) < rr * 0.05 && spread(intervals) < rr * 0.16;
  const noise = median(beats.map((b) => b.noise)),
    noisy = noise > 0.015;
  const hr = 60 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
    qrs = median(widths),
    qt =
      regular && !noisy && qts.length >= beats.length * 0.6
        ? median(qts) || null
        : null;
  const pr = consistent && !noisy ? pm : null,
    q = qt === null ? null : qt / 1000;
  const eligible = peaks.slice(1,-1).filter(p=>retained.has(p)).length;
  const ev = {
    hr: evidence(
      intervals,
      intervals.length,
      Infinity,
      "Frecuencia media entre complejos detectados.",
    ),
    pr:
      pr === null
        ? unavailable(
            noisy
              ? "Ruido: inicio de P no fiable."
              : "P no reconocible o sin relación AV estable.",
            eligible,
          )
        : evidence(prs, eligible, 20, "Inicio de P y QRS reproducibles."),
    qrs: evidence(widths, eligible, 16, "Límites QRS reproducibles."),
    qt:
      qt === null
        ? unavailable(
            !regular
              ? "RR irregular: no se resume QT/QTc."
              : noisy
                ? "Ruido: final de T no fiable."
                : "T superpuesta, débil o sin retorno claro.",
            eligible,
          )
        : evidence(
            qts,
            eligible,
            24,
            "Retorno de amplitud o pendiente terminal; revisa T/U.",
          ),
    axis: axes.length ? evidence(
      unwrapAngles(axes),
      eligible,
      12,
      "Eje de área neta entre límites QRS.",
    ) : unavailable("Áreas QRS de I y II nulas: no definen dirección frontal. La actividad P/T no aporta un eje QRS ni equivale a 0°.", eligible),
  };
  if (axes.length > 0 && axes.length < beats.length) {
    ev.axis.status = "review";
    ev.axis.reason = "Algunos QRS carecen de área frontal neta: el resumen usa solo direcciones observables; revisa los complejos individualmente.";
  }
  // A removed impulse can hide the true activation onset; preserve that uncertainty.
  const nearImpulse = (t: number | null) =>
    t !== null && masks.some((r) => t >= r.start - 0.008 && t <= r.end + 0.016);
  const qrsNearImpulse = beats.some(
    (b) => nearImpulse(b.onset) || nearImpulse(b.offset),
  );
  for (const [key, affected] of [
    ["qrs", qrsNearImpulse],
    ["pr", qrsNearImpulse || beats.some((b) => nearImpulse(b.pOnset))],
    ["qt", qrsNearImpulse || beats.some((b) => nearImpulse(b.tEnd))],
  ] as const) {
    if (affected && ev[key].status !== "unavailable") {
      ev[key].status = "review";
      ev[key].reason =
        "Límite próximo a un estímulo breve suprimido en la copia de análisis; verifica con calibres.";
    }
  }
  if (pr !== null && qt === null) {
    ev.pr.status = "review";
    ev.pr.reason =
      "No se separa la T: la onda atribuida a P podría ser repolarización previa.";
  }
  // Dropping candidate waves can shrink width dispersion without fixing the
  // underlying boundary estimator. Do not promote QRS precision for that reason.
  const priorQrsSupport = evidence(historicalWidths, peaks.length - 2, 16, "Límites QRS reproducibles.");
  if (ev.qrs.status === "usable" && priorQrsSupport.status !== "usable") {
    ev.qrs.status = "review";
    ev.qrs.reason = "La selección QRS/T cambió el conjunto de límites; la precisión QRS previa aún requiere revisión.";
  }
  // Removing some smooth post-complex candidates is not proof that every
  // remaining short interval is a ventricular activation. Preserve ambiguity.
  if (ratePeaks.length < peaks.length && intervals.some(value => value < rr * 0.75)) {
    ev.hr.status = "review";
    ev.hr.reason = "Persisten intervalos cortos después de discriminar candidatos QRS/T; verifica el conteo con calibres.";
  }
  if (noisy) {
    ev.qrs.status = "review";
    ev.qrs.reason = "Ruido elevado: revisa manualmente los límites.";
    ev.hr.status = "review";
    ev.hr.reason = "El ruido puede producir detecciones falsas.";
    if (ev.axis.status !== "unavailable") ev.axis.status = "review";
  }
  return {
    hr,
    instantHr: 60 / (intervals.at(-1) || rr),
    rr,
    pr,
    qrs,
    qt,
    axis: axes.length ? circularMedian(axes) : null,
    pAxis: pr !== null && paxes.length && paxes.every(a => a !== null) ? circularMedian(paxes) : null,
    tAxis: qt !== null && taxes.length && taxes.every(a => a !== null) ? circularMedian(taxes) : null,
    qtc: {
      bazett: q === null ? null : (q / Math.sqrt(rr)) * 1000,
      fridericia: q === null ? null : (q / Math.cbrt(rr)) * 1000,
      framingham: q === null ? null : (q + 0.154 * (1 - rr)) * 1000,
      hodges: qt === null ? null : qt + 1.75 * (hr - 60),
    },
    quality:
      "Análisis de muestras · primeros 10 s · los límites y las cifras comparten el mismo delineador.",
    beats,
    evidence: ev,
    window: { start: 0, end: n / fs },
    detectedPeaks: ratePeaks.map((p) => p / fs),
  };
}
