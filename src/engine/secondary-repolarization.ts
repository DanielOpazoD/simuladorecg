import {preexcitedActivationReference} from "./ventricular-components";
import { kernelWeight } from "./regional-activation";
import type { Beat, ECGCase } from "./types";
import type { Kernel } from "./morphology";
import { project, type Vec } from "./leads";
import { ventricularSource } from "./ventricular-source";
import { T_REFERENCE_AMPLITUDE } from "./regional-repolarization";

export type SecondaryRepolarizationMode = "none" | "mean-qrs" | "terminal-qrs" | "preexcited-qrs";
export interface SecondaryRepolarization { mode: SecondaryRepolarizationMode; t: Vec | null; st: Vec | null; reference: Vec | null; }

function integrated(ks: readonly Kernel[], predicate: (k: Kernel) => boolean): Vec {
  const v: Vec = [0, 0, 0];
  for (const k of ks) if (predicate(k)) for (let j=0;j<3;j++) v[j] += k.v[j] * kernelWeight(k);
  return v;
}
function opposite(reference: Vec, frontalAmplitude: number): Vec | null {
  const p=project(reference), amp=Math.hypot(p.I,(2*p.II-p.I)/Math.sqrt(3));
  if (!Number.isFinite(amp)||amp<1e-9) return null;
  const s=frontalAmplitude/amp;
  return [-reference[0]*s,-reference[1]*s,-reference[2]*s];
}
export function secondaryRepolarization(c: ECGCase,b: Beat,ks: readonly Kernel[]): SecondaryRepolarization {
  const source=ventricularSource(c,b);
  let mode:SecondaryRepolarizationMode="none", reference:Vec|null=null;
  if(source||c.conduction==="lbbb"){mode="mean-qrs";reference=integrated(ks,()=>true);}
  else if(c.conduction.includes("rbbb")||c.conduction==="irbbb"){
    mode="terminal-qrs";
    // Region identity, not relative QRS phase: an early LV basis can pass .55
    // in a shorter complex without becoming delayed right-ventricular tissue.
    const regional=ks.some(k=>k.regional), delayed=integrated(ks,k=>
      regional ? k.regional?.region==="rv-delayed" : k.mu>=.55);
    reference=Math.hypot(...delayed)>1e-9?delayed:integrated(ks,()=>true);
  }
  if(!source&&c.conduction==="wpw"&&b.kind==="normal"){
    mode="preexcited-qrs";reference=preexcitedActivationReference(c,ks,c.qrs/1000);
  }
  if(!reference)return{mode,t:null,st:null,reference:null};
  // Illustrative secondary ST scales with source strength, independently of T gain.
  const st=c.rhythm === "torsades" ? null : reference.map(v=>-.20*v) as Vec;
  return{mode,t:opposite(reference,T_REFERENCE_AMPLITUDE*.9),st,reference};
}
/** Frontal-plane dot product, not a 3D angle or a diagnostic criterion.
 * I and II are 60° apart; convert both to orthogonal frontal coordinates.
 */
export function secondaryDiscordanceDot(reference: Vec, repolarization: Vec): number {
  const q = project(reference), r = project(repolarization);
  const qy = (2 * q.II - q.I) / Math.sqrt(3);
  const ry = (2 * r.II - r.I) / Math.sqrt(3);
  return q.I * r.I + qy * ry;
}

/** Compact C1 secondary ST support. It overlaps late ventricular activation,
 * reaches J smoothly and joins the ascending T limb without extending QT.
 * Times and amplitude are illustrative engineering choices, not calibration.
 */
export function secondarySTEnvelope(time: number, j: number, tStart: number, tDuration: number): number {
  const start=j-.040, end=tStart+tDuration*.5;
  if(time<=start||time>=end)return 0;
  const smooth=(x:number)=>{const a=Math.max(0,Math.min(1,x));return a*a*(3-2*a);};
  return smooth((time-start)/.040)*(1-smooth((time-tStart)/(end-tStart)));
}
