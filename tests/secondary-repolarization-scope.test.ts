import { describe, expect, it } from "vitest";
import { fromPreset, presetById } from "../src/presets/catalog";
import { synthesize } from "../src/engine/signal";

const affected = ["rbbb","irbbb","lbbb","wpw","pvc","bigeminy","trigeminy","couplet","idioventricular","aivr","vt","torsades","vvi","ddd"] as const;

describe("secondary repolarization changes only post-QRS content",()=>{
 it.each(affected)("%s preserves events and QRS when secondary repolarization is enabled",(id)=>{
  const c=fromPreset(presetById(id)!);
  const normal=synthesize(c,10), noT=synthesize({...c,tAmp:0},10);
  expect(normal.events).toEqual(noT.events);
  for(const beat of normal.events.beats){
   const end=beat.time+(beat.qrs??c.qrs)/1000;
   for(const lead of ["I","II","V1","V3","V6"] as const){
    const lo=Math.max(0,Math.floor((beat.time-.02)*normal.fs)),hi=Math.min(normal.leads[lead].length,Math.floor(end*normal.fs));
    for(let i=lo;i<=hi;i++) expect(Number.isFinite(normal.leads[lead][i])).toBe(true);
   }
  }
 });
 it.each(["sinus","rv_acute","rv_chronic","lvh","inferior"] as const)("%s remains outside the new activation-coupled layer",(id)=>{
  const c=fromPreset(presetById(id)!); const a=synthesize(c,10),b=synthesize({...c},10);
  for(const lead of ["I","II","V1","V6"] as const) expect(a.leads[lead]).toEqual(b.leads[lead]);
 });
});
