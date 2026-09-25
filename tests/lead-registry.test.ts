import { describe, expect, it } from "vitest";
import { LEADS, INDEPENDENT, PRECORDIAL_LEADS, LEAD_REGISTRY, orderedLeads, displayPolarity, leadGain } from "../src/engine/lead-registry";
import { project, makeArrays } from "../src/engine/leads";
import { DEFAULT_CASE, cloneCase, type ECGCase } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { paperLayout, renderPaper, renderRhythm, Monitor } from "../src/render/ecg";

// Independent expectations: do not derive the oracle from the registry under test.
const physical = ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"];
const cabrera = ["aVL","I","aVR","II","aVF","III","V1","V2","V3","V4","V5","V6"];
const formats: ECGCase["view"]["format"][] = ["3x4","3x4+1","3x4+3","6x2","12x1"];
function canvas() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (o,k) => (o as any)[k] ?? noop, set: (o,k,v) => { (o as any)[k]=v; return true; } });
  return { width: 0, height: 0, style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement;
}
describe("Physical lead registry and display contracts", () => {
  it("defines exactly twelve channels, eight sources and unchanged order", () => {
    expect(LEADS).toEqual(physical);
    expect(INDEPENDENT).toEqual(["I","II","V1","V2","V3","V4","V5","V6"]);
    expect(PRECORDIAL_LEADS).toEqual(["V1","V2","V3","V4","V5","V6"]);
    expect(orderedLeads(true)).toEqual(cabrera);
    expect(Object.keys(makeArrays(2))).toEqual(physical);
    expect(LEADS.includes("V4R" as any)).toBe(false);
  });
  it("preserves the forward projection and signed electrical identities", () => {
    const expected = [[.632,-.235,.059],[.235,1.066,-.132],[-.515,.157,-.917],[.044,.164,-1.387],[.882,.098,-1.277],[1.213,.127,-.601],[1.125,.127,-.086],[.831,.076,.230]];
    for (const v of [[1,0,0],[0,1,0],[0,0,1],[.3,-.7,.9]] as [number,number,number][]) {
      const a = project(v);
      INDEPENDENT.forEach((l,i) => expect(a[l]).toBe(expected[i].reduce((s,x,j) => s+x*v[j],0)));
      expect(Math.abs(a.III-a.II+a.I)).toBeLessThan(1e-9);
      expect(Math.abs(a.aVR+(a.I+a.II)/2)).toBeLessThan(1e-9);
      expect(Math.abs(a.aVL-a.I+a.II/2)).toBeLessThan(1e-9);
      expect(Math.abs(a.aVF-a.II+a.I/2)).toBeLessThan(1e-9);
    }
  });
  it("selects gain by physical group and negates only displayed aVR", () => {
    for (const l of LEADS) {
      expect(leadGain(l,{gain:5,chestGain:20})).toBe(physical.indexOf(l)<6?5:20);
      expect(displayPolarity(l,true)).toBe(l==='aVR'?-1:1);
      expect(displayPolarity(l,false)).toBe(1);
    }
  });
  for (const format of formats) for (const inverted of [false,true])
    it(`${format}, Cabrera=${inverted}: layout and render leave all samples unchanged`, () => {
      const c=cloneCase(DEFAULT_CASE); c.view.format=format; c.view.cabrera=inverted;
      c.view.chestGain=20;c.view.gain=5;
      const s=synthesize(c,10), copies=Object.fromEntries(LEADS.map(l=>[l,s.leads[l].slice()]));
      const layout=paperLayout(c,900);
      expect(layout.segments.slice(0,12).map(x=>x.lead)).toEqual(inverted?cabrera:physical);
      for (const seg of layout.segments.slice(0,12)) expect(seg.polarity).toBe(inverted&&seg.lead==='aVR'?-1:1);
      renderPaper(canvas(),s,c,900,{ratio:1});
      for (const l of LEADS) expect(s.leads[l]).toEqual(copies[l]);
    });
});
