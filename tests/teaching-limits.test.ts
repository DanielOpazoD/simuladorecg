import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LEADS, type Signal } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { fromPreset, presetById, PRESETS } from "../src/presets/catalog";
import { caseContext, caseReading, normalizeImportedCase } from "../src/presets/case-context";
import { repolarizationLimitations, WPW_REPOLARIZATION_LIMIT, SECONDARY_ST_RATIO_LIMIT } from "../src/presets/teaching-limits";
const load = (id: string) => fromPreset(presetById(id)!);

describe("Specific teaching limits, not repaired physiology", () => {
  it.each(["wpw", "lbbb", "sgarbossa", "vvi", "ddd"])("%s retains every sample and exposes its specific limit", (id) => {
    const c=load(id), original=structuredClone(c), before=synthesize(c,10);
    const restored=normalizeImportedCase(c), context=caseContext(restored);
    const warning=id==='wpw'?WPW_REPOLARIZATION_LIMIT:SECONDARY_ST_RATIO_LIMIT;
    expect(context.warnings).toContain(warning);
    expect(context.preset?.limitation).toContain(warning);
    expect(caseReading(c).title).toBe(c.name);
    const after=synthesize(restored,10);
    for(const lead of LEADS) expect(after.leads[lead],lead).toEqual(before.leads[lead]);
    expect(c).toEqual(original);expect(restored).toEqual(original);
  });
  it.each(["sinus", "rbbb", "aai"])("%s does not receive an unrelated limit",id=>{
    expect(repolarizationLimitations(load(id))).toEqual([]);
  });
  it("retains the warning after manual settings and supports combined acquisition",()=>{
    const c=load('lbbb');c.presetId='custom';c.name='Ejercicio';c.qrsAmp=.1;c.artifacts.reversed=true;
    expect(caseContext(c).warnings).toContain(SECONDARY_ST_RATIO_LIMIT);
    expect(caseReading(c).title).toBe('Registro con brazos invertidos');
    const aai=load('aai');aai.conduction='lbbb';
    expect(repolarizationLimitations(aai)).toEqual([SECONDARY_ST_RATIO_LIMIT]);
  });
  it("documents the existing absence of WPW secondary T rather than synthesizing a substitute",()=>{
    const c=load('wpw');c.filter='off';c.variability=0;
    const preexcited=synthesize(c,10), control=synthesize({...c,conduction:'normal'},10);
    const b=preexcited.events.beats.find(b=>b.time>3)!;
    let qrsChange=0, tChange=0;
    for(const lead of LEADS){
      for(let i=Math.ceil(b.time*preexcited.fs);i<Math.floor((b.time+b.qrs!)*preexcited.fs);i++)
        qrsChange=Math.max(qrsChange,Math.abs(preexcited.leads[lead][i]-control.leads[lead][i]));
      for(let i=Math.ceil((b.time+.210)*preexcited.fs);i<Math.floor((b.time+b.qt!)*preexcited.fs);i++)
        tChange=Math.max(tChange,Math.abs(preexcited.leads[lead][i]-control.leads[lead][i]));
    }
    expect(qrsChange).toBeGreaterThan(.02);expect(tChange).toBe(0);
    expect(caseContext(c).warnings).toContain(WPW_REPOLARIZATION_LIMIT);
  });
  it.each(['lbbb','vvi','ddd'])("%s exposes the non-proportional voltage response without calling it a diagnostic ratio",id=>{
    const c=load(id);c.filter='off';c.variability=0;c.qrsAmp=.1;
    const low=synthesize(c,10);c.qrsAmp=1;const high=synthesize(c,10);
    const read=(s:Signal)=>{
      const b=s.events.beats.find(b=>b.time>3)!;
      const q=s.leads.V2.slice(Math.ceil((b.time+.01)*s.fs),Math.floor((b.time+b.qrs!-.02)*s.fs));
      return {s:Math.abs(Math.min(...q)),st40:s.leads.V2[Math.round((b.time+b.qrs!+.040)*s.fs)]};
    };
    const a=read(low),b=read(high);
    expect(b.s/a.s).toBeCloseTo(10,6);
    expect(Math.abs(b.st40-10*a.st40)).toBeGreaterThan(.1);
    expect(caseContext(c).warnings).toContain(SECONDARY_ST_RATIO_LIMIT);
    // ST40 != J; this test cannot classify Sgarbossa or define normal physiology.
  });
  it("keeps the visible preset limits and the versioned state documents synchronized",()=>{
    const json=JSON.parse(readFileSync('docs/estado-presets.json','utf8'));
    const md=readFileSync('docs/estado-presets.md','utf8');
    for(const p of PRESETS){
      expect(json.find((r:{id:string})=>r.id===p.id).limitacion).toBe(p.limitation);
      expect(md).toContain(p.limitation);
    }
  });
});
