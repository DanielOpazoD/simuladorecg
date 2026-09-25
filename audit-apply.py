from pathlib import Path

def write(p, text):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(text)
def replace(p, old, new):
    s=Path(p).read_text()
    assert old in s, (p, old[:100])
    Path(p).write_text(s.replace(old,new))

write('src/engine/lead-registry.ts', '''/** Physical channels only. Display order/sign never changes stored samples.
 * Dower coefficients and iteration order are unchanged from v1.4.0.
 * The four augmented/derived limb channels are computed in leads.ts.
 */
export const LEAD_REGISTRY = {
  I:   { group: "limb", source: "independent", projection: [0.632, -0.235, 0.059], cabreraRank: 1, cabreraPolarity: 1 },
  II:  { group: "limb", source: "independent", projection: [0.235, 1.066, -0.132], cabreraRank: 3, cabreraPolarity: 1 },
  III: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 5, cabreraPolarity: 1 },
  aVR: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 2, cabreraPolarity: -1 },
  aVL: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 0, cabreraPolarity: 1 },
  aVF: { group: "limb", source: "derived", from: ["I", "II"], cabreraRank: 4, cabreraPolarity: 1 },
  V1:  { group: "chest", source: "independent", projection: [-0.515, 0.157, -0.917], cabreraRank: 6, cabreraPolarity: 1 },
  V2:  { group: "chest", source: "independent", projection: [0.044, 0.164, -1.387], cabreraRank: 7, cabreraPolarity: 1 },
  V3:  { group: "chest", source: "independent", projection: [0.882, 0.098, -1.277], cabreraRank: 8, cabreraPolarity: 1 },
  V4:  { group: "chest", source: "independent", projection: [1.213, 0.127, -0.601], cabreraRank: 9, cabreraPolarity: 1 },
  V5:  { group: "chest", source: "independent", projection: [1.125, 0.127, -0.086], cabreraRank: 10, cabreraPolarity: 1 },
  V6:  { group: "chest", source: "independent", projection: [0.831, 0.076, 0.230], cabreraRank: 11, cabreraPolarity: 1 },
} as const;
export type Lead = keyof typeof LEAD_REGISTRY;
export type IndependentLead = {
  [L in Lead]: typeof LEAD_REGISTRY[L]["source"] extends "independent" ? L : never
}[Lead];
// Object insertion order is the explicit standard acquisition/display order.
export const LEADS: readonly Lead[] = Object.freeze(Object.keys(LEAD_REGISTRY) as Lead[]);
export const INDEPENDENT: readonly IndependentLead[] = Object.freeze(
  LEADS.filter((lead): lead is IndependentLead => LEAD_REGISTRY[lead].source === "independent"),
);
export const PRECORDIAL_LEADS: readonly Lead[] = Object.freeze(
  LEADS.filter(lead => LEAD_REGISTRY[lead].group === "chest"),
);
const CABRERA_LEADS: readonly Lead[] = Object.freeze(
  [...LEADS].sort((a, b) => LEAD_REGISTRY[a].cabreraRank - LEAD_REGISTRY[b].cabreraRank),
);
export function orderedLeads(cabrera = false): readonly Lead[] {
  return cabrera ? CABRERA_LEADS : LEADS;
}
export function displayPolarity(lead: Lead, cabrera = false): 1 | -1 {
  return cabrera ? LEAD_REGISTRY[lead].cabreraPolarity : 1;
}
export function leadGain(lead: Lead, view: { gain: number; chestGain: number }): number {
  return LEAD_REGISTRY[lead].group === "chest" ? view.chestGain : view.gain;
}
''')
p='src/engine/types.ts'; s=Path(p).read_text(); end=s.index('export type Rhythm')
write(p,'import { LEADS, type Lead } from "./lead-registry";\nexport { LEADS, type Lead } from "./lead-registry";\n'+s[end:])
p='src/engine/leads.ts'; s=Path(p).read_text(); end=s.index('export function dot')
write(p,'''import { LEADS, LEAD_REGISTRY, INDEPENDENT, type Lead, type IndependentLead } from "./lead-registry";
export { INDEPENDENT } from "./lead-registry";
export type Vec = [number, number, number];
/** Forward Dower projection from the physical-channel registry. */
export const DOWER = Object.fromEntries(INDEPENDENT.map(lead =>
  [lead, [...LEAD_REGISTRY[lead].projection]],
)) as Record<IndependentLead, Vec>;
'''+s[end:])
p='src/engine/regional-repolarization.ts'
replace(p,"type SourceLead = 'I' | 'II' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';",'import type { IndependentLead as SourceLead } from "./lead-registry";')
p='src/engine/signal.ts'
s=Path(p).read_text(); write(p,'import { PRECORDIAL_LEADS } from "./lead-registry";\n'+s)
replace(p,'["V1", "V2", "V3", "V4", "V5", "V6"] as Lead[]','PRECORDIAL_LEADS')
p='src/render/ecg.ts'
s=Path(p).read_text();write(p,'import { orderedLeads, displayPolarity, leadGain } from "../engine/lead-registry";\n'+s)
replace(p,'''  const limb = c.view.cabrera
    ? ["aVL", "I", "aVR", "II", "aVF", "III"]
    : ["I", "II", "III", "aVR", "aVL", "aVF"];
  const leads = [...limb, "V1", "V2", "V3", "V4", "V5", "V6"] as Lead[];''','  const leads = orderedLeads(c.view.cabrera);')
