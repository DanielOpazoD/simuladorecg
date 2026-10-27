import { describe, expect, it } from "vitest";
import { cloneCase, DEFAULT_CASE, LEADS, type Signal } from "../src/engine/types";
import { ECHO_SEGMENTS, ECHO_VIEWS, ECHO_DELAY_S, teachingEchoScenario, teachingEchoCycle, teachingContraction, wallGeometry, teachingEchoSvg, teachingAnatomySvg } from "../src/ui/teaching-echo";

function signal(): Signal {
  return { fs:500, duration:5, leads:Object.fromEntries(LEADS.map(l => [l,new Float64Array(2500)])) as Signal["leads"], events:{atria:[],spikes:[],beats:[1,1.8,2.7].map(time => ({time,rr:.8,kind:"normal" as const}))}, truth:{hr:75,pr:160,qrs:90,qt:400,axis:60}, warnings:[] };
}

describe("illustrative echo scope and mechanical assignment", () => {
  it("has exactly16named motion segments with no apical-cap score", () => {
    expect(ECHO_SEGMENTS.map(s => s.id)).toEqual(Array.from({length:16},(_,i)=>i+1));
    expect(new Set(ECHO_SEGMENTS.map(s=>s.name)).size).toBe(16);
  });
  it("maps standard apical/parasternal walls independently of any ECG samples", () => {
    expect(ECHO_VIEWS.A4C.walls).toEqual([[3,9,14],[6,12,16]]);
    expect(ECHO_VIEWS.A2C.walls).toEqual([[4,10,15],[1,7,13]]);
    expect(ECHO_VIEWS.PLAX.segments).toEqual([2,8,5,11]);
    expect(ECHO_VIEWS.PSAX.segments).toEqual([7,8,9,10,11,12]);
    expect(new Set(Object.values(ECHO_VIEWS).flatMap(v=>v.segments))).toEqual(new Set(Array.from({length:16},(_,i)=>i+1)));
  });
  it("normal is a negative control: all regions remain assigned normal", () => {
    const result=teachingEchoScenario(cloneCase(DEFAULT_CASE));
    expect(result.available).toBe(true); expect(result.affected).toEqual([]);
    expect(new Set(Object.values(result.motion))).toEqual(new Set(["normal"]));
  });
  it.each(["anterior","lateral","inferior_rca","inferior_lcx","posterior"] as const)("%s is an explicit illustrative family, not a culprit classifier", ischemia => {
    const c={...cloneCase(DEFAULT_CASE),ischemia}; const result=teachingEchoScenario(c);
    expect(result.available).toBe(true); expect(result.affected.length).toBeGreaterThan(0);
    expect(result.affected.every(id=>result.motion[id]==="hypo")).toBe(true);
    expect(result.reason).toMatch(/ilustrativa/);
  });
  it("ST amplitude, phase labels, noise/filter/gain and electrode reversal cannot change mechanics", () => {
    const c={...cloneCase(DEFAULT_CASE),ischemia:"anterior" as const}; const base=teachingEchoScenario(c);
    for(const phase of ["hyperacute","acute","evolving","chronic"] as const) for(const st of [0,.1,9]) {
      const other={...c,phase,st,filter:"monitor" as const,artifacts:{...c.artifacts,reversed:true,muscle:.9},view:{...c.view,gain:20}};
      expect(teachingEchoScenario(other)).toEqual(base);
    }
  });
  it.each(["af","flutter","junctional","idioventricular","vt","torsades","vf","asystole","paced"] as const)("declines unsupported rhythm%s", rhythm=>expect(teachingEchoScenario({...cloneCase(DEFAULT_CASE),rhythm}).available).toBe(false));
  it.each(["diffuse","subendo","wellens_a","wellens_b","de_winter","pericarditis","sgarbossa","rv"] as const)("declines unsupported mechanical assignment%s", ischemia=>expect(teachingEchoScenario({...cloneCase(DEFAULT_CASE),ischemia}).available).toBe(false));
  it("declines conduction/ectopy/AV/overload/electrolyte rather than drawing a normal echo",()=>{
    const c=cloneCase(DEFAULT_CASE);
    for(const patch of [{conduction:"lbbb"},{av:"first"},{ectopy:"pvc"},{overload:"lv"},{electrolyte:"hyperkalemia"},{activationModel:"regional-rbbb-v1"}] as const)
      expect(teachingEchoScenario({...c,...patch}).available).toBe(false);
  });
  it("does not mutate the configured case",()=>{
    const c={...cloneCase(DEFAULT_CASE),ischemia:"inferior_rca" as const}, before=JSON.stringify(c);
    const result=teachingEchoScenario(c); result.motion[4]="dys";
    expect(JSON.stringify(c)).toBe(before); expect(teachingEchoScenario(c).motion[4]).toBe("hypo");
  });
});

