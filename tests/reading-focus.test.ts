import { describe, expect, it } from "vitest";
import { cloneCase, DEFAULT_CASE, LEADS, type Signal } from "../src/engine/types";
import { paperLayout } from "../src/render/ecg";
import { findingBoxes, findingTarget, leadWindow, sampleExtent } from "../src/ui/reading-focus";
import { enlargedTrace } from "../src/ui/lead-explorer";
import { projectionSvg } from "../src/ui/st-distribution";

function fixture(): Signal {
  return { fs:500, duration:10, leads:Object.fromEntries(LEADS.map(l=>[l,Float64Array.from({length:5000},(_,i)=>i/5000)])) as Signal["leads"],
    events:{atria:[],spikes:[],beats:[1,3,6,8].map(time=>({time,kind:"normal",rr:2,qrs:.12,qt:.4}))},
    truth:{hr:30,pr:null,qrs:120,qt:400,axis:null},warnings:[] };
}
describe("reading aids use the acquired cell's coordinates",()=>{
  it("selects a second-column beat, and displays a sample fragment without invented beats",()=>{
    const c=cloneCase(DEFAULT_CASE);c.view.format="6x2";c.view.timing="sequential";
    const seg=paperLayout(c,1000).segments.find(s=>s.lead==="V2")!,s=fixture();
    const w=leadWindow(s,seg,8)!;expect(w.beat).toBe(3);expect(w.start).toBe(7.8);expect(w.end).toBe(8.6);
    s.events.beats=[];const raw=leadWindow(s,seg,7)!;expect(raw.beat).toBeNull();expect([raw.start,raw.end]).toEqual([6,8]);
  });
  it.each([false,true])("projects final-sample bounds using chest gain and signed Cabrera polarity (%s)",cabrera=>{
    const c=cloneCase(DEFAULT_CASE);Object.assign(c.view,{format:"6x2",timing:"sequential",speed:50,gain:5,chestGain:20,cabrera});
    const s=fixture(),before=structuredClone(s),layout=paperLayout(c,1000,4,30);
    for(const lead of ["V2","aVR"] as const){
      const boxes=findingBoxes(s,layout,c,{focus:"qrs",leads:[lead]});expect(boxes).toHaveLength(1);
      const b=boxes[0],seg=layout.segments.find(x=>x.lead===lead)!,gain=lead==="V2"?20:5,polarity=cabrera&&lead==="aVR"?-1:1;
      expect(b.x).toBeCloseTo(seg.x+(b.start-seg.start)*50,10);expect(b.width).toBeCloseTo(6,10);
      expect(b.low).toBeCloseTo(b.start/10,12);expect(b.high).toBeCloseTo(b.end/10,12);
      expect(b.y).toBeCloseTo(seg.baseline-Math.max(b.low*polarity,b.high*polarity)*gain-1,10);
    }
    expect(s).toEqual(before);
  });
  it("rejects missing, nonfinite, overlapping and off-sheet windows",()=>{
    const s=fixture(),c=cloneCase(DEFAULT_CASE),layout=paperLayout(c,1000);
    s.events.beats=[{time:2.48,kind:"normal",rr:1,qrs:.12,qt:.4}];
    expect(findingBoxes(s,layout,c,{focus:"qrs",leads:["I"]})).toEqual([]);
    s.events.beats=[{time:1,kind:"normal",rr:.1,qrs:.2},{time:1.1,kind:"normal",rr:.1}];
    expect(findingBoxes(s,layout,c,{focus:"qrs",leads:["I"]})).toEqual([]);
    s.leads.I.fill(NaN);expect(sampleExtent(s,"I",0,1)).toBeNull();expect(leadWindow(s,layout.segments[0])).toBeNull();
    expect(sampleExtent(fixture(),"I",-1,1)).toBeNull();expect(sampleExtent(fixture(),"I",0,11)).toBeNull();
  });
  it("does not illustrate a premature wide complex with a normal beat or contextual clinical advice",()=>{
    const s=fixture(),c=cloneCase(DEFAULT_CASE),l=paperLayout(c,1000);
    expect(findingBoxes(s,l,c,findingTarget("QRS ancho prematuro")!)).toEqual([]);
    s.events.beats[0].kind="pvc";expect(findingBoxes(s,l,c,findingTarget("QRS ancho prematuro")!)).not.toHaveLength(0);
    expect(findingTarget("La arteria no se determina solo por ECG")).toBeUndefined();
    expect(findingTarget("El diagnóstico de IAM requiere contexto y troponina")).toBeUndefined();
    expect(findingTarget("U prominente")).toBeUndefined();
  });
  it("keeps every acquired sample in the enlarged trace and reverses the aVR orientation with Cabrera",()=>{
    const s=fixture(),w=sampleExtent(s,"aVR",1,1.12)!;
    const svg=enlargedTrace(s,"aVR",w,-1),path=svg.match(/class="lead-sample-path" d="([^"]+)/)![1];
    expect(path.match(/[ML]/g)).toHaveLength(61);expect(svg).toContain("−aVR");
    const normal=projectionSvg("aVR","all"),inverted=projectionSvg("aVR","all",true);
    expect(inverted).toContain("−aVR");expect(inverted).not.toEqual(normal);
  });
});
