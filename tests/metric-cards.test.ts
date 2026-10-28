import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase, type ECGCase, type Measurement, type MetricKey, type Reliability } from "../src/engine/types";
import { concealMetricCards, metricCards, metricsHtml, monitorRate } from "../src/ui/metric-cards";

const measurement = (status: Partial<Record<MetricKey, Reliability>> = {}): Measurement => {
  const evidence = Object.fromEntries(
    (["hr", "pr", "qrs", "qt", "axis"] as const).map(k => [k, { status: status[k] ?? "usable", reason: `motivo ${k} <x>`, count: 10, total: 10, spread: 1 }]),
  ) as Measurement["evidence"];
  return {
    hr: 71.6, instantHr: 72, pr: 154.4, qrs: 92, qt: 380, axis: 55.2, pAxis: 50, tAxis: 40, rr: 833,
    qtc: { bazett: 410, fridericia: 401.7, framingham: 400, hodges: 399 },
    quality: "ok", beats: [], evidence, window: { start: 0, end: 10 }, detectedPeaks: [],
  };
};
const withCase = (patch: Partial<ECGCase>) => Object.assign(cloneCase(DEFAULT_CASE), patch);

describe("metricCards", () => {
  it("rounds values and keeps the measurement units", () => {
    const cards = metricCards(DEFAULT_CASE, measurement());
    expect(cards.map(x => x.value)).toEqual(["72<small>lpm</small>", "154<small>ms</small>", "92<small>ms</small>", "402<small>ms</small>", "55<small>°</small>"]);
    expect(cards.map(x => x.note)[0]).toBe("media · 10 s");
  });

  it("withholds every number without an organized ventricular rhythm", () => {
    const c = withCase({ rhythm: "vf" } as Partial<ECGCase>);
    expect(metricCards(c, measurement()).every(x => x.value === "—")).toBe(true);
    expect(monitorRate(c, measurement())).toBe("—");
  });

  it("does not report PR without an estimable AV relation", () => {
    const pr = (patch: Partial<ECGCase>) => metricCards(withCase(patch), measurement())[1];
    expect(pr({ av: "complete" } as Partial<ECGCase>)).toMatchObject({ value: "—", note: "No estimable", status: "unavailable" });
    expect(pr({ rhythm: "paced", pacing: "VVI" } as Partial<ECGCase>).value).toBe("—");
    expect(pr({ rhythm: "paced", pacing: "DDD" } as Partial<ECGCase>).value).toBe("154<small>ms</small>");
  });

  it("hides QTc for irregular or polymorphic rhythms", () => {
    for (const rhythm of ["af", "flutter", "torsades"])
      expect(metricCards(withCase({ rhythm } as Partial<ECGCase>), measurement())[3].value).toBe("—");
  });

  it("evidence status overrides the default note", () => {
    const cards = metricCards(DEFAULT_CASE, measurement({ hr: "unavailable", qrs: "review" }));
    expect(cards[0]).toMatchObject({ value: "—", note: "No estimable" });
    expect(cards[2]).toMatchObject({ value: "92<small>ms</small>", note: "Revisar" });
    expect(monitorRate(DEFAULT_CASE, measurement({ hr: "unavailable" }))).toBe("—");
    expect(monitorRate(DEFAULT_CASE, measurement())).toBe("72");
  });

  it("escapes the evidence reason in the button title", () => {
    expect(metricsHtml(metricCards(DEFAULT_CASE, measurement()))).toContain('title="motivo hr &lt;x&gt;"');
  });
});

describe('No apparent valid number without supporting evidence', () => {
  it.each(['hr', 'pr', 'qrs', 'qt', 'axis'] as const)('withholds retained %s when unavailable', key => {
    expect(metricCards(DEFAULT_CASE, measurement({ [key]: 'unavailable' })).find(c => c.key === key)?.value).toBe('—');
  });
  it.each([null, NaN, Infinity])('does not invent a monitor rate for %s', hr => {
    const m = measurement(); m.hr = hr;
    expect(monitorRate(DEFAULT_CASE, m)).toBe('—');
    expect(metricCards(DEFAULT_CASE, m)[0]).toMatchObject({ value: '—', status: 'unavailable', note: 'No estimable' });
  });
  it('does not label a suppressed physiological metric reproducible', () => {
    expect(metricCards(withCase({ av: 'complete' }), measurement())[1]).toMatchObject({ value: '—', status: 'unavailable' });
  });
  it('uses the measured time support instead of a hardcoded ten seconds', () => {
    const m=measurement(); m.window={start:2,end:7.5};
    expect(metricCards(DEFAULT_CASE,m)[0].note).toBe('media · 5.5 s');
  });
});

import { modelMetricCards } from "../src/ui/metric-cards";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById } from "../src/presets/catalog";
import { measurementsOverview } from '../src/ui/measurements-overview';
import { measurementDialog } from '../src/ui/measurement-dialog';
import { analyzeSamples } from '../src/engine/sample-analysis';

