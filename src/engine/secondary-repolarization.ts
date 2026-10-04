import { kernelWeight } from "./regional-activation";
import type { Beat, ECGCase } from "./types";
import type { Kernel } from "./morphology";
import { project, type Vec } from "./leads";
import { ventricularSource } from "./ventricular-source";
import { T_REFERENCE_AMPLITUDE } from "./regional-repolarization";

export type SecondaryRepolarizationMode = "none" | "mean-qrs" | "terminal-qrs";
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
  if(!reference)return{mode,t:null,st:null,reference:null};
  // Secondary ST is explicitly not represented; do not infer normal ST from null.
  return{mode,t:opposite(reference,T_REFERENCE_AMPLITUDE*.9),st:null,reference};
}
export function secondaryDiscordanceDot(reference:Vec,repolarization:Vec):number{
  const q=project(reference),r=project(repolarization); return q.I*r.I+q.II*r.II;
}