describe("time contract and geometry with independent negative controls",()=>{
  it("uses the next actual QRS rather than the configured or previous RR",()=>{
    const s=signal(); s.events.beats[0].rr=2;
    expect(teachingEchoCycle(s,0)).toEqual({start:1,end:1.8,rr:.8});
    expect(teachingEchoCycle(s,1)?.rr).toBeCloseTo(.9);
  });
  it("uses bounded RR only at the last complete cycle",()=>{
    const s=signal(); expect(teachingEchoCycle(s,2)?.end).toBe(3.5);
    s.events.beats[2].time=4.8; expect(teachingEchoCycle(s,2)).toBeNull();
  });
  it("rejects missing/truncated/invalid event cycles",()=>{
    const s=signal(); expect(teachingEchoCycle(s,-1)).toBeNull(); expect(teachingEchoCycle(s,.5)).toBeNull(); expect(teachingEchoCycle(s,99)).toBeNull();
    s.events.beats[1].time=.9; expect(teachingEchoCycle(s,0)).toBeNull();
    s.events.beats[1].time=1.8; s.events.beats[1].kind="pvc"; expect(teachingEchoCycle(s,0)).toBeNull();
    s.events.beats[1].kind="normal"; s.leads.V3=new Float64Array(700); expect(teachingEchoCycle(s,0)).toBeNull();
  });
  it("does not change samples or events while selecting cycles",()=>{
    const s=signal(), before=JSON.stringify(s); teachingEchoCycle(s,0); teachingEchoCycle(s,2); expect(JSON.stringify(s)).toBe(before);
  });
  it("delays contraction until the declared80ms and returns to rest within the cycle",()=>{
    expect(ECHO_DELAY_S).toBe(.08);
    for(const t of [-1,0,.04,.08,.49,.8,1,NaN]) expect(teachingContraction(t,.8)).toBe(0);
    expect(teachingContraction(.28,.8)).toBeCloseTo(1);
    expect(teachingContraction(.14,.3)).toBeGreaterThan(0);
    expect(teachingContraction(.2,0)).toBe(0);
  });
  it("normal thickens and moves inward, hypo less, aki neither, dys outward and thinner",()=>{
    expect(wallGeometry("normal",0)).toEqual({excursion:0,thickness:1});
    expect(wallGeometry("aki",1)).toEqual({excursion:0,thickness:1});
    const normal=wallGeometry("normal",1), hypo=wallGeometry("hypo",1), dys=wallGeometry("dys",1);
    expect(normal.excursion).toBeGreaterThan(hypo.excursion); expect(hypo.excursion).toBeGreaterThan(0);
    expect(normal.thickness).toBeGreaterThan(hypo.thickness); expect(hypo.thickness).toBeGreaterThan(1);
    expect(dys.excursion).toBeLessThan(0); expect(dys.thickness).toBeLessThan(1); expect(dys.thickness).toBeGreaterThan(0);
    expect(wallGeometry("normal",NaN)).toEqual({excursion:0,thickness:1});
  });
  it.each(["PLAX","PSAX","A4C","A2C"] as const)("draws only the expected view segments in%s, without invented quantitative indices",view=>{
    const motion=teachingEchoScenario(cloneCase(DEFAULT_CASE)).motion, html=teachingEchoSvg(view,motion,1);
    expect([...html.matchAll(/data-echo-segment="(\d+)"/g)].map(m=>Number(m[1]))).toEqual(ECHO_VIEWS[view].segments);
    expect(html).not.toMatch(/NaN|Infinity|WMSI|FEVI/);
    expect(html).toContain("no imagen ecográfica adquirida");
  });
  it("manual rotation changes projection while preserving segment identities",()=>{
    const a=teachingAnatomySvg(0,1,new Set([1]),new Set([1,7]));
    const b=teachingAnatomySvg(90,1,new Set([1]),new Set([1,7]));
    expect(a).not.toEqual(b);
    for(const svg of [a,b]) expect(new Set([...svg.matchAll(/data-echo-segment="(\d+)"/g)].map(m=>Number(m[1])))).toEqual(new Set(Array.from({length:16},(_,i)=>i+1)));
  });
});

describe("continuous regional boundaries",()=>{
  const paths=(svg:string)=>new Map([...svg.matchAll(/data-echo-segment="(\d+)"[^>]*d="([^"]+)"/g)].map(m=>[Number(m[1]),[...m[2].matchAll(/(?:M|L)([-\d.]+),([-\d.]+)/g)].map(p=>[Number(p[1]),Number(p[2])])]));
  it.each(["PLAX","PSAX","A4C","A2C"] as const)("keeps adjoining inner and outer borders connected in%s",view=>{
    const motion=teachingEchoScenario(cloneCase(DEFAULT_CASE)).motion;
    for(const s of ECHO_SEGMENTS) motion[s.id]=["normal","hypo","aki","dys"][s.id%4] as typeof motion[number];
    const p=paths(teachingEchoSvg(view,motion,1));
    const walls=view==="PSAX"?[ECHO_VIEWS.PSAX.segments]:ECHO_VIEWS[view].walls;
    for(const wall of walls) for(let i=0;i<(view==="PSAX"?wall.length:wall.length-1);i++){
      const a=p.get(wall[i])!, b=p.get(wall[(i+1)%wall.length])!, half=a.length/2;
      expect(a[half-1]).toEqual(b[0]); expect(a[half]).toEqual(b[b.length-1]);
    }
  });
  it.each(["PLAX","PSAX","A4C","A2C"] as const)("an entirely akinetic illustrative view remains stationary in%s",view=>{
    const motion=Object.fromEntries(ECHO_SEGMENTS.map(s=>[s.id,"aki" as const]));
    expect(teachingEchoSvg(view,motion,0)).toEqual(teachingEchoSvg(view,motion,1));
  });
});

it("rejects absent channels and nonfinite duration instead of inventing a complete cycle",()=>{
  const s=signal(); s.duration=NaN; expect(teachingEchoCycle(s,0)).toBeNull();
  s.duration=5; delete (s.leads as Partial<Signal['leads']>).V2; expect(teachingEchoCycle(s,0)).toBeNull();
});

it("keeps manual regional motion color linked between anatomy and echo",()=>{
  const motion=teachingEchoScenario(cloneCase(DEFAULT_CASE)).motion; motion[13]='dys';
  const svg=teachingAnatomySvg(90,13,new Set(),new Set(),motion);
  expect(svg).toMatch(/data-echo-segment="13" class="anatomy-segment anatomy-dys anatomy-selected"/);
});