describe('the detail never restores a withdrawn estimate',()=>{
  const c=fromPreset(presetById('sinus')!),s=synthesize(c,10);
  const row=(html:string,label:string)=>html.split('</tbody>')[0].match(new RegExp(`<tr><td>${label}</td>(.*?)</tr>`))![1];
  it.each(['hr','pr','qrs','qt','axis'] as const)('keeps retained %s candidates out of the accepted table',key=>{
    const m=measurement({[key]:'unavailable'}),before=structuredClone(m);
    const html=measurementDialog(s,m,c);
    expect(row(html,{hr:'FC ventricular',pr:'PR',qrs:'QRS',qt:'QT',axis:'Eje QRS'}[key])).toMatch(/^<td><strong>—<\/strong><\/td>/);
    expect(row(html,{hr:'FC ventricular',pr:'PR',qrs:'QRS',qt:'QT',axis:'Eje QRS'}[key])).toContain('No estimable');
    expect(m).toEqual(before);
  });
  it('keeps AV and QTc restrictions consistent with the summary',()=>{
    expect(row(measurementDialog(s,measurement(),withCase({av:'complete'})),'PR')).toContain('<strong>—</strong>');
    const html=measurementDialog(s,measurement(),withCase({rhythm:'af'}));
    expect(html.split('<div class="qt-grid">')[1].split('</div>\n')[0]).not.toMatch(/<strong>\d/);
    expect(row(html,'QT')).toContain('<strong>380 ms</strong>');
  });
  it.each([NaN,Infinity,null])('does not present a non-finite interval (%s) as accepted',qrs=>{
    const m=measurement();m.qrs=qrs;
    expect(row(measurementDialog(s,m,c),'QRS')).toContain('No estimable');
  });
  it('preserves adverse candidates separately and flags review without changing its number',()=>{
    const m=analyzeSamples(s);m.evidence.qt.status='unavailable';m.evidence.qrs.status='review';
    const before=structuredClone(m),html=measurementDialog(s,m,c);
    expect(html).toContain('Salida cruda del detector, previa a la auditoría');
    expect(html.split('Límites candidatos por latido')[1]).toContain(`${m.beats[0].offset.toFixed(3)} s`);
    expect(row(html,'QRS')).toContain(`<strong>${Math.round(m.qrs!)} ms</strong>`);
    expect(row(html,'QRS')).toContain('Revisar');
    expect(html.split('<div class="qt-grid">')[1].split('</div>\n')[0]).not.toMatch(/<strong>\d/);
    expect(m).toEqual(before);
  });
});

describe('automatic measurement summary',()=>{
  const c=fromPreset(presetById('sinus')!),s=synthesize(c,10);
  const qtRow=(m:Measurement)=>measurementsOverview(s,m,c).split('</table>')[0].match(/<tr data-metric="qt"><th scope="row">QT<\/th>(.*?)<\/tr>/)![1];
  it('shows raw QT separately from corrected QTc using the measured value',()=>{
    expect(qtRow(measurement())).toContain('<td>380<small>ms</small></td>');
    expect(measurementsOverview(s,measurement(),c)).toContain('QTc<small>Fridericia</small>');
  });
  it('withdraws retained QT candidates without evidence',()=>{
    expect(qtRow(measurement({qt:'unavailable'}))).toContain('<td aria-label="No estimable">—</td>');
  });
  it('retains review status instead of presenting a flagged QT as reliable',()=>{
    expect(qtRow(measurement({qt:'review'}))).toContain('380<small>ms</small><small class="measurement-note">Revisar</small>');
  });
});

describe("modelMetricCards: el simulador muestra lo que generó", () => {
  const cards = (id: string) => {
    const c = fromPreset(presetById(id)!);
    return modelMetricCards(c, synthesize(c, 10));
  };
  it("sinusal: PR, QRS, QTc y eje programados, sin depender del analizador", () => {
    const [hr, pr, qrs, qtc, axis] = cards("sinus"), c = fromPreset(presetById("sinus")!);
    expect(Number.parseFloat(hr.value)).toBeGreaterThan(68);
    // The textbook patient's own values (F2.3), carried by the case controls.
    expect(pr.value).toBe(`${c.pr}<small>ms</small>`);
    expect(qrs.value).toBe(`${c.qrs}<small>ms</small>`);
    expect(Math.abs(Number.parseFloat(qtc.value) - c.qtc)).toBeLessThan(12);
    // The axis card states the axis the trace shows (measured), close to the patient's.
    expect(Math.abs(Number.parseFloat(axis.value) - c.axis)).toBeLessThan(6);
    expect([hr, pr, qrs, qtc, axis].every((x) => x.status === "usable" && x.note.startsWith("modelo"))).toBe(true);
  });
  it("Wenckebach: el PR es el rango progresivo, no «No estimable»", () => {
    const pr = cards("wenckebach")[1];
    expect(pr.value).toMatch(/^\d+–\d+<small>ms<\/small>$/);
    expect(pr.note).toBe("modelo · progresivo");
  });
  it("FV y BAV completo: sin PR; FV sin ningún número", () => {
    expect(cards("vf").every((x) => x.value === "—")).toBe(true);
    expect(cards("complete")[1].value).toBe("—");
  });
});

describe("concealMetricCards", () => {
  it("hides every value and its availability during practice", () => {
    const shown = metricCards(withCase({ av: "complete" } as Partial<ECGCase>), measurement({ qt: "review" }));
    const hidden = concealMetricCards(shown);
    expect(hidden.map(x => x.value)).toEqual(["?", "?", "?", "?", "?"]);
    expect(new Set(hidden.map(x => x.status))).toEqual(new Set(["usable"]));
    expect(hidden.every(x => x.note === "Oculto en práctica")).toBe(true);
    const html = metricsHtml(hidden);
    expect(html).not.toMatch(/\d{2,}|No estimable|Revisar/);
  });
  it("labels the strip as model values, visible without a tooltip", () => {
    const html = metricsHtml(metricCards(DEFAULT_CASE, measurement()));
    expect(html).toMatch(/<span class="metrics-source"[^>]*>Valores del modelo<\/span>$/);
    expect(html.match(/class="metric /g)).toHaveLength(5);
  });
});
