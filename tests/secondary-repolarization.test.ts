import { describe, expect, it } from "vitest";
import { qrsKernels } from "../src/engine/morphology";
import { secondaryDiscordanceDot, secondaryRepolarization } from "../src/engine/secondary-repolarization";
import { fromPreset, presetById } from "../src/presets/catalog";
import { synthesize } from "../src/engine/signal";

function firstBeat(id:string){const c=fromPreset(presetById(id)!);const s=synthesize(c,10);const b=s.events.beats[0];return{c,b,ks:qrsKernels(c,b)};}
describe("QRS-coupled secondary repolarization",()=>{
 it.each([["lbbb","mean-qrs"],["rbbb","terminal-qrs"],["wpw","delta"],["vvi","mean-qrs"],["vt","mean-qrs"]] as const)("%s derives T from %s",(id,mode)=>{
  const{c,b,ks}=firstBeat(id);const r=secondaryRepolarization(c,b,ks);expect(r.mode).toBe(mode);expect(r.reference).not.toBeNull();expect(r.t).not.toBeNull();expect(secondaryDiscordanceDot(r.reference!,r.t!)).toBeLessThan(0);
 });
 it("follows requested LBBB axis instead of a fixed T template",()=>{
  const base=fromPreset(presetById("lbbb")!),a={...base,axis:-40},b={...base,axis:100};
  const sa=synthesize(a,10),sb=synthesize(b,10),ba=sa.events.beats[0],bb=sb.events.beats[0];
  const ra=secondaryRepolarization(a,ba,qrsKernels(a,ba)),rb=secondaryRepolarization(b,bb,qrsKernels(b,bb));
  expect(ra.t).not.toEqual(rb.t);expect(secondaryDiscordanceDot(ra.reference!,ra.t!)).toBeLessThan(0);expect(secondaryDiscordanceDot(rb.reference!,rb.t!)).toBeLessThan(0);
 });
 it("uses delayed terminal activation for RBBB",()=>{const{c,b,ks}=firstBeat("rbbb");const r=secondaryRepolarization(c,b,ks);const mean=ks.reduce((v,k)=>v.map((x,j)=>x+k.v[j]*k.sigma) as [number,number,number],[0,0,0] as [number,number,number]);expect(r.reference).not.toEqual(mean);});
 it("does not add this layer to uncomplicated sinus rhythm",()=>{const{c,b,ks}=firstBeat("sinus");expect(secondaryRepolarization(c,b,ks)).toEqual({mode:"none",t:null,st:null,reference:null});});
});
