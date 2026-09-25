import { describe, expect, it } from "vitest";
import { LEADS, type Measurement, type Signal } from "../src/engine/types";
import { fromPreset, presetById } from "../src/presets/catalog";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import { auditMeasurement } from "../src/engine/analysis/model-audit";
import { PRACTICE, PRACTICE_IDS, practiceQuestion, practiceFeedback, sampledST } from "../src/ui/practice-feedback";
const c=fromPreset(presetById("inferior")!), signal=synthesize(c,10), measured=auditMeasurement(signal,measure(signal));
function fixture() {
  const s={fs:500,leads:Object.fromEntries(LEADS.map(l=>[l,new Float64Array(2500).fill(.03)]))} as Pick<Signal,"fs"|"leads">;
  const m=structuredClone(measured);
  m.evidence.qrs.status="usable";
  m.beats=[1,2,3].map(onset=>({...measured.beats[0],onset,offset:onset+.1,noise:0}));
  for(const b of m.beats) for(const l of LEADS) {
    const values: Partial<Record<typeof l,number>>={I:-.12,II:.14,III:.26,aVR:-.01,aVL:-.19,aVF:.20};
    s.leads[l][Math.round((b.offset+.06)*s.fs)]=.03+(values[l]??.2);
  }
  return {s,m};
}
describe("Practice evidence, not diagnostic classification",()=>{
  it("keeps the fourteen existing exercises and four distinct curated choices",()=>{
    expect(PRACTICE_IDS).toEqual(["sinus","af","flutter","wenckebach","complete","rbbb","lbbb","inferior","vt","bigeminy","av1","anterior","vvi","wellens_b"]);
    PRACTICE_IDS.forEach((id,i)=>{
      expect(presetById(id)?.strategy).not.toBe("pending");
      for(let position=0;position<4;position++){
        const q=practiceQuestion([i,position]);expect(q.id).toBe(id);
        expect(q.choices[position]).toBe(id);expect(new Set(q.choices).size).toBe(4);
        q.choices.forEach(option=>expect(PRACTICE_IDS).toContain(option));
      }
      expect(PRACTICE[id].leads.length).toBeGreaterThan(1);
    });
    expect(practiceQuestion([NaN,Infinity])).toEqual(practiceQuestion([0,0]));
  });
  it("reads calibrated samples using measured boundaries, independently of events/truth",()=>{
    const {s,m}=fixture();
    const guarded=new Proxy(s,{get(target,key,receiver){if(key==='events'||key==='truth')throw Error('forbidden reference');return Reflect.get(target,key,receiver);}});
    const st=sampledST(guarded,m)!;
    expect(st.II).toBeCloseTo(.14,12);expect(st.III).toBeCloseTo(.26,12);expect(st.I).toBeCloseTo(-.12,12);
    expect(practiceFeedback('inferior',c,guarded,m).observations.join(' ')).toContain('ST* III > II');
    for(const b of m.beats){s.leads.II[Math.round((b.offset+.06)*s.fs)]=.5; s.leads.I[Math.round((b.offset+.06)*s.fs)]=.2;}
    const text=practiceFeedback('inferior',c,guarded,m).observations.join(' ');
    expect(text).toContain('ST* II > III');expect(text).toContain('ST* positivo');
  });
  it.each(['review','unavailable'] as const)("abstains from ST when QRS is %s",status=>{
    const {s,m}=fixture();m.evidence.qrs.status=status;expect(sampledST(s,m)).toBeNull();
    expect(practiceFeedback('inferior',c,s,m).observations.join(' ')).not.toContain('ST* en');
  });
  it.each(['nan','short','baseline','few'])("rejects inadequate ST windows: %s",kind=>{
    const {s,m}=fixture();
    if(kind==='nan')for(const b of m.beats)s.leads.V1[Math.round((b.offset+.06)*s.fs)]=NaN;
    if(kind==='short')s.leads.V2=new Float64Array(3);
    if(kind==='baseline')for(const b of m.beats)s.leads.II[Math.round((b.onset-.03)*s.fs)]=1;
    if(kind==='few')m.beats=m.beats.slice(0,2);
    expect(sampledST(s,m)).toBeNull();
  });
  it.each(['reversed','muscle','filter','different'])("withdraws observational claims for %s",kind=>{
    const changed=structuredClone(c);
    if(kind==='reversed')changed.artifacts.reversed=true;
    if(kind==='muscle')changed.artifacts.muscle=.1;
    if(kind==='filter')changed.filter='monitor';
    if(kind==='different')changed.hr=110;
    const result=practiceFeedback('inferior',changed,signal,measured);
    expect(result.observations.join(' ')).toContain('retirada');
    expect(result.observations.join(' ')).not.toMatch(/III > II|ST\* en/);
  });
  it("does not replace unavailable values with configured intervals",()=>{
    const m=structuredClone(measured);m.hr=m.pr=m.qrs=null;
    for(const key of ['hr','pr','qrs'] as const)m.evidence[key].status='unavailable';
    const text=practiceFeedback('inferior',c,signal,m).observations.join(' ');
    expect(text).toContain('No hay medidas');expect(text).not.toMatch(/160|90 ms|72 lpm/);
  });
  it("does not alter the case, estimated values or twelve sampled leads",()=>{
    const copy=structuredClone(signal),before=structuredClone(c),values=structuredClone(measured);
    const result=practiceFeedback('inferior',c,signal,measured);
    expect(result.observations.join(' ')).toContain('ST* III > II');
    expect(result.limitations.join(' ')).toMatch(/no confirma ni excluye/);
    for(const lead of LEADS)expect(signal.leads[lead]).toEqual(copy.leads[lead]);
    expect(c).toEqual(before);expect(measured).toEqual(values);
  });
  it("retains specific P2 limitations in wide-QRS exercises",()=>{
    const c=fromPreset(presetById('lbbb')!);
    const f=practiceFeedback('lbbb',c,null,null);
    expect(f.limitations.join(' ')).toMatch(/no está calibrada/);
    expect(f.cue).toMatch(/secundarios/);
  });
});
