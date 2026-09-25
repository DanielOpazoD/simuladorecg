import { describe, it, expect } from "vitest";
import { DEFAULT_CASE, cloneCase, normalizeCase, LEADS, type Beat, type ECGCase, type Lead } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { generateEvents } from "../src/engine/rhythm";
import { qrsKernels, qrsDuration, lesionVector, tVector } from "../src/engine/morphology";
import { ventricularSource, VENTRICULAR_SOURCES, type VentricularSourceId } from "../src/engine/ventricular-source";
import { normalizeImportedCase, caseContext } from "../src/presets/case-context";
import { fromPreset, presetById } from "../src/presets/catalog";

// Oracles chosen BEFORE snapshots: illustrative profiles, not population limits.
const ids: VentricularSourceId[] = ["rv_apical_pacing", "ventricular_escape", "representative_pvc", "representative_vt"];
const axes = [-65, 20, 75, -110];
const setup = (id: VentricularSourceId): ECGCase => ({ ...cloneCase(DEFAULT_CASE),
  rhythm: "idioventricular", ventricularSource: id, hr: 60, pAmp: 0,
  qrs: 160, variability: 0, filter: "off" });
const mean = (a: readonly number[]) => a.reduce((x,y)=>x+y,0)/a.length;
const degrees = (i: number, ii: number) => Math.atan2((2*ii-i)/Math.sqrt(3),i)*180/Math.PI;

