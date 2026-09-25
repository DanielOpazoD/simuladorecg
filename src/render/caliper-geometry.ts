import type { ECGCase } from "../engine/types";
import { leadGain } from "../engine/lead-registry";
import type { Caliper, Layout } from "./ecg";
type View = Pick<ECGCase["view"], "speed" | "gain" | "chestGain">;
export type Endpoint = 1 | 2;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
/** Geometric manual measurement. Does not read or modify any sampled ECG. */
export function caliperMeasurement(cal: Caliper, l: Layout, v: View) {
  return { ms:Math.abs(cal.x2-cal.x1)/v.speed*1000, mm:Math.abs(cal.y2-cal.y1),
    mv:Math.abs(cal.y2-cal.y1)/leadGain(l.segments[cal.segment].lead,v) };
}
export function caliperPosition(cal: Caliper, end: Endpoint, l: Layout, v: View) {
  const seg=l.segments[cal.segment],x=end===1?cal.x1:cal.x2,y=end===1?cal.y1:cal.y2;
  return { timeMs:(seg.start+(x-seg.x)/v.speed)*1000, voltageMv:(seg.baseline-y)/leadGain(seg.lead,v) };
}
/** Same sample-sized horizontal / 0.01 mV vertical grid for pointer and keyboard.
 * This is interaction resolution, not waveform quantization or clinical accuracy. */
export function placeCaliper(cal: Caliper, end: Endpoint, point: {x:number;y:number}, l: Layout, v: View, fs:number):Caliper {
  const seg=l.segments[cal.segment],gain=seg&&leadGain(seg.lead,v);
  if (!seg || ![point.x,point.y,fs,v.speed,gain].every(Number.isFinite) || fs<=0 || v.speed<=0 || gain<=0) throw Error("Coordenadas o escala no válidas");
  const x=clamp(seg.x+Math.round((point.x-seg.x)/v.speed*fs)/fs*v.speed,seg.x,seg.x+seg.width);
  const y=clamp(seg.baseline-Math.round((seg.baseline-point.y)/gain*100)/100*gain,seg.y,seg.y+seg.height);
  return end===1 ? {...cal,x1:x,y1:y} : {...cal,x2:x,y2:y};
}
export function initialCaliper(l:Layout,v:View,fs:number,segment=0):Caliper {
  const seg=l.segments[segment];if(!seg)throw Error("Tramo no disponible");
  let cal:Caliper={x1:seg.x,y1:seg.baseline,x2:seg.x,y2:seg.baseline,segment};
  cal=placeCaliper(cal,1,{x:seg.x+v.speed*Math.min(.2,seg.duration/4),y:seg.baseline},l,v,fs);
  return placeCaliper(cal,2,{x:seg.x+v.speed*Math.min(.4,seg.duration/2),y:seg.baseline},l,v,fs);
}
export function moveCaliper(cal:Caliper,end:Endpoint,key:string,l:Layout,v:View,fs:number,fast=false):Caliper {
  const gain=leadGain(l.segments[cal.segment].lead,v),step=fast?10:1;
  const point={x:end===1?cal.x1:cal.x2,y:end===1?cal.y1:cal.y2};
  if(key==='ArrowLeft')point.x-=v.speed/fs*step;
  else if(key==='ArrowRight')point.x+=v.speed/fs*step;
  else if(key==='ArrowUp')point.y-=gain*.01*step;
  else if(key==='ArrowDown')point.y+=gain*.01*step;
  return placeCaliper(cal,end,point,l,v,fs);
}