replace(p,'c.view.cabrera && lead === "aVR" ? -1 : 1','displayPolarity(lead, c.view.cabrera)')
for exp,rep in [('seg.lead.startsWith("V") ? c.view.chestGain : c.view.gain','leadGain(seg.lead, c.view)'),('c.view.lead.startsWith("V") ? c.view.chestGain : c.view.gain','leadGain(c.view.lead, c.view)'),('lead.startsWith("V") ? c.view.chestGain : c.view.gain','leadGain(lead, c.view)')]:
    replace(p,exp,rep)
write('tests/lead-registry.test.ts', '''import { describe, expect, it } from "vitest";
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
''')
write('docs/p7-lead-registry.md', '''# P7 · Registro de las doce derivaciones existentes

`src/engine/lead-registry.ts` es la fuente de nombres físicos, orden estándar,
orden/signo de Cabrera, grupo de ganancia, origen independiente/derivado y filas
Dower. `types.ts` reexporta sus nombres/tipos; el catálogo y los casos JSON no cambian.
El registro no añade V4R ni V7–V9 ni convierte una corrección local en una proyección
anatómica calibrada. Las fórmulas eléctricas conservan su orden de operaciones.

## Contrato de aceptación

- Muestras, eventos, parámetros y semillas intactos. La comparación histórica
  de CI conserva exactamente los 61 presets predeterminados en doce derivaciones.
- Matriz de proyección contrastada con constantes independientes del registro;
  identidades de Einthoven/Goldberger con error absoluto <1e-9 mV, no precisión clínica.
- Cinco formatos, dos órdenes, grupo precordial con ganancia distinta. Renderizar
  no muta las muestras. Cabrera muestra −aVR; no invierte aVR almacenada.
- Los controles obtienen la lista por la reexportación de LEADS; no hay controles nuevos.

Las listas de I/II/V1/V5 del analizador y las derivaciones diana de un fenotipo
permanecen explícitas: son selecciones de análisis/morfología, no catálogos
alternativos de canales. Los oráculos de pruebas conservan listas independientes
para poder detectar errores en el propio registro. No se cambian detector ni filtros.
''')
p='tests/browser-fidelity.mjs'
replace(p," await page.screenshot({path:path.join(out,'desktop.png')});",''' await page.screenshot({path:path.join(out,'desktop.png')});
 // P7 uses real controls on the compiled product; sample invariance is tested in Node.
 for (const format of ['3x4','3x4+1','3x4+3','6x2','12x1']) {
  await page.locator('[data-key="view.format"]').selectOption(format);
  assert.ok(await page.locator('#ecg').evaluate(c=>c.width>0&&c.height>0));
 }
 await page.locator('[data-key="view.format"]').selectOption('3x4+1');
 await page.locator('[data-panel="signal"]').click();
 await page.locator('[data-key="view.cabrera"]').check();
 await page.screenshot({path:path.join(out,'p7-cabrera.png')});
 await page.locator('[data-key="view.cabrera"]').uncheck();
 await page.locator('[data-mode="monitor"]').click();
 for (const lead of ['II','V1','aVR']) {
  await page.locator('[data-key="view.lead"]').selectOption(lead);
  assert.match(await page.locator('#ecg').getAttribute('aria-label'),new RegExp(lead));
 }
 await page.locator('[data-mode="paper"]').click();
 checks.push('P7: five paper formats, Cabrera and physical monitor lead selection');''')