describe("Ventricular source is independent of rhythm classification", () => {
  it.each(ids)("%s shares QRS/T for PVC, VT/escape and pacing when source is explicit", id => {
    const c=setup(id), normal: Beat={time:1,kind:"normal",rr:1};
    const kinds: Beat["kind"][]=["pvc","ventricular","paced"];
    const first={...normal,kind:kinds[0]};
    for(const kind of kinds){const b={...normal,kind};
      expect(qrsKernels(c,b)).toEqual(qrsKernels(c,first));
      expect(tVector(c,b)).toEqual(tVector(c,first));
      expect(qrsDuration(c,b)).toBe(.16);
    }
    expect(ventricularSource(c,normal)).toBeNull();
    expect(qrsKernels(c,normal)).toEqual(qrsKernels({...c,ventricularSource:"auto"},normal));
  });
  it.each(ids)("%s preserves all atrial, QRS/QT and spike times", id => {
    for(const preset of ["pvc","vt","complete_v","vvi","ddd"]){
      const c=fromPreset(presetById(preset)!);
      expect(generateEvents({...c,ventricularSource:id},12)).toEqual(generateEvents(c,12));
      const a=synthesize(c,10),b=synthesize({...c,ventricularSource:id},10);
      expect(b.events).toEqual(a.events);
      expect(lesionVector({...c,ventricularSource:id})).toEqual(lesionVector(c));
    }
  });
  it.each(ids)("%s: acceptance reads samples, not the analyzer or profile constants", id => {
    const c=setup(id), s=synthesize(c,10),b=s.events.beats.find(b=>b.time>2)!;
    const q=(lead:Lead)=>Array.from(s.leads[lead].slice(Math.ceil(b.time*s.fs),Math.floor((b.time+.148)*s.fs)));
    expect(b.qrs! * 1000).toBe(160);
    expect(Math.abs(degrees(mean(q("I")),mean(q("II")))-axes[ids.indexOf(id)])).toBeLessThan(2);
    const expectations: Record<VentricularSourceId,[number,number,number]>={
      rv_apical_pacing:[1,-1,1], ventricular_escape:[1,-1,1],
      representative_pvc:[1,-1,1], representative_vt:[-1,1,-1],
    };
    ["I","V1","V6"].forEach((lead,k)=>expect(mean(q(lead as Lead))*expectations[id][k]).toBeGreaterThan(.02));
    // Derivative activity span, not an automated clinical QRS boundary. A raw
    // amplitude threshold would erroneously include the secondary ST plateau.
    const mag=Array.from({length:100},(_,i)=>Math.hypot(...["I","II","V1","V6"].map(l=>{
      const a=s.leads[l as Lead],j=Math.round(b.time*s.fs)+i;return a[j+1]-a[j-1];
    })));
    const peak=Math.max(...mag),active=mag.map((v,i)=>v>peak*.02?i:-1).filter(i=>i>=0);
    const supportMs=(active.at(-1)!-active[0])/s.fs*1000;
    expect(supportMs).toBeGreaterThanOrEqual(140);expect(supportMs).toBeLessThanOrEqual(178);
    const repeated=synthesize(c,10);for(const lead of LEADS)expect(repeated.leads[lead]).toEqual(s.leads[lead]);
  });
  it("four profiles are distinct on sampled I, V1 and V6",()=>{
    const signals=ids.map(id=>synthesize(setup(id),10));
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)for(const lead of ["I","V1","V6"] as const){
      const x=signals[a].leads[lead],y=signals[b].leads[lead];
      const difference=Math.max(...Array.from(x,(v,i)=>Math.abs(v-y[i])));
      expect(difference,`${ids[a]} / ${ids[b]} ${lead}`).toBeGreaterThan(.03);
    }
  });
  it.each(["off","diagnostic","monitor"] as const)("preserves limb identities and inversion with %s filter",filter=>{
    const c=setup("representative_vt");c.filter=filter;c.artifacts.muscle=.1;
    const s=synthesize(c,10),r=synthesize({...c,artifacts:{...c.artifacts,reversed:true}},10);
    for(let i=0;i<s.leads.I.length;i+=7){const a=s.leads.I[i],b=s.leads.II[i];
      expect(Math.abs(s.leads.III[i]-(b-a))).toBeLessThan(1e-9);
      expect(Math.abs(s.leads.aVR[i]+(a+b)/2)).toBeLessThan(1e-9);
      expect(Math.abs(s.leads.aVL[i]-(a-b/2))).toBeLessThan(1e-9);
      expect(Math.abs(s.leads.aVF[i]-(b-a/2))).toBeLessThan(1e-9);
      expect(r.leads.II[i]).toBe(s.leads.III[i]);expect(r.leads.V1[i]).toBe(s.leads.V1[i]);
    }
  });
  it("defaults select examples, while an explicit source survives import as a custom case",()=>{
    expect(ventricularSource(setup("representative_pvc"),{kind:"paced"})?.id).toBe("representative_pvc");
    for(const [id,source] of [["pvc","representative_pvc"],["vt","representative_vt"],["complete_v","ventricular_escape"],["vvi","rv_apical_pacing"]]){
      const c=fromPreset(presetById(id)!);const beat=synthesize(c,10).events.beats.find(b=>b.kind!=="normal")!;
      expect(ventricularSource(c,beat)?.id).toBe(source);
    }
    const c=fromPreset(presetById("vt")!);c.ventricularSource="representative_pvc";
    const imported=normalizeImportedCase(c);expect(imported.ventricularSource).toBe("representative_pvc");
    expect(caseContext(imported).preset).toBeUndefined();
    const a=synthesize(c,10),b=synthesize(imported,10);for(const l of LEADS)expect(a.leads[l]).toEqual(b.leads[l]);
    expect(normalizeCase({version:1}).ventricularSource).toBe("auto");
    expect(()=>normalizeCase({version:1,ventricularSource:"invented"})).toThrow();
  });
  it("applying controls does not mutate source templates",()=>{
    const before=JSON.stringify(VENTRICULAR_SOURCES);
    for(const id of ids)qrsKernels({...setup(id),qrsAmp:2,transition:.7,overload:"lv"},{time:0,rr:1,kind:"pvc"});
    expect(JSON.stringify(VENTRICULAR_SOURCES)).toBe(before);
  });
});
